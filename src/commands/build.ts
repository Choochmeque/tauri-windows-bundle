import * as fs from 'node:fs';
import * as path from 'node:path';
import type { BuildOptions, MergedConfig } from '../types.js';
import { DEFAULT_MIN_WINDOWS_VERSION, DEFAULT_RUNNER, validateCapabilities } from '../types.js';
import {
  findProjectRoot,
  readTauriConfig,
  readTauriWindowsConfig,
  readBundleConfig,
  getWindowsDir,
  resolveVersion,
  toFourPartVersion,
} from '../core/project-discovery.js';
import { jsonMergePatch } from '../utils/merge.js';
import { mergeFileAssociations } from '../core/file-associations.js';
import { prepareAppxContent, resolveCargoTargetDir } from '../core/appx-content.js';
import { generateAssets } from '../generators/assets.js';
import {
  spawnAsync,
  execAsync,
  execWithProgress,
  isMsixbundleCliInstalled,
  getMsixbundleCliVersion,
  isVersionSufficient,
  MIN_MSIXBUNDLE_CLI_VERSION,
  promptInstall,
  resolveBundledMsixbundleCliPath,
  resolveMsixbundleCliCommand,
  resolveMakepriCommand,
} from '../utils/exec.js';
import { getDefaultLanguageFromManifestFile, resolveExecutableName } from '../core/manifest.js';

/**
 * Generate a single merged `resources.pri` per appx directory that contains ALL
 * languages and scales.
 *
 * By default `makepri` (driven by the `<packaging>` section of the generated
 * priconfig) splits non-default languages and scales into separate
 * resource-package indexes (`resources.language-*.pri`, `resources.scale-*.pri`).
 * Those split indexes are only consumed for resource packages declared inside a
 * bundle; a standalone `.msix` loads only the main `resources.pri`. As a result,
 * localized manifest values such as `ms-resource:Resources/PackageDisplayName`
 * silently fall back to the default language (e.g. the app name stays English on
 * a Chinese system).
 *
 * To avoid that we strip the `<packaging>` section from the priconfig so
 * `makepri` merges every language and scale into one `resources.pri`. This runs
 * `makepri` directly, resolved from the installed Windows SDK (see
 * `resolveMakepriPath`) or, failing that, from PATH.
 */
async function generateMergedResourceIndex(
  appxDirs: { arch: string; dir: string }[],
  defaultLanguage: string,
  keepConfig: boolean
): Promise<void> {
  const makepri = resolveMakepriCommand();
  for (const { arch, dir } of appxDirs) {
    const priconfig = path.join(dir, '..', `priconfig-${arch}.xml`);
    const manifest = path.join(dir, 'AppxManifest.xml');
    const pri = path.join(dir, 'resources.pri');

    // Remove stale PRI files (including previously split ones) and a kept
    // priconfig.xml from an earlier build so makepri does not index them.
    for (const entry of fs.readdirSync(dir)) {
      if (/^resources.*\.pri$/i.test(entry) || /^priconfig\.xml$/i.test(entry)) {
        fs.rmSync(path.join(dir, entry), { force: true });
      }
    }

    try {
      await execAsync(
        `${makepri} createconfig /cf "${priconfig}" /dq ${defaultLanguage} /pv 10.0.0 /o`
      );
      const config = fs
        .readFileSync(priconfig, 'utf-8')
        .replace(/<packaging>[\s\S]*?<\/packaging>/i, '');
      fs.writeFileSync(priconfig, config);
      await execAsync(`${makepri} new /pr . /cf "${priconfig}" /mn "${manifest}" /of "${pri}" /o`, {
        cwd: dir,
      });
      if (keepConfig) {
        // Copied in only after indexing so it is not itself a resource input.
        fs.copyFileSync(priconfig, path.join(dir, 'priconfig.xml'));
      }
    } finally {
      // The working priconfig lives outside the appx dir so makepri never
      // indexes it; clean it up regardless of success.
      fs.rmSync(priconfig, { force: true });
    }
  }
}

export async function build(options: BuildOptions): Promise<void> {
  console.log('Building MSIX package...\n');

  // Check if msixbundle-cli is available (either bundled sidecar or on PATH)
  const bundledPath = resolveBundledMsixbundleCliPath();
  if (bundledPath && options.verbose) {
    console.log(`Using bundled msixbundle-cli: ${bundledPath}`);
  }

  if (!(await isMsixbundleCliInstalled())) {
    if (process.platform === 'win32') {
      console.error(
        'msixbundle-cli is not available.\n' +
          'The bundled @choochmeque/msixbundle-cli-win32 sidecar should have been installed via optionalDependencies.\n' +
          'Possible causes: --omit=optional / --no-optional was passed, a restrictive registry mirror, or an unsupported CPU architecture.\n' +
          'Reinstall with: npm install (or pnpm install / yarn install) without that flag.\n' +
          'Fallback: cargo install msixbundle-cli'
      );
      process.exit(1);
    }

    const shouldInstall = await promptInstall(
      'msixbundle-cli is required but not installed.\n' + 'Install it now? (requires Rust/Cargo)'
    );

    if (shouldInstall) {
      try {
        await execWithProgress('cargo install msixbundle-cli', {
          verbose: options.verbose,
          message: 'Installing msixbundle-cli...',
        });
      } catch (error) {
        console.error('Failed to install msixbundle-cli:', error);
        console.log('\nInstall manually: cargo install msixbundle-cli');
        console.log('Or from: https://github.com/Choochmeque/msixbundle-rs');
        process.exit(1);
      }
    } else {
      console.log('\nInstall manually: cargo install msixbundle-cli');
      console.log('Or from: https://github.com/Choochmeque/msixbundle-rs');
      process.exit(1);
    }
  }

  // Check msixbundle-cli version
  const version = await getMsixbundleCliVersion();
  if (!version) {
    console.error('Could not determine msixbundle-cli version');
    process.exit(1);
  }

  if (!isVersionSufficient(version, MIN_MSIXBUNDLE_CLI_VERSION)) {
    console.error(
      `msixbundle-cli version ${version} is too old. Minimum required: ${MIN_MSIXBUNDLE_CLI_VERSION}`
    );
    console.log('Update with: cargo install msixbundle-cli --force');
    process.exit(1);
  }

  const projectRoot = findProjectRoot();
  const windowsDir = getWindowsDir(projectRoot);

  // Read configs
  let tauriConfig = readTauriConfig(projectRoot);
  const windowsConfig = readTauriWindowsConfig(projectRoot);
  if (windowsConfig) {
    tauriConfig = jsonMergePatch(tauriConfig, windowsConfig);
  }
  const bundleConfig = readBundleConfig(windowsDir);

  // Validate capabilities
  if (bundleConfig.capabilities) {
    const errors = validateCapabilities(bundleConfig.capabilities);
    if (errors.length > 0) {
      console.error('Invalid capabilities in bundle.config.json:');
      for (const error of errors) {
        console.error(`  - ${error}`);
      }
      process.exit(1);
    }
  }

  // Resolve publisher with fallback to tauriConfig
  const publisher = bundleConfig.publisher || tauriConfig.bundle?.publisher;
  if (!publisher) {
    console.error(
      'Publisher is required. Set it in bundle.config.json or in tauri.conf.json / tauri.windows.conf.json under bundle.publisher'
    );
    process.exit(1);
  }

  const publisherDisplayName = bundleConfig.publisherDisplayName || publisher;

  // Merge config
  const config: MergedConfig = {
    displayName: tauriConfig.productName || 'App',
    version: toFourPartVersion(
      resolveVersion(tauriConfig.version || '1.0.0', path.join(projectRoot, 'src-tauri'))
    ),
    description: tauriConfig.bundle?.shortDescription || '',
    identifier: tauriConfig.identifier || 'com.example.app',
    ...bundleConfig,
    publisher,
    publisherDisplayName,
  };

  // The exe is whatever `tauri build` produced (Cargo bin name unless
  // mainBinaryName overrides it) — never the displayName.
  config.executableName = resolveExecutableName(
    config.executableName,
    tauriConfig,
    path.join(projectRoot, 'src-tauri')
  );
  if (!config.executableName) {
    console.warn(
      'Warning: could not determine the executable name from bundle.config.json (executableName), ' +
        'tauri.conf.json (mainBinaryName) or src-tauri/Cargo.toml — guessing from productName. ' +
        'Set one of those if the build fails with "Executable not found".'
    );
  }

  // Fold file associations declared in tauri.conf.json into the Windows config
  // so they can live in a single source of truth (matching tauri-macos-xcode).
  // bundle.config.json entries still win on name collision.
  const fileAssociations = mergeFileAssociations(
    tauriConfig.bundle?.fileAssociations,
    bundleConfig.extensions?.fileAssociations
  );
  if (fileAssociations.length > 0) {
    config.extensions = { ...config.extensions, fileAssociations };
  }

  // Regenerate Assets from tauriConfig.bundle.icon when requested.
  // Overwrites manual edits in `gen/windows/Assets/`.
  if (options.regenerateAssets) {
    console.log('Regenerating Assets/ from bundle.icon...');
    await generateAssets(
      windowsDir,
      projectRoot,
      bundleConfig.assets?.variants,
      tauriConfig.bundle?.icon
    );
  }

  // Architectures from CLI flag
  const architectures = options.arch?.split(',') || ['x64'];
  const minVersion = options.minWindows || DEFAULT_MIN_WINDOWS_VERSION;
  const appxDirs: { arch: string; dir: string }[] = [];

  const runner = options.runner || DEFAULT_RUNNER;

  for (const arch of architectures) {
    // Build Tauri app
    const target = arch === 'x64' ? 'x86_64-pc-windows-msvc' : 'aarch64-pc-windows-msvc';
    // Tauri CLI defaults to release mode, use --debug for debug builds
    const debugFlag = options.debug ? '--debug' : '';

    // Build command based on runner
    // --no-bundle skips MSI/NSIS bundling since we're creating MSIX
    let buildCommand: string;
    if (runner === 'npm') {
      // npm requires -- to pass args to the script
      buildCommand = `npm run tauri build -- --target ${target} --no-bundle ${debugFlag}`.trim();
    } else {
      // cargo, pnpm, yarn, bun, etc.
      buildCommand = `${runner} tauri build --target ${target} --no-bundle ${debugFlag}`.trim();
    }

    try {
      if (options.verbose) {
        console.log(`  Running: ${buildCommand}\n`);
      }
      await execWithProgress(buildCommand, {
        cwd: projectRoot,
        verbose: options.verbose,
        message: `Building for ${arch}...`,
      });
    } catch (error) {
      console.error(`Failed to build for ${arch}:`, error);
      process.exit(1);
    }

    // Prepare AppxContent directory
    console.log(`  Preparing AppxContent for ${arch}...`);
    const appxDir = prepareAppxContent(
      projectRoot,
      arch,
      config,
      tauriConfig,
      minVersion,
      windowsDir,
      options.debug
    );
    appxDirs.push({ arch, dir: appxDir });
    console.log(`  AppxContent ready: ${appxDir}`);
  }

  // Call msixbundle-cli
  console.log('\nCreating MSIX package...');
  const outDir = path.join(resolveCargoTargetDir(path.join(projectRoot, 'src-tauri')), 'msix');

  const args = [
    '--force',
    '--out-dir',
    outDir,
    ...appxDirs.flatMap(({ arch, dir }) => [`--dir-${arch}`, dir]),
  ];

  // Resource index generation (resources.pri).
  // We build a single merged PRI ourselves (all languages + scales) instead of
  // delegating to msixbundle-cli's `--makepri`, which splits non-default
  // languages into resource-package indexes that a standalone .msix never loads
  // (breaking localized DisplayName). See generateMergedResourceIndex above.
  if (bundleConfig.resourceIndex?.enabled) {
    const defaultLanguage =
      getDefaultLanguageFromManifestFile(path.join(appxDirs[0].dir, 'AppxManifest.xml')) ?? 'en-US';

    console.log('  Generating merged resource index (resources.pri)...');
    try {
      await generateMergedResourceIndex(
        appxDirs,
        defaultLanguage,
        bundleConfig.resourceIndex.keepConfig ?? false
      );
    } catch (error) {
      console.error(
        'Failed to generate resources.pri with makepri. Install the Windows SDK (it ships makepri.exe), or set MAKEPRI_PATH to the full path of makepri.exe.'
      );
      console.error(error);
      process.exit(1);
    }
  }

  // Signing
  if (bundleConfig.signing?.pfx) {
    args.push('--pfx', bundleConfig.signing.pfx);
    const password = bundleConfig.signing.pfxPassword || process.env.MSIX_PFX_PASSWORD;
    if (password) {
      args.push('--pfx-password', password);
    }
  } else if (tauriConfig.bundle?.windows?.certificateThumbprint) {
    args.push('--thumbprint', tauriConfig.bundle.windows.certificateThumbprint);
  }

  const msixbundleCli = resolveMsixbundleCliCommand();
  try {
    if (options.verbose) {
      console.log(`  Running: ${msixbundleCli} ${args.join(' ')}`);
    }
    const result = await spawnAsync(msixbundleCli, args);
    if (result.stdout) console.log(result.stdout);
  } catch (error) {
    console.error('Failed to create MSIX:', error);
    process.exit(1);
  }

  console.log('\n MSIX bundle created!');
  console.log(`Output: ${outDir}`);
}

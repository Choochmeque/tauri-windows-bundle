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
import { prepareAppxContent } from '../core/appx-content.js';
import {
  execAsync,
  execWithProgress,
  isMsixbundleCliInstalled,
  getMsixbundleCliVersion,
  isVersionSufficient,
  MIN_MSIXBUNDLE_CLI_VERSION,
  promptInstall,
} from '../utils/exec.js';

export async function build(options: BuildOptions): Promise<void> {
  console.log('Building MSIX package...\n');

  // Check if msixbundle-cli is installed
  if (!(await isMsixbundleCliInstalled())) {
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

  // Merge config
  const config: MergedConfig = {
    displayName: tauriConfig.productName || 'App',
    version: toFourPartVersion(
      resolveVersion(tauriConfig.version || '1.0.0', path.join(projectRoot, 'src-tauri'))
    ),
    description: tauriConfig.bundle?.shortDescription || '',
    identifier: tauriConfig.identifier || 'com.example.app',
    ...bundleConfig,
  };

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
    const appxDir = prepareAppxContent(projectRoot, arch, config, tauriConfig, minVersion);
    appxDirs.push({ arch, dir: appxDir });
    console.log(`  AppxContent ready: ${appxDir}`);
  }

  // Call msixbundle-cli
  console.log('\nCreating MSIX package...');
  const outDir = path.join(projectRoot, 'src-tauri', 'target', 'msix');

  const args = [
    '--force',
    '--out-dir',
    outDir,
    ...appxDirs.flatMap(({ arch, dir }) => [`--dir-${arch}`, dir]),
  ];

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

  try {
    console.log(`  Running: msixbundle-cli ${args.join(' ')}`);
    const result = await execAsync(`msixbundle-cli ${args.join(' ')}`);
    if (result.stdout) console.log(result.stdout);
  } catch (error) {
    console.error('Failed to create MSIX:', error);
    process.exit(1);
  }

  console.log('\n MSIX bundle created!');
  console.log(`Output: ${outDir}`);
}

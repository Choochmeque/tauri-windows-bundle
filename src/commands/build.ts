import * as path from 'node:path';
import type { BuildOptions, MergedConfig } from '../types.js';
import { DEFAULT_MIN_WINDOWS_VERSION } from '../types.js';
import {
  findProjectRoot,
  readTauriConfig,
  readBundleConfig,
  getWindowsDir,
  toFourPartVersion,
} from '../core/project-discovery.js';
import { prepareAppxContent } from '../core/appx-content.js';
import { execAsync, isMsixbundleCliInstalled, promptInstall } from '../utils/exec.js';

export async function build(options: BuildOptions): Promise<void> {
  console.log('Building MSIX package...\n');

  // Check if msixbundle-cli is installed
  if (!(await isMsixbundleCliInstalled())) {
    const shouldInstall = await promptInstall(
      'msixbundle-cli is required but not installed.\n' + 'Install it now? (requires Rust/Cargo)'
    );

    if (shouldInstall) {
      console.log('Installing msixbundle-cli...');
      try {
        await execAsync('cargo install msixbundle-cli');
        console.log('  msixbundle-cli installed\n');
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

  const projectRoot = findProjectRoot();
  const windowsDir = getWindowsDir(projectRoot);

  // Read configs
  const tauriConfig = readTauriConfig(projectRoot);
  const bundleConfig = readBundleConfig(windowsDir);

  // Merge config
  const config: MergedConfig = {
    displayName: tauriConfig.productName || 'App',
    version: toFourPartVersion(tauriConfig.version || '1.0.0'),
    description: tauriConfig.bundle?.shortDescription || '',
    identifier: tauriConfig.identifier || 'com.example.app',
    ...bundleConfig,
  };

  // Architectures from CLI flag
  const architectures = options.arch?.split(',') || ['x64'];
  const minVersion = options.minWindows || DEFAULT_MIN_WINDOWS_VERSION;
  const appxDirs: { arch: string; dir: string }[] = [];

  for (const arch of architectures) {
    console.log(`Building for ${arch}...`);

    // Build Tauri app
    const target = arch === 'x64' ? 'x86_64-pc-windows-msvc' : 'aarch64-pc-windows-msvc';
    const releaseFlag = options.release ? '--release' : '';

    try {
      console.log(`  Running: cargo tauri build --target ${target} ${releaseFlag}`);
      await execAsync(`cargo tauri build --target ${target} ${releaseFlag}`.trim(), {
        cwd: projectRoot,
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
  const outDir = path.join(projectRoot, 'target', 'msix');

  const args = [
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

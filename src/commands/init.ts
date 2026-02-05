import * as fs from 'node:fs';
import * as path from 'node:path';
import type { InitOptions } from '../types.js';
import { findProjectRoot, readTauriConfig, getWindowsDir } from '../core/project-discovery.js';
import { generateBundleConfig, generateGitignore } from '../generators/config.js';
import { generateAssets } from '../generators/assets.js';
import { generateManifestTemplate, getPackageVersion } from '../core/manifest.js';

export async function init(options: InitOptions): Promise<void> {
  console.log('Initializing Windows bundle configuration...\n');

  const projectRoot = findProjectRoot(options.path);
  const tauriConfig = readTauriConfig(projectRoot);
  const windowsDir = getWindowsDir(projectRoot);

  // Create directories
  fs.mkdirSync(path.join(windowsDir, 'Assets'), { recursive: true });

  // Generate bundle.config.json
  generateBundleConfig(windowsDir, tauriConfig);
  console.log('  Created bundle.config.json');

  // Generate AppxManifest.xml template
  generateManifestTemplate(windowsDir);
  console.log('  Created AppxManifest.xml.template');

  // Generate assets (copy from src-tauri/icons or generate placeholders)
  const assetsCopied = await generateAssets(windowsDir, projectRoot);

  // Generate .gitignore
  generateGitignore(windowsDir);

  // Update package.json with devDependency and build script
  updatePackageJson(projectRoot);

  console.log('\n Windows bundle configuration created!');
  console.log(`\nNext steps:`);
  console.log(`  1. Run: pnpm install`);
  console.log(`  2. Edit src-tauri/gen/windows/bundle.config.json`);
  console.log(`     - Set your publisher CN (from your code signing certificate)`);
  console.log(`     - Set your publisher display name`);
  if (!assetsCopied) {
    console.log(`  3. Replace placeholder icons in src-tauri/gen/windows/Assets/`);
    console.log(`  4. Run: pnpm tauri:windows:build`);
  } else {
    console.log(`  3. Run: pnpm tauri:windows:build`);
  }
}

function updatePackageJson(projectRoot: string): void {
  const packageJsonPath = path.join(projectRoot, 'package.json');

  if (!fs.existsSync(packageJsonPath)) {
    console.log('  Warning: package.json not found, skipping script update');
    return;
  }

  try {
    const content = fs.readFileSync(packageJsonPath, 'utf-8');
    const pkg = JSON.parse(content);

    // Add devDependency
    pkg.devDependencies = pkg.devDependencies || {};
    pkg.devDependencies['@choochmeque/tauri-windows-bundle'] = `^${getPackageVersion()}`;

    // Add script
    pkg.scripts = pkg.scripts || {};
    if (!pkg.scripts['tauri:windows:build']) {
      pkg.scripts['tauri:windows:build'] = 'tauri-windows-bundle build';
    }

    fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log('  Updated package.json with devDependency and build script');
  } catch (error) {
    console.log(
      `  Warning: Could not update package.json: ${error instanceof Error ? error.message : error}`
    );
  }
}

import * as fs from 'node:fs';
import * as path from 'node:path';
import { glob } from 'glob';
import type { MergedConfig, TauriConfig } from '../types.js';
import { generateManifest } from './manifest.js';

export function prepareAppxContent(
  projectRoot: string,
  arch: string,
  config: MergedConfig,
  tauriConfig: TauriConfig,
  minVersion: string
): string {
  const target = arch === 'x64' ? 'x86_64-pc-windows-msvc' : 'aarch64-pc-windows-msvc';
  const buildDir = path.join(projectRoot, 'target', target, 'release');
  const appxDir = path.join(projectRoot, 'target', 'appx', arch);

  // Create directories
  fs.mkdirSync(path.join(appxDir, 'Assets'), { recursive: true });

  // Copy exe
  const exeName = `${config.displayName.replace(/\s+/g, '')}.exe`;
  const srcExe = path.join(buildDir, exeName);

  if (!fs.existsSync(srcExe)) {
    throw new Error(`Executable not found: ${srcExe}`);
  }

  fs.copyFileSync(srcExe, path.join(appxDir, exeName));

  // Generate AppxManifest.xml
  const manifest = generateManifest(config, arch, minVersion);
  fs.writeFileSync(path.join(appxDir, 'AppxManifest.xml'), manifest);

  // Copy MSIX Assets
  const windowsAssetsDir = path.join(projectRoot, 'src-tauri', 'gen', 'windows', 'Assets');
  if (fs.existsSync(windowsAssetsDir)) {
    fs.cpSync(windowsAssetsDir, path.join(appxDir, 'Assets'), {
      recursive: true,
    });
  }

  // Copy bundled resources from tauri.conf.json
  copyBundledResources(projectRoot, appxDir, tauriConfig);

  return appxDir;
}

function copyBundledResources(
  projectRoot: string,
  appxDir: string,
  tauriConfig: TauriConfig
): void {
  const resources = tauriConfig.bundle?.resources;

  if (!resources || resources.length === 0) return;

  const srcDir = path.join(projectRoot, 'src-tauri');

  for (const resource of resources) {
    if (typeof resource === 'string') {
      // Glob pattern like "assets/*" or specific file
      const files = glob.sync(resource, { cwd: srcDir });

      for (const file of files) {
        const src = path.join(srcDir, file);
        const dest = path.join(appxDir, file);
        fs.mkdirSync(path.dirname(dest), { recursive: true });

        if (fs.statSync(src).isDirectory()) {
          fs.cpSync(src, dest, { recursive: true });
        } else {
          fs.copyFileSync(src, dest);
        }
      }
    } else if (typeof resource === 'object' && resource.src && resource.target) {
      const src = path.join(srcDir, resource.src);
      const dest = path.join(appxDir, resource.target);
      fs.mkdirSync(path.dirname(dest), { recursive: true });

      if (fs.statSync(src).isDirectory()) {
        fs.cpSync(src, dest, { recursive: true });
      } else {
        fs.copyFileSync(src, dest);
      }
    }
  }
}

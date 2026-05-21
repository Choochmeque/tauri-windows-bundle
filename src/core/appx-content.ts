import * as fs from 'node:fs';
import * as path from 'node:path';
import { glob } from 'glob';
import type { MergedConfig, TauriConfig } from '../types.js';
import { generateManifest } from './manifest.js';

// Cargo writes artifacts to $CARGO_TARGET_DIR (resolved against CWD if relative)
// when set; otherwise to <srcTauriDir>/target. Note: when CARGO_TARGET_DIR is set,
// there's no extra "target" path segment.
export function resolveCargoTargetDir(srcTauriDir: string): string {
  const envDir = process.env.CARGO_TARGET_DIR;
  if (envDir && envDir.length > 0) {
    return path.resolve(envDir);
  }
  return path.join(srcTauriDir, 'target');
}

export function prepareAppxContent(
  projectRoot: string,
  arch: string,
  config: MergedConfig,
  tauriConfig: TauriConfig,
  minVersion: string,
  windowsDir: string,
  debug: boolean = false
): string {
  const target = arch === 'x64' ? 'x86_64-pc-windows-msvc' : 'aarch64-pc-windows-msvc';
  const srcTauriDir = path.join(projectRoot, 'src-tauri');
  const targetDir = resolveCargoTargetDir(srcTauriDir);
  const buildDir = path.join(targetDir, target, debug ? 'debug' : 'release');
  const appxDir = path.join(targetDir, 'appx', arch);

  // Clear stale output from previous builds
  fs.rmSync(appxDir, { recursive: true, force: true });

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
  const manifest = generateManifest(config, arch, minVersion, windowsDir);
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
  if (!resources) return;

  const srcDir = path.join(projectRoot, 'src-tauri');

  // Tauri accepts resources as an array OR as a map { src: target }.
  // In map form, glob matches do NOT preserve directory structure — files
  // are copied flat into the target directory.
  const entries: { src: string; target?: string }[] = Array.isArray(resources)
    ? resources.map((r) => (typeof r === 'string' ? { src: r } : { src: r.src, target: r.target }))
    : Object.entries(resources).map(([src, target]) => ({ src, target }));

  for (const { src, target } of entries) {
    const matches = glob.sync(src, { cwd: srcDir });
    const files = matches.length > 0 ? matches : [src];

    for (const file of files) {
      const absSrc = path.join(srcDir, file);
      if (!fs.existsSync(absSrc)) continue;

      let dest: string;
      if (target === undefined) {
        dest = path.join(appxDir, file);
      } else if (matches.length > 1 || /[*?[\]]/.test(src)) {
        // Map form with a glob: flatten into target dir.
        dest = path.join(appxDir, target, path.basename(file));
      } else {
        dest = path.join(appxDir, target);
      }

      fs.mkdirSync(path.dirname(dest), { recursive: true });
      if (fs.statSync(absSrc).isDirectory()) {
        fs.cpSync(absSrc, dest, { recursive: true });
      } else {
        fs.copyFileSync(absSrc, dest);
      }
    }
  }
}

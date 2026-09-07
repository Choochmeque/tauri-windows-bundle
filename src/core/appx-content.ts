import * as fs from 'node:fs';
import * as path from 'node:path';
import { glob } from 'glob';
import type { MergedConfig, TauriConfig } from '../types.js';
import { executableName, generateManifest } from './manifest.js';

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
  const exeName = executableName(config);
  const srcExe = path.join(buildDir, exeName);

  if (!fs.existsSync(srcExe)) {
    throw new Error(`Executable not found: ${srcExe}`);
  }

  fs.copyFileSync(srcExe, path.join(appxDir, exeName));

  // Copy sidecars from tauri.conf.json bundle.externalBin
  const sidecarCount = copyExternalBinSidecars(srcTauriDir, appxDir, tauriConfig, target, exeName);

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
  const resourceCount = copyBundledResources(projectRoot, appxDir, tauriConfig);

  console.log(
    `Staged ${arch}: 1 executable, ${sidecarCount} sidecar(s), ${resourceCount} resource file(s)`
  );

  return appxDir;
}

/**
 * The in-package path for a resource, matching Tauri's own mapping: every `..`
 * component becomes `_up_` (and an absolute-path root would be `_root_`), so
 * `../templates` lands at `_up_/templates` — exactly where Tauri's
 * `resolveResource("../templates")` looks at runtime. Stripping the `..`
 * segments instead would put the files where the runtime never searches.
 */
export function resourceRelpath(p: string): string {
  const parts = p.split(/[\\/]+/).filter((c) => c !== '' && c !== '.');
  return parts.map((c) => (c === '..' ? '_up_' : c)).join('/');
}

function assertInside(appxDir: string, dest: string, what: string): void {
  const root = path.resolve(appxDir);
  // Backslashes are separators in the MSIX world even when this runs on POSIX,
  // so "..\\evil" must count as traversal on every host.
  const resolved = path.resolve(dest.replace(/\\/g, '/'));
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(
      `${what} resolves outside the package root: "${dest}" — the file would silently be left out of the .msix`
    );
  }
}

/**
 * Stages `bundle.externalBin` sidecars next to the main executable, the way the
 * official bundler does: the configured string gets `-<target-triple>.exe`
 * appended to locate the vendored file (globs with `*` are expanded), and the
 * copy drops both the directory and the triple so `tauri-plugin-shell` can
 * resolve `sidecar("name")` as `<exe dir>/name.exe`. A configured sidecar with
 * no matching file fails the build — a package missing its sidecar installs
 * fine and breaks only at runtime.
 */
function copyExternalBinSidecars(
  srcTauriDir: string,
  appxDir: string,
  tauriConfig: TauriConfig,
  target: string,
  exeName: string
): number {
  const externalBin = tauriConfig.bundle?.externalBin;
  if (!externalBin || externalBin.length === 0) return 0;

  const seen = new Set<string>([exeName.toLowerCase()]);
  let count = 0;

  for (const entry of externalBin) {
    const suffixed = `${entry}-${target}.exe`;
    // Globs expand for absolute and relative entries alike (Tauri accepts both).
    const pattern = suffixed.replace(/\\/g, '/');
    const matches = glob.sync(pattern, path.isAbsolute(suffixed) ? {} : { cwd: srcTauriDir });

    if (matches.length === 0) {
      throw new Error(
        `Sidecar not found: ${suffixed} (declared in bundle.externalBin as "${entry}")`
      );
    }

    for (const match of matches) {
      const absSrc = path.isAbsolute(match) ? match : path.join(srcTauriDir, match);
      const packagedName = `${path.basename(match, `-${target}.exe`)}.exe`;
      const key = packagedName.toLowerCase();
      if (seen.has(key)) {
        throw new Error(
          `Sidecar name collision: "${packagedName}" is already staged (from bundle.externalBin "${entry}")`
        );
      }
      seen.add(key);
      fs.copyFileSync(absSrc, path.join(appxDir, packagedName));
      count += 1;
    }
  }
  return count;
}

function copyBundledResources(
  projectRoot: string,
  appxDir: string,
  tauriConfig: TauriConfig
): number {
  const resources = tauriConfig.bundle?.resources;
  if (!resources) return 0;

  const srcDir = path.join(projectRoot, 'src-tauri');

  // Tauri accepts resources as an array OR as a map { src: target }.
  // In map form, glob matches do NOT preserve directory structure — files
  // are copied flat into the target directory.
  const entries: { src: string; target?: string }[] = Array.isArray(resources)
    ? resources.map((r) => (typeof r === 'string' ? { src: r } : { src: r.src, target: r.target }))
    : Object.entries(resources).map(([src, target]) => ({ src, target }));

  let count = 0;
  for (const { src, target } of entries) {
    const matches = glob.sync(src, { cwd: srcDir });
    const files = matches.length > 0 ? matches : [src];

    for (const file of files) {
      const absSrc = path.join(srcDir, file);
      if (!fs.existsSync(absSrc)) {
        console.warn(`Warning: bundle.resources entry "${src}" matched nothing at ${absSrc}`);
        continue;
      }

      let dest: string;
      if (target === undefined) {
        // Array form keeps the relative layout, with `..` mapped like Tauri does.
        dest = path.join(appxDir, resourceRelpath(file));
      } else if (matches.length > 1 || /[*?[\]]/.test(src)) {
        // Map form with a glob: flatten into target dir.
        dest = path.join(appxDir, target, path.basename(file));
      } else {
        dest = path.join(appxDir, target);
      }
      assertInside(appxDir, dest, `bundle.resources entry "${src}"`);

      fs.mkdirSync(path.dirname(dest), { recursive: true });
      if (fs.statSync(absSrc).isDirectory()) {
        fs.cpSync(absSrc, dest, { recursive: true });
      } else {
        fs.copyFileSync(absSrc, dest);
      }
      count += 1;
    }
  }
  return count;
}

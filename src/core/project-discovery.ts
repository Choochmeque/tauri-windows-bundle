import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TauriConfig, BundleConfig } from '../types.js';

export function findProjectRoot(startDir?: string): string {
  let dir = startDir || process.cwd();

  while (dir !== path.dirname(dir)) {
    // Check for tauri.conf.json in src-tauri
    const tauriConfPath = path.join(dir, 'src-tauri', 'tauri.conf.json');
    if (fs.existsSync(tauriConfPath)) {
      return dir;
    }

    // Check for package.json as fallback
    const packageJsonPath = path.join(dir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      // Verify it's a Tauri project
      if (fs.existsSync(path.join(dir, 'src-tauri'))) {
        return dir;
      }
    }

    dir = path.dirname(dir);
  }

  throw new Error(
    'Could not find Tauri project root. Make sure you are in a Tauri project directory.'
  );
}

export function readTauriConfig(projectRoot: string): TauriConfig {
  const configPath = path.join(projectRoot, 'src-tauri', 'tauri.conf.json');

  if (!fs.existsSync(configPath)) {
    throw new Error(`tauri.conf.json not found at ${configPath}`);
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(content) as TauriConfig;
  } catch (error) {
    throw new Error(
      `Failed to parse tauri.conf.json: ${error instanceof Error ? error.message : error}`,
      { cause: error }
    );
  }
}

export function readTauriWindowsConfig(projectRoot: string): TauriConfig | null {
  const configPath = path.join(projectRoot, 'src-tauri', 'tauri.windows.conf.json');

  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(content) as TauriConfig;
  } catch (error) {
    throw new Error(
      `Failed to parse tauri.windows.conf.json: ${error instanceof Error ? error.message : error}`,
      { cause: error }
    );
  }
}

export function readBundleConfig(windowsDir: string): BundleConfig {
  const configPath = path.join(windowsDir, 'bundle.config.json');

  if (!fs.existsSync(configPath)) {
    throw new Error(`bundle.config.json not found. Run 'tauri-windows-bundle init' first.`);
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(content) as BundleConfig;
  } catch (error) {
    throw new Error(
      `Failed to parse bundle.config.json: ${error instanceof Error ? error.message : error}`,
      { cause: error }
    );
  }
}

export function getWindowsDir(projectRoot: string): string {
  return path.join(projectRoot, 'src-tauri', 'gen', 'windows');
}

export function resolveVersion(version: string, tauriConfigDir: string): string {
  const resolvedPath = path.resolve(tauriConfigDir, version);
  if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
    try {
      const content = fs.readFileSync(resolvedPath, 'utf-8');
      const json = JSON.parse(content);
      if (!json.version || typeof json.version !== 'string') {
        throw new Error(`File ${version} does not contain a valid "version" field`);
      }
      return json.version;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Failed to parse ${version} as JSON: ${error.message}`, { cause: error });
      }
      throw error;
    }
  }
  return version;
}

export function toFourPartVersion(version: string): string {
  const parts = version.split('.');
  while (parts.length < 4) parts.push('0');
  return parts.slice(0, 4).join('.');
}

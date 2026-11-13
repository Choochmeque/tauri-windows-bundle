import { exec, execFileSync, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import * as readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';

const execPromise = promisify(exec);

const SIDECAR_PACKAGE = '@choochmeque/msixbundle-cli-win32';

export function resolveBundledMsixbundleCliPath(): string | null {
  if (process.platform !== 'win32') return null;
  if (process.arch !== 'x64' && process.arch !== 'arm64') return null;

  try {
    const require = createRequire(import.meta.url);
    const pkgJson = require.resolve(`${SIDECAR_PACKAGE}/package.json`);
    const binPath = path.join(path.dirname(pkgJson), 'bin', process.arch, 'msixbundle-cli.exe');
    return fs.existsSync(binPath) ? binPath : null;
  } catch {
    return null;
  }
}

export function resolveMsixbundleCliCommand(): string {
  return resolveBundledMsixbundleCliPath() ?? 'msixbundle-cli';
}

/**
 * Read the Windows 10/11 SDK install root (`KitsRoot10`) from the registry, the
 * same key msixbundle-cli uses to locate MakeAppx.exe.
 */
function readKitsRoot10FromRegistry(): string | null {
  try {
    const output = execFileSync(
      'reg',
      ['query', 'HKLM\\SOFTWARE\\Microsoft\\Windows Kits\\Installed Roots', '/v', 'KitsRoot10'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }
    );
    const match = output.match(/KitsRoot10\s+REG_\w+\s+(.+)/);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

/**
 * `Windows Kits\10\bin` directories where the Windows SDK installs `makepri.exe`
 * (under `<sdk-version>\<arch>\`): the registered SDK root first, then the
 * default install locations.
 */
function defaultWindowsSdkBinRoots(): string[] {
  if (process.platform !== 'win32') return [];
  const roots = new Set<string>();
  const kitsRoot = readKitsRoot10FromRegistry();
  if (kitsRoot) roots.add(path.join(kitsRoot, 'bin'));
  for (const base of [process.env['ProgramFiles(x86)'], process.env.ProgramFiles]) {
    if (base) roots.add(path.join(base, 'Windows Kits', '10', 'bin'));
  }
  return [...roots];
}

function compareSdkVersionsDesc(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Locate `makepri.exe` in an installed Windows SDK so the build does not have to
 * run from a "Developer Command Prompt for VS".
 *
 * Resolution order: `MAKEPRI_PATH` env var, `WindowsSdkVerBinPath` (set by the
 * VS developer prompt), then the newest SDK under the standard `Windows Kits`
 * install roots. Returns null when nothing is found (caller falls back to PATH).
 */
export function resolveMakepriPath(
  sdkBinRoots: string[] = defaultWindowsSdkBinRoots()
): string | null {
  const override = process.env.MAKEPRI_PATH;
  if (override && fs.existsSync(override)) return override;

  if (process.platform !== 'win32') return null;

  // Prefer a binary that runs natively on the host, then fall back to x86
  // (which runs everywhere via emulation).
  const archDirs = process.arch === 'arm64' ? ['arm64', 'x64', 'x86'] : ['x64', 'x86'];

  const verBinPath = process.env.WindowsSdkVerBinPath;
  if (verBinPath) {
    for (const arch of archDirs) {
      const candidate = path.join(verBinPath, arch, 'makepri.exe');
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  for (const root of sdkBinRoots) {
    let versions: string[];
    try {
      versions = fs
        .readdirSync(root)
        .filter((name) => /^\d+(\.\d+)*$/.test(name))
        .sort(compareSdkVersionsDesc);
    } catch {
      continue;
    }
    for (const version of versions) {
      for (const arch of archDirs) {
        const candidate = path.join(root, version, arch, 'makepri.exe');
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  }

  return null;
}

/** Shell-ready `makepri` command: the SDK path (quoted) if found, else PATH lookup. */
export function resolveMakepriCommand(): string {
  const resolved = resolveMakepriPath();
  return resolved ? `"${resolved}"` : 'makepri';
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function isCiEnvironment(): boolean {
  const ci = process.env.CI;
  if (!ci) return false;

  const normalized = ci.toLowerCase();
  return normalized !== '0' && normalized !== 'false';
}

function shouldAnimateSpinner(): boolean {
  return Boolean(process.stdout.isTTY) && !isCiEnvironment();
}

export class Spinner {
  private frameIndex = 0;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private message: string;

  constructor(message: string) {
    this.message = message;
  }

  start(): void {
    this.intervalId = setInterval(() => {
      const frame = SPINNER_FRAMES[this.frameIndex];
      process.stdout.write(`\r${frame} ${this.message}`);
      this.frameIndex = (this.frameIndex + 1) % SPINNER_FRAMES.length;
    }, 80);
  }

  stop(success: boolean = true): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    const symbol = success ? '✓' : '✗';
    process.stdout.write(`\r${symbol} ${this.message}\n`);
  }

  fail(): void {
    this.stop(false);
  }
}

export async function execAsync(
  command: string,
  options?: { cwd?: string }
): Promise<{ stdout: string; stderr: string }> {
  const result = await execPromise(command, { ...options, encoding: 'utf8' });
  return { stdout: result.stdout, stderr: result.stderr };
}

export async function spawnAsync(
  command: string,
  args: string[],
  options?: { cwd?: string }
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options?.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr?.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited with code ${code}\n${stderr}`));
    });
  });
}

export async function isMsixbundleCliInstalled(): Promise<boolean> {
  try {
    await spawnAsync(resolveMsixbundleCliCommand(), ['--version']);
    return true;
  } catch {
    return false;
  }
}

export async function getMsixbundleCliVersion(): Promise<string | null> {
  try {
    const result = await spawnAsync(resolveMsixbundleCliCommand(), ['--version']);
    // Output format: "msixbundle-cli 1.0.0" or just "1.0.0"
    const match = result.stdout.trim().match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export function isVersionSufficient(version: string, minVersion: string): boolean {
  const parse = (v: string) => v.split('.').map((n) => parseInt(n, 10));
  const [major, minor, patch] = parse(version);
  const [minMajor, minMinor, minPatch] = parse(minVersion);

  if (major > minMajor) return true;
  if (major < minMajor) return false;
  if (minor > minMinor) return true;
  if (minor < minMinor) return false;
  return patch >= minPatch;
}

export const MIN_MSIXBUNDLE_CLI_VERSION = '1.1.11';

export async function promptInstall(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

export interface ExecWithProgressOptions {
  cwd?: string;
  verbose?: boolean;
  message?: string;
}

export async function execWithProgress(
  command: string,
  options?: ExecWithProgressOptions
): Promise<void> {
  const verbose = options?.verbose ?? false;
  const message = options?.message ?? 'Running...';
  const useSpinner = !verbose && shouldAnimateSpinner();
  const useStaticProgress = !verbose && !useSpinner;

  return new Promise((resolve, reject) => {
    const child = spawn(command, [], {
      cwd: options?.cwd,
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: true,
    });

    let spinner: Spinner | null = null;
    let capturedOutput = '';

    if (useSpinner) {
      spinner = new Spinner(message);
      spinner.start();
    } else if (useStaticProgress) {
      console.log(message);
    }

    child.stdout?.on('data', (data: Buffer) => {
      if (verbose) {
        process.stdout.write(data);
      } else {
        capturedOutput += data.toString();
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      if (verbose) {
        process.stderr.write(data);
      } else {
        capturedOutput += data.toString();
      }
    });

    child.on('close', (code) => {
      if (code === 0) {
        spinner?.stop(true);
        if (useStaticProgress) {
          console.log(`Done: ${message}`);
        }
        resolve();
      } else {
        spinner?.fail();
        if (useStaticProgress) {
          console.error(`Failed: ${message}`);
        }
        if (!verbose && capturedOutput) {
          console.error('\nBuild output:\n' + capturedOutput);
        }
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    child.on('error', (error) => {
      spinner?.fail();
      if (useStaticProgress) {
        console.error(`Failed: ${message}`);
      }
      if (!verbose && capturedOutput) {
        console.error('\nBuild output:\n' + capturedOutput);
      }
      reject(error);
    });
  });
}

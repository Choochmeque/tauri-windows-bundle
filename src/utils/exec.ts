import { exec, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import * as readline from 'node:readline';

const execPromise = promisify(exec);

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

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

export async function isMsixbundleCliInstalled(): Promise<boolean> {
  try {
    await execAsync('msixbundle-cli --version');
    return true;
  } catch {
    return false;
  }
}

export async function getMsixbundleCliVersion(): Promise<string | null> {
  try {
    const result = await execAsync('msixbundle-cli --version');
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

export const MIN_MSIXBUNDLE_CLI_VERSION = '1.0.0';

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

  return new Promise((resolve, reject) => {
    const [cmd, ...args] = command.split(' ');
    const child = spawn(cmd, args, {
      cwd: options?.cwd,
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: true,
    });

    let spinner: Spinner | null = null;
    let capturedOutput = '';

    if (!verbose) {
      spinner = new Spinner(message);
      spinner.start();
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
        resolve();
      } else {
        spinner?.fail();
        if (!verbose && capturedOutput) {
          console.error('\nBuild output:\n' + capturedOutput);
        }
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    child.on('error', (error) => {
      spinner?.fail();
      if (!verbose && capturedOutput) {
        console.error('\nBuild output:\n' + capturedOutput);
      }
      reject(error);
    });
  });
}

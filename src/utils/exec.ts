import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as readline from 'node:readline';

const execPromise = promisify(exec);

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

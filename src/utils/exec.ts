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

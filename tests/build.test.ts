import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// Mock exec utilities before importing build
vi.mock('../src/utils/exec.js', () => ({
  execAsync: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }),
  isMsixbundleCliInstalled: vi.fn().mockResolvedValue(true),
  getMsixbundleCliVersion: vi.fn().mockResolvedValue('1.0.0'),
  isVersionSufficient: vi.fn().mockReturnValue(true),
  MIN_MSIXBUNDLE_CLI_VERSION: '1.0.0',
  promptInstall: vi.fn().mockResolvedValue(false),
}));

import { build } from '../src/commands/build.js';
import {
  execAsync,
  isMsixbundleCliInstalled,
  getMsixbundleCliVersion,
  isVersionSufficient,
  promptInstall,
} from '../src/utils/exec.js';

describe('build command', () => {
  let tempDir: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let processExitSpy: any;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tauri-bundle-test-'));
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    // Reset mocks
    vi.mocked(isMsixbundleCliInstalled).mockResolvedValue(true);
    vi.mocked(getMsixbundleCliVersion).mockResolvedValue('1.0.0');
    vi.mocked(isVersionSufficient).mockReturnValue(true);
    vi.mocked(execAsync).mockResolvedValue({ stdout: '', stderr: '' });
    vi.mocked(promptInstall).mockResolvedValue(false);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
    vi.clearAllMocks();
  });

  function createFullProject() {
    // Create tauri config
    const srcTauri = path.join(tempDir, 'src-tauri');
    fs.mkdirSync(srcTauri, { recursive: true });
    fs.writeFileSync(
      path.join(srcTauri, 'tauri.conf.json'),
      JSON.stringify({
        productName: 'TestApp',
        version: '1.0.0',
        identifier: 'com.example.testapp',
      })
    );

    // Create windows bundle config
    const windowsDir = path.join(srcTauri, 'gen', 'windows');
    fs.mkdirSync(windowsDir, { recursive: true });
    fs.writeFileSync(
      path.join(windowsDir, 'bundle.config.json'),
      JSON.stringify({
        publisher: 'CN=TestCompany',
        publisherDisplayName: 'Test Company',
        capabilities: ['internetClient'],
      })
    );

    // Create build output
    const buildDir = path.join(tempDir, 'target', 'x86_64-pc-windows-msvc', 'release');
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, 'TestApp.exe'), 'mock exe');

    return tempDir;
  }

  it('checks for msixbundle-cli installation', async () => {
    createFullProject();

    // Change to temp dir for findProjectRoot to work
    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await build({});
    } catch {
      // Expected to fail after exe created
    }

    process.chdir(originalCwd);
    expect(isMsixbundleCliInstalled).toHaveBeenCalled();
  });

  it('prompts to install msixbundle-cli when not found', async () => {
    vi.mocked(isMsixbundleCliInstalled).mockResolvedValue(false);

    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await build({});
    } catch {
      // Expected process.exit
    }

    process.chdir(originalCwd);
    expect(promptInstall).toHaveBeenCalled();
  });

  it('installs msixbundle-cli when user agrees', async () => {
    vi.mocked(isMsixbundleCliInstalled).mockResolvedValue(false);
    vi.mocked(promptInstall).mockResolvedValue(true);

    createFullProject();
    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await build({});
    } catch {
      // Expected
    }

    process.chdir(originalCwd);
    expect(execAsync).toHaveBeenCalledWith('cargo install msixbundle-cli');
  });

  it('exits when user declines installation', async () => {
    vi.mocked(isMsixbundleCliInstalled).mockResolvedValue(false);
    vi.mocked(promptInstall).mockResolvedValue(false);

    const originalCwd = process.cwd();
    process.chdir(tempDir);

    await expect(build({})).rejects.toThrow('process.exit called');

    process.chdir(originalCwd);
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('handles cargo install failure', async () => {
    vi.mocked(isMsixbundleCliInstalled).mockResolvedValue(false);
    vi.mocked(promptInstall).mockResolvedValue(true);
    vi.mocked(execAsync).mockRejectedValueOnce(new Error('cargo failed'));

    const originalCwd = process.cwd();
    process.chdir(tempDir);

    await expect(build({})).rejects.toThrow('process.exit called');

    process.chdir(originalCwd);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to install msixbundle-cli:',
      expect.any(Error)
    );
  });

  it('exits when version cannot be determined', async () => {
    vi.mocked(getMsixbundleCliVersion).mockResolvedValue(null);

    const originalCwd = process.cwd();
    process.chdir(tempDir);

    await expect(build({})).rejects.toThrow('process.exit called');

    process.chdir(originalCwd);
    expect(consoleErrorSpy).toHaveBeenCalledWith('Could not determine msixbundle-cli version');
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('exits when version is too old', async () => {
    vi.mocked(getMsixbundleCliVersion).mockResolvedValue('0.5.0');
    vi.mocked(isVersionSufficient).mockReturnValue(false);

    const originalCwd = process.cwd();
    process.chdir(tempDir);

    await expect(build({})).rejects.toThrow('process.exit called');

    process.chdir(originalCwd);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'msixbundle-cli version 0.5.0 is too old. Minimum required: 1.0.0'
    );
    expect(consoleSpy).toHaveBeenCalledWith('Update with: cargo install msixbundle-cli --force');
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('builds for x64 architecture by default', async () => {
    createFullProject();
    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await build({});
    } catch {
      // Expected
    }

    process.chdir(originalCwd);
    expect(execAsync).toHaveBeenCalledWith(
      expect.stringContaining('x86_64-pc-windows-msvc'),
      expect.any(Object)
    );
  });

  it('builds for arm64 architecture when specified', async () => {
    // Create arm64 build output
    createFullProject();
    const buildDir = path.join(tempDir, 'target', 'aarch64-pc-windows-msvc', 'release');
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, 'TestApp.exe'), 'mock exe');

    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await build({ arch: 'arm64' });
    } catch {
      // Expected
    }

    process.chdir(originalCwd);
    expect(execAsync).toHaveBeenCalledWith(
      expect.stringContaining('aarch64-pc-windows-msvc'),
      expect.any(Object)
    );
  });

  it('builds with release flag when specified', async () => {
    createFullProject();
    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await build({ release: true });
    } catch {
      // Expected
    }

    process.chdir(originalCwd);
    expect(execAsync).toHaveBeenCalledWith(
      expect.stringContaining('--release'),
      expect.any(Object)
    );
  });

  it('handles cargo build failure', async () => {
    createFullProject();
    vi.mocked(execAsync).mockRejectedValue(new Error('cargo build failed'));

    const originalCwd = process.cwd();
    process.chdir(tempDir);

    await expect(build({})).rejects.toThrow('process.exit called');

    process.chdir(originalCwd);
    // Should have called console.error with some failure message
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('uses signing config when pfx is specified', async () => {
    const projectDir = createFullProject();
    const windowsDir = path.join(projectDir, 'src-tauri', 'gen', 'windows');
    fs.writeFileSync(
      path.join(windowsDir, 'bundle.config.json'),
      JSON.stringify({
        publisher: 'CN=TestCompany',
        publisherDisplayName: 'Test Company',
        capabilities: ['internetClient'],
        signing: {
          pfx: '/path/to/cert.pfx',
          pfxPassword: 'secret',
        },
      })
    );

    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await build({});
    } catch {
      // Expected
    }

    process.chdir(originalCwd);
    expect(execAsync).toHaveBeenCalledWith(expect.stringContaining('--pfx'));
  });

  it('uses certificate thumbprint from tauri config', async () => {
    const projectDir = createFullProject();
    fs.writeFileSync(
      path.join(projectDir, 'src-tauri', 'tauri.conf.json'),
      JSON.stringify({
        productName: 'TestApp',
        version: '1.0.0',
        identifier: 'com.example.testapp',
        bundle: {
          windows: {
            certificateThumbprint: 'ABC123',
          },
        },
      })
    );

    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await build({});
    } catch {
      // Expected
    }

    process.chdir(originalCwd);
    expect(execAsync).toHaveBeenCalledWith(expect.stringContaining('--thumbprint'));
  });

  it('handles msixbundle-cli failure', async () => {
    createFullProject();

    // Mock: first call (cargo build) succeeds, second call (msixbundle-cli) fails
    vi.mocked(execAsync)
      .mockResolvedValueOnce({ stdout: '', stderr: '' }) // cargo build
      .mockRejectedValueOnce(new Error('msixbundle-cli failed')); // msixbundle-cli

    const originalCwd = process.cwd();
    process.chdir(tempDir);

    await expect(build({})).rejects.toThrow('process.exit called');

    process.chdir(originalCwd);
    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to create MSIX:', expect.any(Error));
  });
});

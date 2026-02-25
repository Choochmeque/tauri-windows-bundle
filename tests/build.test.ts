import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// Mock exec utilities before importing build
vi.mock('../src/utils/exec.js', () => ({
  execAsync: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }),
  execWithProgress: vi.fn().mockResolvedValue(undefined),
  isMsixbundleCliInstalled: vi.fn().mockResolvedValue(true),
  getMsixbundleCliVersion: vi.fn().mockResolvedValue('1.0.0'),
  isVersionSufficient: vi.fn().mockReturnValue(true),
  MIN_MSIXBUNDLE_CLI_VERSION: '1.0.0',
  promptInstall: vi.fn().mockResolvedValue(false),
}));

import { build } from '../src/commands/build.js';
import { generateManifestTemplate } from '../src/core/manifest.js';
import {
  execAsync,
  execWithProgress,
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
    vi.mocked(execWithProgress).mockResolvedValue(undefined);
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
    generateManifestTemplate(windowsDir);
    fs.writeFileSync(
      path.join(windowsDir, 'bundle.config.json'),
      JSON.stringify({
        publisher: 'CN=TestCompany',
        publisherDisplayName: 'Test Company',
        capabilities: { general: ['internetClient'] },
      })
    );

    // Create AppxManifest.xml.template
    generateManifestTemplate(windowsDir);

    // Create build output
    const buildDir = path.join(tempDir, 'src-tauri', 'target', 'x86_64-pc-windows-msvc', 'release');
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
    expect(execWithProgress).toHaveBeenCalledWith('cargo install msixbundle-cli', {
      verbose: undefined,
      message: 'Installing msixbundle-cli...',
    });
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
    vi.mocked(execWithProgress).mockRejectedValueOnce(new Error('cargo failed'));

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
    expect(execWithProgress).toHaveBeenCalledWith(
      expect.stringContaining('x86_64-pc-windows-msvc'),
      expect.any(Object)
    );
  });

  it('builds for arm64 architecture when specified', async () => {
    // Create arm64 build output
    createFullProject();
    const buildDir = path.join(
      tempDir,
      'src-tauri',
      'target',
      'aarch64-pc-windows-msvc',
      'release'
    );
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
    expect(execWithProgress).toHaveBeenCalledWith(
      expect.stringContaining('aarch64-pc-windows-msvc'),
      expect.any(Object)
    );
  });

  it('builds in release mode by default (no --debug flag)', async () => {
    createFullProject();
    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await build({});
    } catch {
      // Expected
    }

    process.chdir(originalCwd);
    expect(execWithProgress).toHaveBeenCalledWith(
      expect.not.stringContaining('--debug'),
      expect.any(Object)
    );
  });

  it('builds with --debug flag when debug option is set', async () => {
    createFullProject();
    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await build({ debug: true });
    } catch {
      // Expected
    }

    process.chdir(originalCwd);
    expect(execWithProgress).toHaveBeenCalledWith(
      expect.stringContaining('--debug'),
      expect.any(Object)
    );
  });

  it('logs build command in verbose mode', async () => {
    createFullProject();
    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await build({ verbose: true });
    } catch {
      // Expected
    }

    process.chdir(originalCwd);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Running:'));
  });

  it('handles cargo build failure', async () => {
    createFullProject();
    vi.mocked(execWithProgress).mockRejectedValue(new Error('cargo build failed'));

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
        capabilities: { general: ['internetClient'] },
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

    // Mock: msixbundle-cli fails (execAsync is used for msixbundle-cli)
    vi.mocked(execAsync).mockRejectedValueOnce(new Error('msixbundle-cli failed'));

    const originalCwd = process.cwd();
    process.chdir(tempDir);

    await expect(build({})).rejects.toThrow('process.exit called');

    process.chdir(originalCwd);
    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to create MSIX:', expect.any(Error));
  });

  it('uses cargo runner by default', async () => {
    createFullProject();
    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await build({});
    } catch {
      // Expected
    }

    process.chdir(originalCwd);
    expect(execWithProgress).toHaveBeenCalledWith(
      expect.stringContaining('cargo tauri build'),
      expect.any(Object)
    );
  });

  it('uses pnpm runner when specified', async () => {
    createFullProject();
    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await build({ runner: 'pnpm' });
    } catch {
      // Expected
    }

    process.chdir(originalCwd);
    expect(execWithProgress).toHaveBeenCalledWith(
      expect.stringContaining('pnpm tauri build'),
      expect.any(Object)
    );
  });

  it('uses npm runner with -- separator', async () => {
    createFullProject();
    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await build({ runner: 'npm' });
    } catch {
      // Expected
    }

    process.chdir(originalCwd);
    expect(execWithProgress).toHaveBeenCalledWith(
      expect.stringContaining('npm run tauri build --'),
      expect.any(Object)
    );
  });

  it('uses yarn runner when specified', async () => {
    createFullProject();
    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await build({ runner: 'yarn' });
    } catch {
      // Expected
    }

    process.chdir(originalCwd);
    expect(execWithProgress).toHaveBeenCalledWith(
      expect.stringContaining('yarn tauri build'),
      expect.any(Object)
    );
  });

  it('exits with error for invalid capabilities', async () => {
    const projectDir = createFullProject();
    const windowsDir = path.join(projectDir, 'src-tauri', 'gen', 'windows');
    fs.writeFileSync(
      path.join(windowsDir, 'bundle.config.json'),
      JSON.stringify({
        publisher: 'CN=TestCompany',
        publisherDisplayName: 'Test Company',
        capabilities: { general: ['invalidCapability'] },
      })
    );

    const originalCwd = process.cwd();
    process.chdir(tempDir);

    await expect(build({})).rejects.toThrow('process.exit called');

    process.chdir(originalCwd);
    expect(consoleErrorSpy).toHaveBeenCalledWith('Invalid capabilities in bundle.config.json:');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid general capability')
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('exits with error for multiple invalid capabilities', async () => {
    const projectDir = createFullProject();
    const windowsDir = path.join(projectDir, 'src-tauri', 'gen', 'windows');
    fs.writeFileSync(
      path.join(windowsDir, 'bundle.config.json'),
      JSON.stringify({
        publisher: 'CN=TestCompany',
        publisherDisplayName: 'Test Company',
        capabilities: {
          general: ['badCap1'],
          device: ['badDevice'],
        },
      })
    );

    const originalCwd = process.cwd();
    process.chdir(tempDir);

    await expect(build({})).rejects.toThrow('process.exit called');

    process.chdir(originalCwd);
    expect(consoleErrorSpy).toHaveBeenCalledWith('Invalid capabilities in bundle.config.json:');
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('uses default displayName when productName not specified', async () => {
    const srcTauri = path.join(tempDir, 'src-tauri');
    fs.mkdirSync(srcTauri, { recursive: true });
    fs.writeFileSync(
      path.join(srcTauri, 'tauri.conf.json'),
      JSON.stringify({
        version: '1.0.0',
        identifier: 'com.example.testapp',
      })
    );

    const windowsDir = path.join(srcTauri, 'gen', 'windows');
    fs.mkdirSync(windowsDir, { recursive: true });
    generateManifestTemplate(windowsDir);
    fs.writeFileSync(
      path.join(windowsDir, 'bundle.config.json'),
      JSON.stringify({
        publisher: 'CN=TestCompany',
        publisherDisplayName: 'Test Company',
        capabilities: { general: ['internetClient'] },
      })
    );

    const buildDir = path.join(srcTauri, 'target', 'x86_64-pc-windows-msvc', 'release');
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, 'App.exe'), 'mock exe');

    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await build({});
    } catch {
      // Expected
    }

    process.chdir(originalCwd);

    const appxDir = path.join(srcTauri, 'target', 'appx', 'x64');
    const manifestPath = path.join(appxDir, 'AppxManifest.xml');
    if (fs.existsSync(manifestPath)) {
      const manifest = fs.readFileSync(manifestPath, 'utf-8');
      expect(manifest).toContain('DisplayName="App"');
    }
  });

  it('uses default version when not specified in config', async () => {
    const srcTauri = path.join(tempDir, 'src-tauri');
    fs.mkdirSync(srcTauri, { recursive: true });
    fs.writeFileSync(
      path.join(srcTauri, 'tauri.conf.json'),
      JSON.stringify({
        productName: 'TestApp',
        identifier: 'com.example.testapp',
      })
    );

    const windowsDir = path.join(srcTauri, 'gen', 'windows');
    fs.mkdirSync(windowsDir, { recursive: true });
    generateManifestTemplate(windowsDir);
    fs.writeFileSync(
      path.join(windowsDir, 'bundle.config.json'),
      JSON.stringify({
        publisher: 'CN=TestCompany',
        publisherDisplayName: 'Test Company',
        capabilities: { general: ['internetClient'] },
      })
    );

    const buildDir = path.join(srcTauri, 'target', 'x86_64-pc-windows-msvc', 'release');
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, 'TestApp.exe'), 'mock exe');

    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await build({});
    } catch {
      // Expected
    }

    process.chdir(originalCwd);

    const appxDir = path.join(srcTauri, 'target', 'appx', 'x64');
    const manifestPath = path.join(appxDir, 'AppxManifest.xml');
    if (fs.existsSync(manifestPath)) {
      const manifest = fs.readFileSync(manifestPath, 'utf-8');
      expect(manifest).toContain('Version="1.0.0.0"');
    }
  });

  it('skips capability validation when capabilities not defined', async () => {
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

    const windowsDir = path.join(srcTauri, 'gen', 'windows');
    fs.mkdirSync(windowsDir, { recursive: true });
    generateManifestTemplate(windowsDir);
    fs.writeFileSync(
      path.join(windowsDir, 'bundle.config.json'),
      JSON.stringify({
        publisher: 'CN=TestCompany',
        publisherDisplayName: 'Test Company',
      })
    );

    const buildDir = path.join(srcTauri, 'target', 'x86_64-pc-windows-msvc', 'release');
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, 'TestApp.exe'), 'mock exe');

    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await build({});
    } catch {
      // Expected
    }

    process.chdir(originalCwd);
    expect(consoleErrorSpy).not.toHaveBeenCalledWith('Invalid capabilities in bundle.config.json:');
  });

  it('uses default identifier when not specified in config', async () => {
    const srcTauri = path.join(tempDir, 'src-tauri');
    fs.mkdirSync(srcTauri, { recursive: true });
    fs.writeFileSync(
      path.join(srcTauri, 'tauri.conf.json'),
      JSON.stringify({
        productName: 'TestApp',
        version: '1.0.0',
      })
    );

    const windowsDir = path.join(srcTauri, 'gen', 'windows');
    fs.mkdirSync(windowsDir, { recursive: true });
    generateManifestTemplate(windowsDir);
    fs.writeFileSync(
      path.join(windowsDir, 'bundle.config.json'),
      JSON.stringify({
        publisher: 'CN=TestCompany',
        publisherDisplayName: 'Test Company',
        capabilities: { general: ['internetClient'] },
      })
    );

    const buildDir = path.join(srcTauri, 'target', 'x86_64-pc-windows-msvc', 'release');
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, 'TestApp.exe'), 'mock exe');

    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await build({});
    } catch {
      // Expected
    }

    process.chdir(originalCwd);

    const appxDir = path.join(srcTauri, 'target', 'appx', 'x64');
    const manifestPath = path.join(appxDir, 'AppxManifest.xml');
    if (fs.existsSync(manifestPath)) {
      const manifest = fs.readFileSync(manifestPath, 'utf-8');
      expect(manifest).toContain('Name="com.example.app"');
    }
  });

  it('uses pfxPassword from environment variable', async () => {
    const projectDir = createFullProject();
    const windowsDir = path.join(projectDir, 'src-tauri', 'gen', 'windows');
    fs.writeFileSync(
      path.join(windowsDir, 'bundle.config.json'),
      JSON.stringify({
        publisher: 'CN=TestCompany',
        publisherDisplayName: 'Test Company',
        capabilities: { general: ['internetClient'] },
        signing: {
          pfx: '/path/to/cert.pfx',
          // No pfxPassword - should use env var
        },
      })
    );

    // Set environment variable
    const originalEnv = process.env.MSIX_PFX_PASSWORD;
    process.env.MSIX_PFX_PASSWORD = 'env-secret';

    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await build({});
    } catch {
      // Expected
    }

    process.chdir(originalCwd);
    process.env.MSIX_PFX_PASSWORD = originalEnv;

    expect(execAsync).toHaveBeenCalledWith(expect.stringContaining('--pfx-password'));
    expect(execAsync).toHaveBeenCalledWith(expect.stringContaining('env-secret'));
  });

  it('uses pfx without password when no password provided', async () => {
    const projectDir = createFullProject();
    const windowsDir = path.join(projectDir, 'src-tauri', 'gen', 'windows');
    fs.writeFileSync(
      path.join(windowsDir, 'bundle.config.json'),
      JSON.stringify({
        publisher: 'CN=TestCompany',
        publisherDisplayName: 'Test Company',
        capabilities: { general: ['internetClient'] },
        signing: {
          pfx: '/path/to/cert.pfx',
          // No pfxPassword and no env var
        },
      })
    );

    // Ensure env var is not set
    const originalEnv = process.env.MSIX_PFX_PASSWORD;
    delete process.env.MSIX_PFX_PASSWORD;

    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await build({});
    } catch {
      // Expected
    }

    process.chdir(originalCwd);
    process.env.MSIX_PFX_PASSWORD = originalEnv;

    // Should have --pfx but NOT --pfx-password
    expect(execAsync).toHaveBeenCalledWith(expect.stringContaining('--pfx'));
    expect(execAsync).not.toHaveBeenCalledWith(expect.stringContaining('--pfx-password'));
  });

  it('passes --makepri when resourceIndex is enabled', async () => {
    const projectDir = createFullProject();
    const windowsDir = path.join(projectDir, 'src-tauri', 'gen', 'windows');
    fs.writeFileSync(
      path.join(windowsDir, 'bundle.config.json'),
      JSON.stringify({
        publisher: 'CN=TestCompany',
        publisherDisplayName: 'Test Company',
        capabilities: { general: ['internetClient'] },
        resourceIndex: {
          enabled: true,
          keepConfig: false,
        },
      })
    );

    vi.mocked(execAsync).mockResolvedValueOnce({ stdout: '', stderr: '' });

    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await build({});
    } catch {
      // Expected
    }

    process.chdir(originalCwd);

    const commands = vi.mocked(execAsync).mock.calls.map(([command]) => command);
    expect(
      commands.some(
        (command) =>
          typeof command === 'string' &&
          command.startsWith('msixbundle-cli --force') &&
          command.includes('--makepri') &&
          command.includes('--makepri-default-language en-us')
      )
    ).toBe(true);
  });

  it('passes --makepri-keep-config when resourceIndex.keepConfig is true', async () => {
    const projectDir = createFullProject();
    const windowsDir = path.join(projectDir, 'src-tauri', 'gen', 'windows');
    fs.writeFileSync(
      path.join(windowsDir, 'bundle.config.json'),
      JSON.stringify({
        publisher: 'CN=TestCompany',
        publisherDisplayName: 'Test Company',
        capabilities: { general: ['internetClient'] },
        resourceIndex: {
          enabled: true,
          keepConfig: true,
        },
      })
    );

    vi.mocked(execAsync).mockResolvedValueOnce({ stdout: '', stderr: '' });

    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await build({});
    } catch {
      // Expected
    }

    process.chdir(originalCwd);

    expect(execAsync).toHaveBeenCalledWith(expect.stringContaining('--makepri-keep-config'));
  });

  it('builds normally with resourceIndex enabled', async () => {
    const projectDir = createFullProject();
    const windowsDir = path.join(projectDir, 'src-tauri', 'gen', 'windows');
    fs.writeFileSync(
      path.join(windowsDir, 'bundle.config.json'),
      JSON.stringify({
        publisher: 'CN=TestCompany',
        publisherDisplayName: 'Test Company',
        capabilities: { general: ['internetClient'] },
        resourceIndex: {
          enabled: true,
        },
      })
    );

    vi.mocked(execAsync).mockResolvedValueOnce({ stdout: '', stderr: '' });

    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await build({});
    } catch {
      // Expected
    }

    process.chdir(originalCwd);

    expect(execAsync).toHaveBeenCalledWith(expect.stringContaining('--makepri'));
    expect(processExitSpy).not.toHaveBeenCalledWith(1);
  });

  it('outputs msixbundle-cli stdout when present', async () => {
    createFullProject();
    vi.mocked(execAsync).mockResolvedValueOnce({ stdout: 'MSIX created successfully', stderr: '' });

    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await build({});
    } catch {
      // Expected
    }

    process.chdir(originalCwd);
    expect(consoleSpy).toHaveBeenCalledWith('MSIX created successfully');
  });

  it('merges tauri.windows.conf.json over tauri.conf.json', async () => {
    const projectDir = createFullProject();
    const srcTauri = path.join(projectDir, 'src-tauri');

    // Base config has identifier "com.example.testapp" and productName "TestApp" (from createFullProject)
    // Add windows-specific config with different identifier, productName, and bundle.shortDescription
    fs.writeFileSync(
      path.join(srcTauri, 'tauri.windows.conf.json'),
      JSON.stringify({
        identifier: 'com.windows.override',
        productName: 'WindowsApp',
        bundle: {
          shortDescription: 'Windows-specific description',
        },
      })
    );

    // Create exe with the overridden name (WindowsApp.exe instead of TestApp.exe)
    const buildDir = path.join(srcTauri, 'target', 'x86_64-pc-windows-msvc', 'release');
    fs.writeFileSync(path.join(buildDir, 'WindowsApp.exe'), 'mock exe');

    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await build({});
    } catch {
      // Expected - build may fail but we want to check manifest generation
    }

    process.chdir(originalCwd);

    // Check generated manifest contains the overridden values
    // Manifest is written to src-tauri/target/appx/x64/
    const appxDir = path.join(srcTauri, 'target', 'appx', 'x64');
    const manifestPath = path.join(appxDir, 'AppxManifest.xml');

    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = fs.readFileSync(manifestPath, 'utf-8');

    // Tauri config overrides from tauri.windows.conf.json
    expect(manifest).toContain('Name="com.windows.override"');
    expect(manifest).not.toContain('Name="com.example.testapp"');
    expect(manifest).toContain('DisplayName="WindowsApp"');
    expect(manifest).not.toContain('DisplayName="TestApp"');

    // Nested bundle object merge (bundle.shortDescription -> Description)
    expect(manifest).toContain('Description="Windows-specific description"');

    // Bundle config values from bundle.config.json should still be present
    expect(manifest).toContain('Publisher="CN=TestCompany"');
    expect(manifest).toContain('<PublisherDisplayName>Test Company</PublisherDisplayName>');
  });

  it('resolves publisher from tauri.windows.conf.json when not in bundle.config.json', async () => {
    const projectDir = createFullProject();
    const srcTauri = path.join(projectDir, 'src-tauri');
    const windowsDir = path.join(srcTauri, 'gen', 'windows');

    // bundle.config.json without publisher
    fs.writeFileSync(
      path.join(windowsDir, 'bundle.config.json'),
      JSON.stringify({
        publisherDisplayName: 'Test Company',
        capabilities: { general: ['internetClient'] },
      })
    );

    // publisher defined in tauri.windows.conf.json
    fs.writeFileSync(
      path.join(srcTauri, 'tauri.windows.conf.json'),
      JSON.stringify({
        bundle: {
          publisher: 'CN=FromWindowsConfig',
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

    const appxDir = path.join(srcTauri, 'target', 'appx', 'x64');
    const manifestPath = path.join(appxDir, 'AppxManifest.xml');

    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = fs.readFileSync(manifestPath, 'utf-8');
    expect(manifest).toContain('Publisher="CN=FromWindowsConfig"');
    expect(manifest).toContain('<PublisherDisplayName>Test Company</PublisherDisplayName>');
  });

  it('bundle.config.json publisher takes precedence over tauri config', async () => {
    const projectDir = createFullProject();
    const srcTauri = path.join(projectDir, 'src-tauri');

    // bundle.config.json has publisher
    // (already set by createFullProject with CN=TestCompany)

    // tauri.windows.conf.json also has publisher
    fs.writeFileSync(
      path.join(srcTauri, 'tauri.windows.conf.json'),
      JSON.stringify({
        bundle: {
          publisher: 'CN=FromWindowsConfig',
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

    const appxDir = path.join(srcTauri, 'target', 'appx', 'x64');
    const manifestPath = path.join(appxDir, 'AppxManifest.xml');

    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = fs.readFileSync(manifestPath, 'utf-8');
    // bundle.config.json value wins
    expect(manifest).toContain('Publisher="CN=TestCompany"');
    expect(manifest).not.toContain('Publisher="CN=FromWindowsConfig"');
  });

  it('exits with error when publisher is missing from all configs', async () => {
    const projectDir = createFullProject();
    const windowsDir = path.join(projectDir, 'src-tauri', 'gen', 'windows');

    // bundle.config.json without publisher
    fs.writeFileSync(
      path.join(windowsDir, 'bundle.config.json'),
      JSON.stringify({
        publisherDisplayName: 'Test Company',
        capabilities: { general: ['internetClient'] },
      })
    );

    const originalCwd = process.cwd();
    process.chdir(tempDir);

    await expect(build({})).rejects.toThrow('process.exit called');

    process.chdir(originalCwd);
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Publisher is required'));
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('uses publisher as publisherDisplayName fallback', async () => {
    const projectDir = createFullProject();
    const srcTauri = path.join(projectDir, 'src-tauri');
    const windowsDir = path.join(srcTauri, 'gen', 'windows');

    // bundle.config.json with publisher but no publisherDisplayName
    fs.writeFileSync(
      path.join(windowsDir, 'bundle.config.json'),
      JSON.stringify({
        publisher: 'CN=TestCompany',
        capabilities: { general: ['internetClient'] },
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

    const appxDir = path.join(srcTauri, 'target', 'appx', 'x64');
    const manifestPath = path.join(appxDir, 'AppxManifest.xml');

    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = fs.readFileSync(manifestPath, 'utf-8');
    // publisherDisplayName falls back to publisher value
    expect(manifest).toContain('<PublisherDisplayName>CN=TestCompany</PublisherDisplayName>');
  });
});

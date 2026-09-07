import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { prepareAppxContent } from '../src/core/appx-content.js';
import { generateManifestTemplate } from '../src/core/manifest.js';
import type { MergedConfig, TauriConfig } from '../src/types.js';

describe('prepareAppxContent', () => {
  let tempDir: string;
  let windowsDir: string;

  const mockConfig: MergedConfig = {
    displayName: 'TestApp',
    version: '1.0.0.0',
    description: 'A test application',
    identifier: 'com.example.testapp',
    publisher: 'CN=TestCompany',
    publisherDisplayName: 'Test Company',
    capabilities: { general: ['internetClient'] },
  };

  const mockTauriConfig: TauriConfig = {
    productName: 'TestApp',
    version: '1.0.0',
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tauri-bundle-test-'));
    // Create windowsDir and seed it with the bundled template
    windowsDir = path.join(tempDir, 'src-tauri', 'gen', 'windows');
    fs.mkdirSync(windowsDir, { recursive: true });
    generateManifestTemplate(windowsDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates AppxContent directory structure', () => {
    // Create required exe
    const buildDir = path.join(tempDir, 'src-tauri', 'target', 'x86_64-pc-windows-msvc', 'release');
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, 'TestApp.exe'), 'mock exe');

    const result = prepareAppxContent(
      tempDir,
      'x64',
      mockConfig,
      mockTauriConfig,
      '10.0.17763.0',
      windowsDir
    );

    expect(fs.existsSync(result)).toBe(true);
    expect(fs.existsSync(path.join(result, 'Assets'))).toBe(true);
  });

  it('copies executable to appx directory', () => {
    const buildDir = path.join(tempDir, 'src-tauri', 'target', 'x86_64-pc-windows-msvc', 'release');
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, 'TestApp.exe'), 'mock exe content');

    const result = prepareAppxContent(
      tempDir,
      'x64',
      mockConfig,
      mockTauriConfig,
      '10.0.17763.0',
      windowsDir
    );

    expect(fs.existsSync(path.join(result, 'TestApp.exe'))).toBe(true);
  });

  it('clears stale files from existing appx directory', () => {
    const buildDir = path.join(tempDir, 'src-tauri', 'target', 'x86_64-pc-windows-msvc', 'release');
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, 'TestApp.exe'), 'mock exe content');

    const existingAppxDir = path.join(tempDir, 'src-tauri', 'target', 'appx', 'x64');
    fs.mkdirSync(path.join(existingAppxDir, 'Assets'), { recursive: true });
    fs.writeFileSync(path.join(existingAppxDir, 'stale.txt'), 'stale');
    fs.writeFileSync(path.join(existingAppxDir, 'Assets', 'stale.png'), 'stale image');

    const result = prepareAppxContent(
      tempDir,
      'x64',
      mockConfig,
      mockTauriConfig,
      '10.0.17763.0',
      windowsDir
    );

    expect(fs.existsSync(path.join(result, 'stale.txt'))).toBe(false);
    expect(fs.existsSync(path.join(result, 'Assets', 'stale.png'))).toBe(false);
    expect(fs.existsSync(path.join(result, 'TestApp.exe'))).toBe(true);
    expect(fs.existsSync(path.join(result, 'AppxManifest.xml'))).toBe(true);
  });

  it('generates AppxManifest.xml', () => {
    const buildDir = path.join(tempDir, 'src-tauri', 'target', 'x86_64-pc-windows-msvc', 'release');
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, 'TestApp.exe'), 'mock exe');

    const result = prepareAppxContent(
      tempDir,
      'x64',
      mockConfig,
      mockTauriConfig,
      '10.0.17763.0',
      windowsDir
    );

    const manifestPath = path.join(result, 'AppxManifest.xml');
    expect(fs.existsSync(manifestPath)).toBe(true);

    const content = fs.readFileSync(manifestPath, 'utf-8');
    expect(content).toContain('TestApp');
    expect(content).toContain('CN=TestCompany');
  });

  it('throws error when executable not found', () => {
    expect(() =>
      prepareAppxContent(tempDir, 'x64', mockConfig, mockTauriConfig, '10.0.17763.0', windowsDir)
    ).toThrow('Executable not found');
  });

  it('uses debug build directory when debug=true', () => {
    const buildDir = path.join(tempDir, 'src-tauri', 'target', 'x86_64-pc-windows-msvc', 'debug');
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, 'TestApp.exe'), 'mock debug exe');

    const result = prepareAppxContent(
      tempDir,
      'x64',
      mockConfig,
      mockTauriConfig,
      '10.0.17763.0',
      windowsDir,
      true
    );

    expect(fs.existsSync(path.join(result, 'TestApp.exe'))).toBe(true);
    expect(fs.readFileSync(path.join(result, 'TestApp.exe'), 'utf-8')).toBe('mock debug exe');
  });

  it('throws when debug exe is missing even if release exe exists', () => {
    const releaseDir = path.join(
      tempDir,
      'src-tauri',
      'target',
      'x86_64-pc-windows-msvc',
      'release'
    );
    fs.mkdirSync(releaseDir, { recursive: true });
    fs.writeFileSync(path.join(releaseDir, 'TestApp.exe'), 'mock release exe');

    expect(() =>
      prepareAppxContent(
        tempDir,
        'x64',
        mockConfig,
        mockTauriConfig,
        '10.0.17763.0',
        windowsDir,
        true
      )
    ).toThrow('Executable not found');
  });

  it('reads exe from CARGO_TARGET_DIR when set', () => {
    const customTargetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cargo-target-'));
    const buildDir = path.join(customTargetDir, 'x86_64-pc-windows-msvc', 'release');
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, 'TestApp.exe'), 'mock exe from CARGO_TARGET_DIR');

    const original = process.env.CARGO_TARGET_DIR;
    process.env.CARGO_TARGET_DIR = customTargetDir;
    try {
      const result = prepareAppxContent(
        tempDir,
        'x64',
        mockConfig,
        mockTauriConfig,
        '10.0.17763.0',
        windowsDir
      );
      expect(fs.readFileSync(path.join(result, 'TestApp.exe'), 'utf-8')).toBe(
        'mock exe from CARGO_TARGET_DIR'
      );
    } finally {
      if (original === undefined) delete process.env.CARGO_TARGET_DIR;
      else process.env.CARGO_TARGET_DIR = original;
      fs.rmSync(customTargetDir, { recursive: true, force: true });
    }
  });

  it('handles arm64 architecture', () => {
    const buildDir = path.join(
      tempDir,
      'src-tauri',
      'target',
      'aarch64-pc-windows-msvc',
      'release'
    );
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, 'TestApp.exe'), 'mock exe');

    const result = prepareAppxContent(
      tempDir,
      'arm64',
      mockConfig,
      mockTauriConfig,
      '10.0.17763.0',
      windowsDir
    );

    expect(result).toContain('arm64');
    expect(fs.existsSync(result)).toBe(true);
  });

  it('copies Windows assets if they exist', () => {
    const buildDir = path.join(tempDir, 'src-tauri', 'target', 'x86_64-pc-windows-msvc', 'release');
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, 'TestApp.exe'), 'mock exe');

    const assetsDir = path.join(windowsDir, 'Assets');
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(path.join(assetsDir, 'icon.png'), 'mock icon');

    const result = prepareAppxContent(
      tempDir,
      'x64',
      mockConfig,
      mockTauriConfig,
      '10.0.17763.0',
      windowsDir
    );

    expect(fs.existsSync(path.join(result, 'Assets', 'icon.png'))).toBe(true);
  });

  it('copies bundled resources from tauri config (string pattern)', () => {
    const buildDir = path.join(tempDir, 'src-tauri', 'target', 'x86_64-pc-windows-msvc', 'release');
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, 'TestApp.exe'), 'mock exe');

    const srcTauri = path.join(tempDir, 'src-tauri');
    fs.mkdirSync(path.join(srcTauri, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(srcTauri, 'assets', 'data.txt'), 'test data');

    const configWithResources: TauriConfig = {
      ...mockTauriConfig,
      bundle: {
        resources: ['assets/data.txt'],
      },
    };

    const result = prepareAppxContent(
      tempDir,
      'x64',
      mockConfig,
      configWithResources,
      '10.0.17763.0',
      windowsDir
    );

    expect(fs.existsSync(path.join(result, 'assets', 'data.txt'))).toBe(true);
  });

  it('copies bundled resources with src/target mapping', () => {
    const buildDir = path.join(tempDir, 'src-tauri', 'target', 'x86_64-pc-windows-msvc', 'release');
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, 'TestApp.exe'), 'mock exe');

    const srcTauri = path.join(tempDir, 'src-tauri');
    fs.mkdirSync(path.join(srcTauri, 'data'), { recursive: true });
    fs.writeFileSync(path.join(srcTauri, 'data', 'config.json'), '{}');

    const configWithResources: TauriConfig = {
      ...mockTauriConfig,
      bundle: {
        resources: [{ src: 'data/config.json', target: 'resources/config.json' }],
      },
    };

    const result = prepareAppxContent(
      tempDir,
      'x64',
      mockConfig,
      configWithResources,
      '10.0.17763.0',
      windowsDir
    );

    expect(fs.existsSync(path.join(result, 'resources', 'config.json'))).toBe(true);
  });

  it('copies directory resources', () => {
    const buildDir = path.join(tempDir, 'src-tauri', 'target', 'x86_64-pc-windows-msvc', 'release');
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, 'TestApp.exe'), 'mock exe');

    const srcTauri = path.join(tempDir, 'src-tauri');
    fs.mkdirSync(path.join(srcTauri, 'static', 'images'), { recursive: true });
    fs.writeFileSync(path.join(srcTauri, 'static', 'images', 'logo.png'), 'logo');

    const configWithResources: TauriConfig = {
      ...mockTauriConfig,
      bundle: {
        resources: [{ src: 'static', target: 'static' }],
      },
    };

    const result = prepareAppxContent(
      tempDir,
      'x64',
      mockConfig,
      configWithResources,
      '10.0.17763.0',
      windowsDir
    );

    expect(fs.existsSync(path.join(result, 'static', 'images', 'logo.png'))).toBe(true);
  });

  it('copies bundled resources from tauri config (map form)', () => {
    const buildDir = path.join(tempDir, 'src-tauri', 'target', 'x86_64-pc-windows-msvc', 'release');
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, 'TestApp.exe'), 'mock exe');

    const srcTauri = path.join(tempDir, 'src-tauri');
    fs.mkdirSync(path.join(srcTauri, 'data'), { recursive: true });
    fs.writeFileSync(path.join(srcTauri, 'data', 'config.json'), '{}');
    fs.mkdirSync(path.join(srcTauri, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(srcTauri, 'docs', 'a.md'), 'a');
    fs.writeFileSync(path.join(srcTauri, 'docs', 'b.md'), 'b');

    const configWithResources: TauriConfig = {
      ...mockTauriConfig,
      bundle: {
        resources: {
          'data/config.json': 'resources/config.json',
          'docs/*.md': 'website-docs/',
        },
      },
    };

    const result = prepareAppxContent(
      tempDir,
      'x64',
      mockConfig,
      configWithResources,
      '10.0.17763.0',
      windowsDir
    );

    expect(fs.existsSync(path.join(result, 'resources', 'config.json'))).toBe(true);
    // Glob in map form: files are copied flat into target dir.
    expect(fs.existsSync(path.join(result, 'website-docs', 'a.md'))).toBe(true);
    expect(fs.existsSync(path.join(result, 'website-docs', 'b.md'))).toBe(true);
  });

  it('copies directory resources using string pattern (glob)', () => {
    const buildDir = path.join(tempDir, 'src-tauri', 'target', 'x86_64-pc-windows-msvc', 'release');
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, 'TestApp.exe'), 'mock exe');

    const srcTauri = path.join(tempDir, 'src-tauri');
    fs.mkdirSync(path.join(srcTauri, 'static', 'subdir'), { recursive: true });
    fs.writeFileSync(path.join(srcTauri, 'static', 'subdir', 'file.txt'), 'content');

    const configWithResources: TauriConfig = {
      ...mockTauriConfig,
      bundle: {
        resources: ['static'],
      },
    };

    const result = prepareAppxContent(
      tempDir,
      'x64',
      mockConfig,
      configWithResources,
      '10.0.17763.0',
      windowsDir
    );

    expect(fs.existsSync(path.join(result, 'static', 'subdir', 'file.txt'))).toBe(true);
  });

  it('uses custom local template when present in windowsDir', () => {
    const buildDir = path.join(tempDir, 'src-tauri', 'target', 'x86_64-pc-windows-msvc', 'release');
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, 'TestApp.exe'), 'mock exe');

    // Write a custom template
    const customTemplate = `<?xml version="1.0"?>
<Package>
  <!-- CUSTOM_APPX_MARKER -->
  <Identity Name="{{PACKAGE_NAME}}" Publisher="{{PUBLISHER}}" Version="{{VERSION}}" ProcessorArchitecture="{{ARCH}}" />
  <DisplayName>{{DISPLAY_NAME}}</DisplayName>
  <PublisherDisplayName>{{PUBLISHER_DISPLAY_NAME}}</PublisherDisplayName>
  <MinVersion>{{MIN_VERSION}}</MinVersion>
  <Executable>{{EXECUTABLE}}</Executable>
  <Description>{{DESCRIPTION}}</Description>
{{EXTENSIONS}}
{{CAPABILITIES}}
</Package>`;
    fs.writeFileSync(path.join(windowsDir, 'AppxManifest.xml.template'), customTemplate);

    const result = prepareAppxContent(
      tempDir,
      'x64',
      mockConfig,
      mockTauriConfig,
      '10.0.17763.0',
      windowsDir
    );

    const manifestContent = fs.readFileSync(path.join(result, 'AppxManifest.xml'), 'utf-8');
    expect(manifestContent).toContain('<!-- CUSTOM_APPX_MARKER -->');
    expect(manifestContent).toContain('TestApp');
    expect(manifestContent).not.toContain('{{');
  });
});

describe('bundled resources with parent-directory paths (#128)', () => {
  let tempDir: string;
  let windowsDir: string;
  let buildDir: string;

  const mockConfig: MergedConfig = {
    displayName: 'TestApp',
    version: '1.0.0.0',
    description: 'A test application',
    identifier: 'com.example.testapp',
    publisher: 'CN=TestCompany',
    publisherDisplayName: 'Test Company',
    capabilities: { general: ['internetClient'] },
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tauri-bundle-test-'));
    windowsDir = path.join(tempDir, 'src-tauri', 'gen', 'windows');
    fs.mkdirSync(windowsDir, { recursive: true });
    generateManifestTemplate(windowsDir);
    buildDir = path.join(tempDir, 'src-tauri', 'target', 'x86_64-pc-windows-msvc', 'release');
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, 'TestApp.exe'), 'mock exe');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('maps a "../" array resource to _up_/ inside the package root', () => {
    const shared = path.join(tempDir, 'shared');
    fs.mkdirSync(shared, { recursive: true });
    fs.writeFileSync(path.join(shared, 'a.txt'), 'x');

    const tauriConfig: TauriConfig = { bundle: { resources: ['../shared'] } };
    const appxDir = prepareAppxContent(tempDir, 'x64', mockConfig, tauriConfig, '10.0.17763.0', windowsDir);

    expect(fs.existsSync(path.join(appxDir, '_up_', 'shared', 'a.txt'))).toBe(true);
    // and nothing escaped to the sibling of the package root
    expect(fs.existsSync(path.join(appxDir, '..', 'shared'))).toBe(false);
  });

  it('maps multiple leading "../" segments to nested _up_/ directories', () => {
    const rootFile = path.join(tempDir, 'root.txt');
    fs.writeFileSync(rootFile, 'x');

    const tauriConfig: TauriConfig = { bundle: { resources: ['../root.txt'] } };
    const appxDir = prepareAppxContent(tempDir, 'x64', mockConfig, tauriConfig, '10.0.17763.0', windowsDir);

    expect(fs.existsSync(path.join(appxDir, '_up_', 'root.txt'))).toBe(true);
  });

  it('rejects a map-form target that escapes the package root', () => {
    const dataFile = path.join(tempDir, 'src-tauri', 'data.json');
    fs.writeFileSync(dataFile, '{}');

    const tauriConfig: TauriConfig = { bundle: { resources: { 'data.json': '../evil.json' } } };
    expect(() =>
      prepareAppxContent(tempDir, 'x64', mockConfig, tauriConfig, '10.0.17763.0', windowsDir)
    ).toThrow(/outside the package root/);
  });
});

describe('externalBin sidecars (#127)', () => {
  let tempDir: string;
  let windowsDir: string;

  const mockConfig: MergedConfig = {
    displayName: 'TestApp',
    version: '1.0.0.0',
    description: 'A test application',
    identifier: 'com.example.testapp',
    publisher: 'CN=TestCompany',
    publisherDisplayName: 'Test Company',
    capabilities: { general: ['internetClient'] },
  };

  const triple = 'x86_64-pc-windows-msvc';

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tauri-bundle-test-'));
    windowsDir = path.join(tempDir, 'src-tauri', 'gen', 'windows');
    fs.mkdirSync(windowsDir, { recursive: true });
    generateManifestTemplate(windowsDir);
    const buildDir = path.join(tempDir, 'src-tauri', 'target', triple, 'release');
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, 'TestApp.exe'), 'mock exe');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('copies a sidecar beside the exe without the target-triple suffix', () => {
    const binDir = path.join(tempDir, 'src-tauri', 'binaries');
    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(path.join(binDir, `mytool-${triple}.exe`), 'sidecar');

    const tauriConfig: TauriConfig = { bundle: { externalBin: ['binaries/mytool'] } };
    const appxDir = prepareAppxContent(tempDir, 'x64', mockConfig, tauriConfig, '10.0.17763.0', windowsDir);

    expect(fs.existsSync(path.join(appxDir, 'mytool.exe'))).toBe(true);
    expect(fs.existsSync(path.join(appxDir, `mytool-${triple}.exe`))).toBe(false);
    expect(fs.existsSync(path.join(appxDir, 'binaries'))).toBe(false);
  });

  it('fails the build when a declared sidecar is missing', () => {
    const tauriConfig: TauriConfig = { bundle: { externalBin: ['binaries/ghost'] } };
    expect(() =>
      prepareAppxContent(tempDir, 'x64', mockConfig, tauriConfig, '10.0.17763.0', windowsDir)
    ).toThrow(/Sidecar not found: .*ghost-x86_64-pc-windows-msvc\.exe/);
  });

  it('expands * patterns the way the official bundler does', () => {
    const binDir = path.join(tempDir, 'src-tauri', 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(path.join(binDir, `one-${triple}.exe`), 'a');
    fs.writeFileSync(path.join(binDir, `two-${triple}.exe`), 'b');

    const tauriConfig: TauriConfig = { bundle: { externalBin: ['bin/*'] } };
    const appxDir = prepareAppxContent(tempDir, 'x64', mockConfig, tauriConfig, '10.0.17763.0', windowsDir);

    expect(fs.existsSync(path.join(appxDir, 'one.exe'))).toBe(true);
    expect(fs.existsSync(path.join(appxDir, 'two.exe'))).toBe(true);
  });

  it('rejects a sidecar that would overwrite the main executable', () => {
    const binDir = path.join(tempDir, 'src-tauri', 'binaries');
    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(path.join(binDir, `TestApp-${triple}.exe`), 'impostor');

    const tauriConfig: TauriConfig = { bundle: { externalBin: ['binaries/TestApp'] } };
    expect(() =>
      prepareAppxContent(tempDir, 'x64', mockConfig, tauriConfig, '10.0.17763.0', windowsDir)
    ).toThrow(/collision/);
  });
});

describe('staging hardening (codex round)', () => {
  let tempDir: string;
  let windowsDir: string;
  const triple = 'x86_64-pc-windows-msvc';

  const mockConfig: MergedConfig = {
    displayName: 'TestApp',
    version: '1.0.0.0',
    description: 'A test application',
    identifier: 'com.example.testapp',
    publisher: 'CN=TestCompany',
    publisherDisplayName: 'Test Company',
    capabilities: { general: ['internetClient'] },
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tauri-bundle-test-'));
    windowsDir = path.join(tempDir, 'src-tauri', 'gen', 'windows');
    fs.mkdirSync(windowsDir, { recursive: true });
    generateManifestTemplate(windowsDir);
    const buildDir = path.join(tempDir, 'src-tauri', 'target', triple, 'release');
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, 'TestApp.exe'), 'mock exe');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('rejects a backslash-traversal map target on any host', () => {
    fs.writeFileSync(path.join(tempDir, 'src-tauri', 'data.json'), '{}');
    const tauriConfig: TauriConfig = { bundle: { resources: { 'data.json': '..\\evil.json' } } };
    expect(() =>
      prepareAppxContent(tempDir, 'x64', mockConfig, tauriConfig, '10.0.17763.0', windowsDir)
    ).toThrow(/outside the package root/);
  });

  it('rejects two sidecars that collide on the packaged name', () => {
    for (const dir of ['a', 'b']) {
      const d = path.join(tempDir, 'src-tauri', dir);
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, `tool-${triple}.exe`), dir);
    }
    const tauriConfig: TauriConfig = { bundle: { externalBin: ['a/tool', 'b/tool'] } };
    expect(() =>
      prepareAppxContent(tempDir, 'x64', mockConfig, tauriConfig, '10.0.17763.0', windowsDir)
    ).toThrow(/collision/);
  });

  it('stages a sidecar declared with an absolute path', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'twb-abs-bin-'));
    fs.writeFileSync(path.join(outside, `abs-tool-${triple}.exe`), 'x');
    const tauriConfig: TauriConfig = {
      bundle: { externalBin: [path.join(outside, 'abs-tool')] },
    };
    const appxDir = prepareAppxContent(tempDir, 'x64', mockConfig, tauriConfig, '10.0.17763.0', windowsDir);
    expect(fs.existsSync(path.join(appxDir, 'abs-tool.exe'))).toBe(true);
    fs.rmSync(outside, { recursive: true, force: true });
  });
});

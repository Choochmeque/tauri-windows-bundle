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
    capabilities: ['internetClient'],
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

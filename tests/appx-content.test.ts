import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { prepareAppxContent } from '../src/core/appx-content.js';
import type { MergedConfig, TauriConfig } from '../src/types.js';

describe('prepareAppxContent', () => {
  let tempDir: string;

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
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates AppxContent directory structure', () => {
    // Create required exe
    const buildDir = path.join(tempDir, 'target', 'x86_64-pc-windows-msvc', 'release');
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, 'TestApp.exe'), 'mock exe');

    const result = prepareAppxContent(tempDir, 'x64', mockConfig, mockTauriConfig, '10.0.17763.0');

    expect(fs.existsSync(result)).toBe(true);
    expect(fs.existsSync(path.join(result, 'Assets'))).toBe(true);
  });

  it('copies executable to appx directory', () => {
    const buildDir = path.join(tempDir, 'target', 'x86_64-pc-windows-msvc', 'release');
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, 'TestApp.exe'), 'mock exe content');

    const result = prepareAppxContent(tempDir, 'x64', mockConfig, mockTauriConfig, '10.0.17763.0');

    expect(fs.existsSync(path.join(result, 'TestApp.exe'))).toBe(true);
  });

  it('generates AppxManifest.xml', () => {
    const buildDir = path.join(tempDir, 'target', 'x86_64-pc-windows-msvc', 'release');
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, 'TestApp.exe'), 'mock exe');

    const result = prepareAppxContent(tempDir, 'x64', mockConfig, mockTauriConfig, '10.0.17763.0');

    const manifestPath = path.join(result, 'AppxManifest.xml');
    expect(fs.existsSync(manifestPath)).toBe(true);

    const content = fs.readFileSync(manifestPath, 'utf-8');
    expect(content).toContain('TestApp');
    expect(content).toContain('CN=TestCompany');
  });

  it('throws error when executable not found', () => {
    expect(() =>
      prepareAppxContent(tempDir, 'x64', mockConfig, mockTauriConfig, '10.0.17763.0')
    ).toThrow('Executable not found');
  });

  it('handles arm64 architecture', () => {
    const buildDir = path.join(tempDir, 'target', 'aarch64-pc-windows-msvc', 'release');
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, 'TestApp.exe'), 'mock exe');

    const result = prepareAppxContent(
      tempDir,
      'arm64',
      mockConfig,
      mockTauriConfig,
      '10.0.17763.0'
    );

    expect(result).toContain('arm64');
    expect(fs.existsSync(result)).toBe(true);
  });

  it('copies Windows assets if they exist', () => {
    const buildDir = path.join(tempDir, 'target', 'x86_64-pc-windows-msvc', 'release');
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, 'TestApp.exe'), 'mock exe');

    const assetsDir = path.join(tempDir, 'src-tauri', 'gen', 'windows', 'Assets');
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(path.join(assetsDir, 'icon.png'), 'mock icon');

    const result = prepareAppxContent(tempDir, 'x64', mockConfig, mockTauriConfig, '10.0.17763.0');

    expect(fs.existsSync(path.join(result, 'Assets', 'icon.png'))).toBe(true);
  });

  it('copies bundled resources from tauri config (string pattern)', () => {
    const buildDir = path.join(tempDir, 'target', 'x86_64-pc-windows-msvc', 'release');
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
      '10.0.17763.0'
    );

    expect(fs.existsSync(path.join(result, 'assets', 'data.txt'))).toBe(true);
  });

  it('copies bundled resources with src/target mapping', () => {
    const buildDir = path.join(tempDir, 'target', 'x86_64-pc-windows-msvc', 'release');
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
      '10.0.17763.0'
    );

    expect(fs.existsSync(path.join(result, 'resources', 'config.json'))).toBe(true);
  });

  it('copies directory resources', () => {
    const buildDir = path.join(tempDir, 'target', 'x86_64-pc-windows-msvc', 'release');
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
      '10.0.17763.0'
    );

    expect(fs.existsSync(path.join(result, 'static', 'images', 'logo.png'))).toBe(true);
  });
});

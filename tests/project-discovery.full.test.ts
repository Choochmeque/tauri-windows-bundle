import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  findProjectRoot,
  readTauriConfig,
  readBundleConfig,
  getWindowsDir,
} from '../src/core/project-discovery.js';

describe('findProjectRoot', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tauri-bundle-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('finds project root with tauri.conf.json', () => {
    const srcTauri = path.join(tempDir, 'src-tauri');
    fs.mkdirSync(srcTauri, { recursive: true });
    fs.writeFileSync(path.join(srcTauri, 'tauri.conf.json'), '{}');

    const result = findProjectRoot(tempDir);
    expect(result).toBe(tempDir);
  });

  it('finds project root from subdirectory', () => {
    const srcTauri = path.join(tempDir, 'src-tauri');
    const subDir = path.join(tempDir, 'some', 'nested', 'dir');
    fs.mkdirSync(srcTauri, { recursive: true });
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(path.join(srcTauri, 'tauri.conf.json'), '{}');

    const result = findProjectRoot(subDir);
    expect(result).toBe(tempDir);
  });

  it('finds project with package.json and src-tauri', () => {
    const srcTauri = path.join(tempDir, 'src-tauri');
    fs.mkdirSync(srcTauri, { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'package.json'), '{}');

    const result = findProjectRoot(tempDir);
    expect(result).toBe(tempDir);
  });

  it('throws error when project not found', () => {
    expect(() => findProjectRoot(tempDir)).toThrow('Could not find Tauri project root');
  });
});

describe('readTauriConfig', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tauri-bundle-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('reads and parses tauri.conf.json', () => {
    const srcTauri = path.join(tempDir, 'src-tauri');
    fs.mkdirSync(srcTauri, { recursive: true });
    fs.writeFileSync(
      path.join(srcTauri, 'tauri.conf.json'),
      JSON.stringify({ productName: 'TestApp', version: '1.0.0' })
    );

    const config = readTauriConfig(tempDir);
    expect(config.productName).toBe('TestApp');
    expect(config.version).toBe('1.0.0');
  });

  it('throws error when config not found', () => {
    expect(() => readTauriConfig(tempDir)).toThrow('tauri.conf.json not found');
  });

  it('throws error on invalid JSON', () => {
    const srcTauri = path.join(tempDir, 'src-tauri');
    fs.mkdirSync(srcTauri, { recursive: true });
    fs.writeFileSync(path.join(srcTauri, 'tauri.conf.json'), 'invalid json');

    expect(() => readTauriConfig(tempDir)).toThrow('Failed to parse tauri.conf.json');
  });
});

describe('readBundleConfig', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tauri-bundle-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('reads and parses bundle.config.json', () => {
    fs.writeFileSync(
      path.join(tempDir, 'bundle.config.json'),
      JSON.stringify({ publisher: 'CN=Test', publisherDisplayName: 'Test' })
    );

    const config = readBundleConfig(tempDir);
    expect(config.publisher).toBe('CN=Test');
    expect(config.publisherDisplayName).toBe('Test');
  });

  it('throws error when config not found', () => {
    expect(() => readBundleConfig(tempDir)).toThrow(
      "bundle.config.json not found. Run 'tauri-windows-bundle init' first."
    );
  });

  it('throws error on invalid JSON', () => {
    fs.writeFileSync(path.join(tempDir, 'bundle.config.json'), 'invalid json');

    expect(() => readBundleConfig(tempDir)).toThrow('Failed to parse bundle.config.json');
  });
});

describe('getWindowsDir', () => {
  it('returns correct windows directory path', () => {
    const result = getWindowsDir('/project');
    expect(result).toBe(path.join('/project', 'src-tauri', 'gen', 'windows'));
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { generateBundleConfig, generateGitignore } from '../src/generators/config.js';
import type { TauriConfig } from '../src/types.js';
import { DEFAULT_CAPABILITIES } from '../src/types.js';

describe('generateBundleConfig', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tauri-bundle-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates bundle.config.json file', () => {
    const tauriConfig: TauriConfig = { productName: 'TestApp' };
    generateBundleConfig(tempDir, tauriConfig);

    const configPath = path.join(tempDir, 'bundle.config.json');
    expect(fs.existsSync(configPath)).toBe(true);
  });

  it('generates valid JSON config', () => {
    const tauriConfig: TauriConfig = { productName: 'TestApp' };
    generateBundleConfig(tempDir, tauriConfig);

    const configPath = path.join(tempDir, 'bundle.config.json');
    const content = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content);

    expect(config.publisher).toBe('CN=YourCompany');
    expect(config.publisherDisplayName).toBe('Your Company Name');
  });

  it('includes default capabilities', () => {
    const tauriConfig: TauriConfig = {};
    generateBundleConfig(tempDir, tauriConfig);

    const configPath = path.join(tempDir, 'bundle.config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    expect(config.capabilities).toEqual(DEFAULT_CAPABILITIES);
  });

  it('includes extensions configuration', () => {
    const tauriConfig: TauriConfig = {};
    generateBundleConfig(tempDir, tauriConfig);

    const configPath = path.join(tempDir, 'bundle.config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    expect(config.extensions).toEqual({
      shareTarget: false,
      fileAssociations: [],
      protocolHandlers: [],
    });
  });

  it('includes signing configuration', () => {
    const tauriConfig: TauriConfig = {};
    generateBundleConfig(tempDir, tauriConfig);

    const configPath = path.join(tempDir, 'bundle.config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    expect(config.signing).toEqual({
      pfx: null,
      pfxPassword: null,
    });
  });
});

describe('generateGitignore', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tauri-bundle-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates .gitignore file', () => {
    generateGitignore(tempDir);

    const gitignorePath = path.join(tempDir, '.gitignore');
    expect(fs.existsSync(gitignorePath)).toBe(true);
  });

  it('contains expected content', () => {
    generateGitignore(tempDir);

    const gitignorePath = path.join(tempDir, '.gitignore');
    const content = fs.readFileSync(gitignorePath, 'utf-8');

    expect(content).toContain('# Generated files');
  });
});

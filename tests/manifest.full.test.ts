import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { generateManifestTemplate } from '../src/core/manifest.js';

describe('generateManifestTemplate', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tauri-bundle-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates AppxManifest.xml.template file', () => {
    generateManifestTemplate(tempDir);

    const templatePath = path.join(tempDir, 'AppxManifest.xml.template');
    expect(fs.existsSync(templatePath)).toBe(true);
  });

  it('generates valid XML template', () => {
    generateManifestTemplate(tempDir);

    const templatePath = path.join(tempDir, 'AppxManifest.xml.template');
    const content = fs.readFileSync(templatePath, 'utf-8');

    expect(content).toContain('<?xml version="1.0" encoding="utf-8"?>');
    expect(content).toContain('<Package');
    expect(content).toContain('{{PACKAGE_NAME}}');
    expect(content).toContain('{{PUBLISHER}}');
    expect(content).toContain('{{VERSION}}');
    expect(content).toContain('{{ARCH}}');
    expect(content).toContain('{{DISPLAY_NAME}}');
    expect(content).toContain('{{EXTENSIONS}}');
    expect(content).toContain('{{CAPABILITIES}}');
  });
});

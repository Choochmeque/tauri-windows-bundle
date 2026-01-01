import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { generateAssets } from '../src/generators/assets.js';
import { MSIX_ASSETS } from '../src/types.js';

describe('generateAssets', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tauri-bundle-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates Assets directory', async () => {
    await generateAssets(tempDir);
    expect(fs.existsSync(path.join(tempDir, 'Assets'))).toBe(true);
  });

  it('generates all required MSIX assets', async () => {
    await generateAssets(tempDir);
    for (const asset of MSIX_ASSETS) {
      const assetPath = path.join(tempDir, 'Assets', asset.name);
      expect(fs.existsSync(assetPath)).toBe(true);
    }
  });

  it('generates valid PNG files', async () => {
    await generateAssets(tempDir);
    const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    for (const asset of MSIX_ASSETS) {
      const assetPath = path.join(tempDir, 'Assets', asset.name);
      const content = fs.readFileSync(assetPath);
      expect(content.subarray(0, 8).equals(pngSignature)).toBe(true);
    }
  });

  it('generates PNG files with correct IHDR chunk', async () => {
    await generateAssets(tempDir);

    // Check StoreLogo.png (50x50)
    const storeLogo = fs.readFileSync(path.join(tempDir, 'Assets', 'StoreLogo.png'));
    // IHDR starts after signature (8 bytes) + length (4 bytes) + type (4 bytes) = 16 bytes
    const width = storeLogo.readUInt32BE(16);
    const height = storeLogo.readUInt32BE(20);
    expect(width).toBe(50);
    expect(height).toBe(50);
  });

  it('generates Wide310x150Logo with correct dimensions', async () => {
    await generateAssets(tempDir);

    const wideLogo = fs.readFileSync(path.join(tempDir, 'Assets', 'Wide310x150Logo.png'));
    const width = wideLogo.readUInt32BE(16);
    const height = wideLogo.readUInt32BE(20);
    expect(width).toBe(310);
    expect(height).toBe(150);
  });
});

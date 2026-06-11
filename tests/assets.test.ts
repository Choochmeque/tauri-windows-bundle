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

  it('returns false when no projectRoot provided', async () => {
    const result = await generateAssets(tempDir);
    expect(result).toBe(false);
  });

  it('returns false when projectRoot has no Tauri icons', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tauri-project-'));
    try {
      const result = await generateAssets(tempDir, projectRoot);
      expect(result).toBe(false);
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('copies icons from src-tauri/icons when available', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tauri-project-'));
    const iconsDir = path.join(projectRoot, 'src-tauri', 'icons');
    fs.mkdirSync(iconsDir, { recursive: true });

    // Create test icons (valid PNG files)
    const testPng = createTestPng(50, 50);
    fs.writeFileSync(path.join(iconsDir, 'StoreLogo.png'), testPng);
    fs.writeFileSync(path.join(iconsDir, 'Square44x44Logo.png'), createTestPng(44, 44));
    fs.writeFileSync(path.join(iconsDir, 'Square150x150Logo.png'), createTestPng(150, 150));

    try {
      const result = await generateAssets(tempDir, projectRoot);
      expect(result).toBe(true);

      // Verify icons were copied
      const copied = fs.readFileSync(path.join(tempDir, 'Assets', 'StoreLogo.png'));
      expect(copied.equals(testPng)).toBe(true);
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('generates Wide310x150Logo from square icon using image-js', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tauri-project-'));
    const iconsDir = path.join(projectRoot, 'src-tauri', 'icons');
    fs.mkdirSync(iconsDir, { recursive: true });

    // Create Square150x150Logo.png for wide tile generation
    fs.writeFileSync(path.join(iconsDir, 'Square150x150Logo.png'), createTestPng(150, 150));

    try {
      const result = await generateAssets(tempDir, projectRoot);
      expect(result).toBe(true);

      // Verify Wide310x150Logo was generated
      const wideLogo = fs.readFileSync(path.join(tempDir, 'Assets', 'Wide310x150Logo.png'));
      expect(wideLogo.length).toBeGreaterThan(0);

      // Check PNG signature
      const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
      expect(wideLogo.subarray(0, 8).equals(pngSignature)).toBe(true);
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('falls back to placeholder for Wide310x150Logo when no source icon', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tauri-project-'));
    const iconsDir = path.join(projectRoot, 'src-tauri', 'icons');
    fs.mkdirSync(iconsDir, { recursive: true });

    // Create only StoreLogo, no square icons for wide tile generation
    fs.writeFileSync(path.join(iconsDir, 'StoreLogo.png'), createTestPng(50, 50));

    try {
      const result = await generateAssets(tempDir, projectRoot);
      expect(result).toBe(true); // Still true because StoreLogo was copied

      // Wide tile should still exist (as placeholder)
      const wideLogo = fs.readFileSync(path.join(tempDir, 'Assets', 'Wide310x150Logo.png'));
      expect(wideLogo.length).toBeGreaterThan(0);
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('does not generate LargeTile.png', async () => {
    await generateAssets(tempDir);
    expect(fs.existsSync(path.join(tempDir, 'Assets', 'LargeTile.png'))).toBe(false);
  });
});

describe('generateAssets variants', () => {
  let tempDir: string;
  let projectRoot: string;
  let iconsDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tauri-bundle-test-'));
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tauri-project-'));
    iconsDir = path.join(projectRoot, 'src-tauri', 'icons');
    fs.mkdirSync(iconsDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  function readIhdrWidthHeight(p: string): [number, number] {
    const buf = fs.readFileSync(p);
    return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  }

  it('does not generate any variants by default', async () => {
    fs.writeFileSync(path.join(iconsDir, 'icon.png'), createTestPng(310, 310));
    await generateAssets(tempDir, projectRoot);

    const files = fs.readdirSync(path.join(tempDir, 'Assets'));
    expect(files.some((f) => f.includes('.scale-'))).toBe(false);
    expect(files.some((f) => f.includes('.targetsize-'))).toBe(false);
  });

  it('generates scale variants for 3 assets x 5 factors (no wide, no LargeTile)', async () => {
    fs.writeFileSync(path.join(iconsDir, 'icon.png'), createTestPng(310, 310));
    await generateAssets(tempDir, projectRoot, { scale: true });

    const assetsDir = path.join(tempDir, 'Assets');
    const factors = [100, 125, 150, 200, 400];
    const bases = ['StoreLogo', 'Square44x44Logo', 'Square150x150Logo'];

    for (const base of bases) {
      for (const f of factors) {
        expect(fs.existsSync(path.join(assetsDir, `${base}.scale-${f}.png`))).toBe(true);
      }
    }

    // Wide tile and LargeTile must not be scaled
    const files = fs.readdirSync(assetsDir);
    expect(files.some((f) => f.startsWith('Wide310x150Logo.scale-'))).toBe(false);
    expect(files.some((f) => f.startsWith('LargeTile.'))).toBe(false);

    // Spot-check dimensions
    const [w, h] = readIhdrWidthHeight(path.join(assetsDir, 'Square150x150Logo.scale-200.png'));
    expect(w).toBe(300);
    expect(h).toBe(300);
  });

  it('generates targetSize variants for Square44x44Logo only', async () => {
    fs.writeFileSync(path.join(iconsDir, 'icon.png'), createTestPng(310, 310));
    await generateAssets(tempDir, projectRoot, { targetSize: true });

    const assetsDir = path.join(tempDir, 'Assets');
    for (const size of [16, 24, 32, 48, 256]) {
      expect(fs.existsSync(path.join(assetsDir, `Square44x44Logo.targetsize-${size}.png`))).toBe(
        true
      );
    }

    const [w, h] = readIhdrWidthHeight(path.join(assetsDir, 'Square44x44Logo.targetsize-256.png'));
    expect(w).toBe(256);
    expect(h).toBe(256);
  });

  it('generates unplated and light-unplated variants', async () => {
    fs.writeFileSync(path.join(iconsDir, 'icon.png'), createTestPng(310, 310));
    await generateAssets(tempDir, projectRoot, { unplated: true, lightUnplated: true });

    const assetsDir = path.join(tempDir, 'Assets');
    for (const size of [16, 24, 32, 48, 256]) {
      expect(
        fs.existsSync(
          path.join(assetsDir, `Square44x44Logo.targetsize-${size}_altform-unplated.png`)
        )
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(assetsDir, `Square44x44Logo.targetsize-${size}_altform-lightunplated.png`)
        )
      ).toBe(true);
    }
  });

  it('falls back to Square310x310Logo.png when icon.png missing', async () => {
    fs.writeFileSync(path.join(iconsDir, 'Square310x310Logo.png'), createTestPng(310, 310));
    await generateAssets(tempDir, projectRoot, { targetSize: true });

    const assetsDir = path.join(tempDir, 'Assets');
    expect(fs.existsSync(path.join(assetsDir, 'Square44x44Logo.targetsize-32.png'))).toBe(true);
  });

  it('falls back to 128x128.png when neither icon.png nor Square310x310Logo present', async () => {
    fs.writeFileSync(path.join(iconsDir, '128x128.png'), createTestPng(128, 128));
    await generateAssets(tempDir, projectRoot, { targetSize: true });

    const assetsDir = path.join(tempDir, 'Assets');
    expect(fs.existsSync(path.join(assetsDir, 'Square44x44Logo.targetsize-32.png'))).toBe(true);
  });

  it('skips variant generation with warning when no source icon found', async () => {
    await generateAssets(tempDir, projectRoot, { scale: true });

    const files = fs.readdirSync(path.join(tempDir, 'Assets'));
    expect(files.some((f) => f.includes('.scale-'))).toBe(false);
    expect(files.some((f) => f.includes('.targetsize-'))).toBe(false);
  });
});

// Helper to create a minimal valid PNG
function createTestPng(width: number, height: number): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8);
  ihdrData.writeUInt8(2, 9);
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);
  const ihdrChunk = createChunk('IHDR', ihdrData);

  const rawData: number[] = [];
  for (let y = 0; y < height; y++) {
    rawData.push(0);
    for (let x = 0; x < width; x++) {
      rawData.push(128, 128, 128);
    }
  }

  const uncompressed = Buffer.from(rawData);
  const compressed = deflateStore(uncompressed);
  const idatChunk = createChunk('IDAT', compressed);

  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = crc32(crcData);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc >>> 0, 0);
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function deflateStore(data: Buffer): Buffer {
  const result: number[] = [0x78, 0x01];
  let remaining = data.length;
  let offset = 0;
  while (remaining > 0) {
    const blockSize = Math.min(remaining, 65535);
    const isLast = remaining <= 65535;
    result.push(isLast ? 0x01 : 0x00);
    result.push(blockSize & 0xff);
    result.push((blockSize >> 8) & 0xff);
    result.push(~blockSize & 0xff);
    result.push((~blockSize >> 8) & 0xff);
    for (let i = 0; i < blockSize; i++) {
      result.push(data[offset + i]);
    }
    offset += blockSize;
    remaining -= blockSize;
  }
  const adler = adler32(data);
  result.push((adler >> 24) & 0xff);
  result.push((adler >> 16) & 0xff);
  result.push((adler >> 8) & 0xff);
  result.push(adler & 0xff);
  return Buffer.from(result);
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return crc ^ 0xffffffff;
}

function adler32(data: Buffer): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % 65521;
    b = (b + a) % 65521;
  }
  return (b << 16) | a;
}

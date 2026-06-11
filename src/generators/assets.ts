import * as fs from 'node:fs';
import * as path from 'node:path';
import { Image, read, write } from 'image-js';
import { MSIX_ASSETS, SCALE_FACTORS, TARGET_SIZES } from '../types.js';
import type { VariantOptions } from '../types.js';

// Map MSIX asset names to Tauri icon names
const TAURI_ICON_MAP: Record<string, string> = {
  'StoreLogo.png': 'StoreLogo.png',
  'Square44x44Logo.png': 'Square44x44Logo.png',
  'Square150x150Logo.png': 'Square150x150Logo.png',
};

const VARIANT_SOURCE_CANDIDATES = ['icon.png', 'Square310x310Logo.png', '128x128.png'];

function getTauriIconsDir(projectRoot: string): string {
  return path.join(projectRoot, 'src-tauri', 'icons');
}

export async function generateAssets(
  windowsDir: string,
  projectRoot?: string,
  variants?: VariantOptions
): Promise<boolean> {
  const assetsDir = path.join(windowsDir, 'Assets');
  fs.mkdirSync(assetsDir, { recursive: true });

  const tauriIconsDir = projectRoot ? getTauriIconsDir(projectRoot) : null;
  let copiedFromTauri = false;

  for (const asset of MSIX_ASSETS) {
    const width = asset.width || asset.size || 50;
    const height = asset.height || asset.size || 50;
    const assetPath = path.join(assetsDir, asset.name);

    // Check if we can copy from Tauri icons
    const tauriIconName = TAURI_ICON_MAP[asset.name];
    const tauriIconPath =
      tauriIconsDir && tauriIconName ? path.join(tauriIconsDir, tauriIconName) : null;

    if (tauriIconPath && fs.existsSync(tauriIconPath)) {
      fs.copyFileSync(tauriIconPath, assetPath);
      copiedFromTauri = true;
    } else if (asset.name === 'Wide310x150Logo.png' && tauriIconsDir) {
      // Generate wide tile from square icon
      const generated = await generateWideTile(tauriIconsDir, assetPath);
      if (!generated) {
        const pngData = createPlaceholderPng(width, height);
        fs.writeFileSync(assetPath, pngData);
      } else {
        copiedFromTauri = true;
      }
    } else {
      // Fall back to placeholder
      const pngData = createPlaceholderPng(width, height);
      fs.writeFileSync(assetPath, pngData);
    }
  }

  if (copiedFromTauri) {
    console.log('  Copied assets from src-tauri/icons');
  } else {
    console.log('  Generated placeholder assets - replace with real icons before publishing');
  }

  if (
    variants &&
    (variants.scale || variants.targetSize || variants.unplated || variants.lightUnplated)
  ) {
    const sourcePath = resolveVariantSource(tauriIconsDir);
    if (!sourcePath) {
      console.log(
        `  Skipping variants: no suitable source icon found (looked for ${VARIANT_SOURCE_CANDIDATES.join(', ')})`
      );
    } else {
      console.log(`  Generating variants from ${path.basename(sourcePath)}`);
      if (variants.scale) {
        await generateScaleVariants(assetsDir, sourcePath);
        console.log('    Scale variants written');
      }
      if (variants.targetSize) {
        await generateTargetSizeVariants(assetsDir, sourcePath, null);
        console.log('    TargetSize variants written');
      }
      if (variants.unplated) {
        await generateTargetSizeVariants(assetsDir, sourcePath, 'unplated');
        console.log('    Unplated variants written');
      }
      if (variants.lightUnplated) {
        await generateTargetSizeVariants(assetsDir, sourcePath, 'lightunplated');
        console.log('    Light-unplated variants written');
      }
    }
  }

  return copiedFromTauri;
}

function resolveVariantSource(tauriIconsDir: string | null): string | null {
  if (!tauriIconsDir) return null;
  for (const name of VARIANT_SOURCE_CANDIDATES) {
    const candidate = path.join(tauriIconsDir, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function variantFilename(baseName: string, suffix: string): string {
  const stem = baseName.replace(/\.png$/i, '');
  return `${stem}.${suffix}.png`;
}

async function generateScaleVariants(assetsDir: string, sourcePath: string): Promise<void> {
  const source = await read(sourcePath);
  for (const asset of MSIX_ASSETS) {
    if (asset.skipScaleVariants) continue;
    const baseW = asset.width || asset.size || 50;
    const baseH = asset.height || asset.size || 50;
    for (const factor of SCALE_FACTORS) {
      const w = Math.round((baseW * factor) / 100);
      const h = Math.round((baseH * factor) / 100);
      const resized = source.resize({ width: w, height: h });
      const outPath = path.join(assetsDir, variantFilename(asset.name, `scale-${factor}`));
      await write(outPath, resized);
    }
  }
}

async function generateTargetSizeVariants(
  assetsDir: string,
  sourcePath: string,
  altform: 'unplated' | 'lightunplated' | null
): Promise<void> {
  const source = await read(sourcePath);
  const suffixBase = 'Square44x44Logo.png';
  for (const size of TARGET_SIZES) {
    const resized = source.resize({ width: size, height: size });
    const suffix = altform ? `targetsize-${size}_altform-${altform}` : `targetsize-${size}`;
    const outPath = path.join(assetsDir, variantFilename(suffixBase, suffix));
    await write(outPath, resized);
  }
}

async function generateWideTile(tauriIconsDir: string, outputPath: string): Promise<boolean> {
  // Try to find a square icon to use as source
  const sourceIcons = ['Square150x150Logo.png', 'Square142x142Logo.png', 'icon.png', '128x128.png'];

  for (const iconName of sourceIcons) {
    const iconPath = path.join(tauriIconsDir, iconName);
    if (fs.existsSync(iconPath)) {
      try {
        const image = await read(iconPath);
        const iconSize = 150; // Height of the wide tile
        const resized = image.resize({ width: iconSize, height: iconSize });

        // Create 310x150 canvas with transparent background (RGBA)
        const canvas = new Image(310, 150, { colorModel: 'RGBA' });
        const x = Math.floor((310 - iconSize) / 2);
        resized.copyTo(canvas, { origin: { column: x, row: 0 } });
        await write(outputPath, canvas);
        return true;
      } catch {
        // Try next icon
      }
    }
  }

  return false;
}

function createPlaceholderPng(width: number, height: number): Buffer {
  // Create a minimal valid PNG file (solid gray square)
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // bit depth
  ihdrData.writeUInt8(2, 9); // color type (RGB)
  ihdrData.writeUInt8(0, 10); // compression
  ihdrData.writeUInt8(0, 11); // filter
  ihdrData.writeUInt8(0, 12); // interlace
  const ihdrChunk = createChunk('IHDR', ihdrData);

  // IDAT chunk - raw image data (gray pixels)
  const rawData: number[] = [];
  for (let y = 0; y < height; y++) {
    rawData.push(0); // filter byte
    for (let x = 0; x < width; x++) {
      rawData.push(128, 128, 128); // gray RGB
    }
  }

  // Simple deflate compression (store block)
  const uncompressed = Buffer.from(rawData);
  const compressed = deflateStore(uncompressed);
  const idatChunk = createChunk('IDAT', compressed);

  // IEND chunk
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
  // Zlib header + store blocks
  const result: number[] = [0x78, 0x01]; // zlib header

  let remaining = data.length;
  let offset = 0;

  while (remaining > 0) {
    const blockSize = Math.min(remaining, 65535);
    const isLast = remaining <= 65535;

    result.push(isLast ? 0x01 : 0x00); // BFINAL + BTYPE=00
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

  // Adler-32 checksum
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

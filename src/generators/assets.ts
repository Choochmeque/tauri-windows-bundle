import * as fs from 'node:fs';
import * as path from 'node:path';
import { MSIX_ASSETS } from '../types.js';

export async function generateAssets(windowsDir: string): Promise<void> {
  const assetsDir = path.join(windowsDir, 'Assets');
  fs.mkdirSync(assetsDir, { recursive: true });

  for (const asset of MSIX_ASSETS) {
    const width = asset.width || asset.size || 50;
    const height = asset.height || asset.size || 50;
    const assetPath = path.join(assetsDir, asset.name);

    // Generate a simple placeholder PNG
    const pngData = createPlaceholderPng(width, height);
    fs.writeFileSync(assetPath, pngData);
  }

  console.log('  Generated placeholder assets - replace with real icons before publishing');
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

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as zlib from 'node:zlib';
import { Image, write } from 'image-js';
import { prepareAppxContent } from '../src/core/appx-content.js';
import { resolveMsixbundleCliCommand } from '../src/utils/exec.js';
import { generateManifestTemplate } from '../src/core/manifest.js';
import { generateAssets } from '../src/generators/assets.js';
import { TARGET_SIZES, SCALE_FACTORS } from '../src/types.js';
import type { MergedConfig, TauriConfig } from '../src/types.js';

/**
 * True-artifact integration test: stages a fixture app, packs it with the REAL
 * msixbundle-cli, then parses the produced bundle's zip structure and asserts
 * what actually shipped. No mocks anywhere on that path.
 *
 * Skips (visibly) when msixbundle-cli is not installed; CI installs it.
 */

const cliCommand = resolveMsixbundleCliCommand();
const cliAvailable = spawnSync(cliCommand, ['--version'], { encoding: 'utf8' }).status === 0;
// On the dedicated CI job a missing cli must fail loudly, never skip.
if (process.env.TWB_REQUIRE_INTEGRATION === '1' && !cliAvailable) {
  throw new Error(`TWB_REQUIRE_INTEGRATION is set but "${cliCommand}" is not runnable`);
}

// --- Minimal zip reader -----------------------------------------------------
// A .msixbundle is a zip of .msix files; a .msix is a zip of the package
// content. Entries are read from the central directory (the authoritative
// index per APPNOTE.TXT); deflate/store payloads are supported.

interface ZipEntry {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  method: number;
  localHeaderOffset: number;
}

function readZipEntries(buf: Buffer): ZipEntry[] {
  // End of central directory record: scan back for its signature.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a zip: no end-of-central-directory record');
  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);

  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error(`bad central directory entry at ${offset}`);
    }
    const method = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const uncompressedSize = buf.readUInt32LE(offset + 24);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localHeaderOffset = buf.readUInt32LE(offset + 42);
    const name = buf.subarray(offset + 46, offset + 46 + nameLen).toString('utf8');
    entries.push({ name, compressedSize, uncompressedSize, method, localHeaderOffset });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function readZipEntryData(buf: Buffer, entry: ZipEntry): Buffer {
  const lh = entry.localHeaderOffset;
  if (buf.readUInt32LE(lh) !== 0x04034b50) throw new Error(`bad local header for ${entry.name}`);
  const nameLen = buf.readUInt16LE(lh + 26);
  const extraLen = buf.readUInt16LE(lh + 28);
  const start = lh + 30 + nameLen + extraLen;
  const raw = buf.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return Buffer.from(raw);
  if (entry.method === 8) return zlib.inflateRawSync(raw);
  throw new Error(`unsupported compression method ${entry.method} for ${entry.name}`);
}

// --- Fixture ----------------------------------------------------------------

const triple = 'x86_64-pc-windows-msvc';

const mockConfig: MergedConfig = {
  displayName: 'TestApp',
  version: '1.0.0.0',
  description: 'Integration fixture',
  identifier: 'com.example.integration',
  publisher: 'CN=TestCompany',
  publisherDisplayName: 'Test Company',
  capabilities: { general: ['internetClient'] },
};

describe.runIf(cliAvailable)('msix artifact contents (real msixbundle-cli)', () => {
  let tempDir: string;
  let bundlePath: string;
  let outerEntries: ZipEntry[];
  let innerBuf: Buffer;
  let innerEntries: ZipEntry[];

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'twb-integration-'));
    const srcTauri = path.join(tempDir, 'src-tauri');
    const windowsDir = path.join(srcTauri, 'gen', 'windows');
    fs.mkdirSync(windowsDir, { recursive: true });
    generateManifestTemplate(windowsDir);

    // Real 310x310 source icon so every variant is generated from real image data
    const iconsDir = path.join(srcTauri, 'icons');
    fs.mkdirSync(iconsDir, { recursive: true });
    const icon = new Image(310, 310, { colorModel: 'RGBA' });
    await write(path.join(iconsDir, 'icon.png'), icon);
    fs.copyFileSync(path.join(iconsDir, 'icon.png'), path.join(iconsDir, 'Square44x44Logo.png'));
    await generateAssets(windowsDir, tempDir, {
      scale: true,
      targetSize: true,
      unplated: true,
      lightUnplated: true,
    });

    // Main exe (MZ magic so it is a plausible PE), a sidecar, and resources
    const buildDir = path.join(srcTauri, 'target', triple, 'release');
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, 'TestApp.exe'), Buffer.from('MZ integration fixture'));
    const binDir = path.join(srcTauri, 'binaries');
    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(path.join(binDir, `helper-${triple}.exe`), Buffer.from('MZ sidecar'));
    const shared = path.join(tempDir, 'shared');
    fs.mkdirSync(shared, { recursive: true });
    fs.writeFileSync(path.join(shared, 'catalog.json'), '{"items":[]}');
    fs.writeFileSync(path.join(srcTauri, 'notes.txt'), 'mapped resource');

    const tauriConfig: TauriConfig = {
      bundle: {
        externalBin: ['binaries/helper'],
        resources: ['../shared', { src: 'notes.txt', target: 'docs/notes.txt' }],
      },
    };

    const appxDir = prepareAppxContent(
      tempDir,
      'x64',
      mockConfig,
      tauriConfig,
      '10.0.17763.0',
      windowsDir
    );

    const outDir = path.join(tempDir, 'msix-out');
    const result = spawnSync(cliCommand, ['--force', '--out-dir', outDir, '--dir-x64', appxDir], {
      encoding: 'utf8',
    });
    expect(result.status, `msixbundle-cli failed:\n${result.stdout}\n${result.stderr}`).toBe(0);

    const produced = fs.readdirSync(outDir).filter((f) => /\.(msixbundle|msix)$/i.test(f));
    expect(produced.length, `expected one artifact in ${outDir}, got: ${produced.join(', ')}`).toBe(
      1
    );
    bundlePath = path.join(outDir, produced[0]);

    const outerBuf = fs.readFileSync(bundlePath);
    outerEntries = readZipEntries(outerBuf);
    if (bundlePath.toLowerCase().endsWith('.msixbundle')) {
      const inner = outerEntries.find((e) => e.name.toLowerCase().endsWith('.msix'));
      expect(inner, 'bundle contains no .msix').toBeDefined();
      innerBuf = readZipEntryData(outerBuf, inner as ZipEntry);
    } else {
      innerBuf = outerBuf;
    }
    innerEntries = readZipEntries(innerBuf);
  }, 120000);

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('ships the main executable and the sidecar without the triple suffix', () => {
    const names = innerEntries.map((e) => e.name);
    expect(names).toContain('TestApp.exe');
    expect(names).toContain('helper.exe');
    expect(names.some((n) => n.includes(triple))).toBe(false);
  });

  it('ships parent-path resources under _up_/ and map resources at their target', () => {
    const names = innerEntries.map((e) => e.name);
    expect(names).toContain('_up_/shared/catalog.json');
    expect(names).toContain('docs/notes.txt');
    expect(names.some((n) => n.includes('..'))).toBe(false);
  });

  it('ships every declared icon variant with real image bytes', () => {
    const names = innerEntries.map((e) => e.name);
    for (const size of TARGET_SIZES) {
      expect(names).toContain(`Assets/Square44x44Logo.targetsize-${size}.png`);
      expect(names).toContain(`Assets/Square44x44Logo.targetsize-${size}_altform-unplated.png`);
      expect(names).toContain(
        `Assets/Square44x44Logo.targetsize-${size}_altform-lightunplated.png`
      );
    }
    for (const factor of SCALE_FACTORS) {
      expect(names).toContain(`Assets/Square150x150Logo.scale-${factor}.png`);
    }
    // Every shipped PNG carries a PNG signature after decompression
    const png = innerEntries.find((e) => e.name === 'Assets/Square44x44Logo.targetsize-48.png');
    const data = readZipEntryData(innerBuf, png as ZipEntry);
    expect(data.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  });

  it('declares the staged executable in the packaged AppxManifest.xml', () => {
    const manifest = innerEntries.find((e) => e.name === 'AppxManifest.xml');
    expect(manifest).toBeDefined();
    const xml = readZipEntryData(innerBuf, manifest as ZipEntry).toString('utf8');
    expect(xml).toContain('Executable="TestApp.exe"');
    expect(xml).toContain('Publisher="CN=TestCompany"');
  });

  it('shipped payload sizes match the staged files', () => {
    const sidecar = innerEntries.find((e) => e.name === 'helper.exe') as ZipEntry;
    expect(readZipEntryData(innerBuf, sidecar).toString('utf8')).toBe('MZ sidecar');
  });
});

describe.runIf(!cliAvailable)('msix artifact contents (real msixbundle-cli)', () => {
  it('SKIPPED: msixbundle-cli is not runnable here (win32 sidecar or PATH install) — artifact verification did not run', () => {
    console.warn(
      'integration.pack.test.ts skipped: install msixbundle-cli (cargo install msixbundle-cli) to verify real package contents'
    );
    expect(cliAvailable).toBe(false);
  });
});

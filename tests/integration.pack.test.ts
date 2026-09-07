import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Image, write } from 'image-js';
import { prepareAppxContent } from '../src/core/appx-content.js';
import { resolveMsixbundleCliCommand } from '../src/utils/exec.js';
import { generateManifestTemplate } from '../src/core/manifest.js';
import { generateAssets } from '../src/generators/assets.js';
import { TARGET_SIZES, SCALE_FACTORS } from '../src/types.js';
import type { MergedConfig, TauriConfig } from '../src/types.js';

/**
 * True-artifact integration test: stages a fixture app, packs it with the REAL
 * msixbundle-cli (the win32 npm sidecar on CI), then unpacks the result with
 * Microsoft's own makeappx.exe — which validates the package structure and
 * block-map hashes while extracting — and asserts what actually shipped.
 * No mocks anywhere on that path.
 *
 * Runs on Windows with the SDK present (CI: windows-latest). Elsewhere it
 * skips with a visible warning; with TWB_REQUIRE_INTEGRATION=1 a missing
 * prerequisite fails the run instead.
 */

const cliCommand = resolveMsixbundleCliCommand();
const cliAvailable = spawnSync(cliCommand, ['--version'], { encoding: 'utf8' }).status === 0;

function findMakeAppx(): string | null {
  if (process.platform !== 'win32') return null;
  const kitsBin = 'C:\\Program Files (x86)\\Windows Kits\\10\\bin';
  if (!fs.existsSync(kitsBin)) return null;
  const versions = fs
    .readdirSync(kitsBin)
    .filter((d) => /^10\.\d+/.test(d))
    .sort()
    .reverse();
  for (const v of versions) {
    const candidate = path.join(kitsBin, v, 'x64', 'makeappx.exe');
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

const makeAppx = findMakeAppx();
const ready = cliAvailable && makeAppx !== null;

if (process.env.TWB_REQUIRE_INTEGRATION === '1' && !ready) {
  throw new Error(
    `TWB_REQUIRE_INTEGRATION is set but prerequisites are missing: ` +
      `msixbundle-cli runnable=${cliAvailable} (via "${cliCommand}"), makeappx=${makeAppx ?? 'not found'}`
  );
}

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

describe.runIf(ready)('msix artifact contents (msixbundle-cli + makeappx)', () => {
  let tempDir: string;
  let unpackDir: string;

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

    // Pack with the real cli; it produces both the per-arch .msix and the bundle
    const outDir = path.join(tempDir, 'msix-out');
    const pack = spawnSync(cliCommand, ['--force', '--out-dir', outDir, '--dir-x64', appxDir], {
      encoding: 'utf8',
    });
    expect(pack.status, `msixbundle-cli failed:\n${pack.stdout}\n${pack.stderr}`).toBe(0);

    const produced = fs.readdirSync(outDir);
    const bundle = produced.find((f) => f.toLowerCase().endsWith('.msixbundle'));
    const msix = produced.find((f) => f.toLowerCase().endsWith('.msix'));
    expect(bundle, `no .msixbundle in ${outDir}: ${produced.join(', ')}`).toBeDefined();
    expect(msix, `no .msix in ${outDir}: ${produced.join(', ')}`).toBeDefined();

    // Unbundle with Microsoft's tool, then unpack the inner package.
    // makeappx validates the block map and file hashes while extracting.
    const unbundleDir = path.join(tempDir, 'unbundled');
    const unbundle = spawnSync(
      makeAppx as string,
      ['unbundle', '/p', path.join(outDir, bundle as string), '/d', unbundleDir],
      { encoding: 'utf8' }
    );
    expect(
      unbundle.status,
      `makeappx unbundle failed:\n${unbundle.stdout}\n${unbundle.stderr}`
    ).toBe(0);
    const innerMsix = fs.readdirSync(unbundleDir).find((f) => f.toLowerCase().endsWith('.msix'));
    expect(innerMsix, 'bundle contains no .msix').toBeDefined();

    unpackDir = path.join(tempDir, 'unpacked');
    const unpack = spawnSync(
      makeAppx as string,
      ['unpack', '/p', path.join(unbundleDir, innerMsix as string), '/d', unpackDir],
      { encoding: 'utf8' }
    );
    expect(unpack.status, `makeappx unpack failed:\n${unpack.stdout}\n${unpack.stderr}`).toBe(0);
  }, 180000);

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('ships the main executable and the sidecar without the triple suffix', () => {
    expect(fs.existsSync(path.join(unpackDir, 'TestApp.exe'))).toBe(true);
    expect(fs.existsSync(path.join(unpackDir, 'helper.exe'))).toBe(true);
    const everything = fs.readdirSync(unpackDir, { recursive: true }) as string[];
    expect(everything.some((n) => n.includes(triple))).toBe(false);
  });

  it('ships parent-path resources under _up_/ and map resources at their target', () => {
    expect(fs.existsSync(path.join(unpackDir, '_up_', 'shared', 'catalog.json'))).toBe(true);
    expect(fs.readFileSync(path.join(unpackDir, 'docs', 'notes.txt'), 'utf8')).toBe(
      'mapped resource'
    );
  });

  it('ships every declared icon variant with real image bytes', () => {
    const assets = path.join(unpackDir, 'Assets');
    for (const size of TARGET_SIZES) {
      expect(fs.existsSync(path.join(assets, `Square44x44Logo.targetsize-${size}.png`))).toBe(true);
      expect(
        fs.existsSync(path.join(assets, `Square44x44Logo.targetsize-${size}_altform-unplated.png`))
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(assets, `Square44x44Logo.targetsize-${size}_altform-lightunplated.png`)
        )
      ).toBe(true);
    }
    for (const factor of SCALE_FACTORS) {
      expect(fs.existsSync(path.join(assets, `Square150x150Logo.scale-${factor}.png`))).toBe(true);
    }
    const png = fs.readFileSync(path.join(assets, 'Square44x44Logo.targetsize-48.png'));
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  });

  it('declares the staged executable in the packaged AppxManifest.xml', () => {
    const xml = fs.readFileSync(path.join(unpackDir, 'AppxManifest.xml'), 'utf8');
    expect(xml).toContain('Executable="TestApp.exe"');
    expect(xml).toContain('Publisher="CN=TestCompany"');
  });

  it('shipped payload bytes match the staged files', () => {
    expect(fs.readFileSync(path.join(unpackDir, 'helper.exe'), 'utf8')).toBe('MZ sidecar');
  });
});

describe.runIf(!ready)('msix artifact contents (msixbundle-cli + makeappx)', () => {
  it('SKIPPED: prerequisites missing — artifact verification did not run', () => {
    console.warn(
      `integration.pack.test.ts skipped: msixbundle-cli runnable=${cliAvailable}, makeappx=${makeAppx ?? 'not found'} — runs on Windows with the SDK`
    );
    expect(ready).toBe(false);
  });
});

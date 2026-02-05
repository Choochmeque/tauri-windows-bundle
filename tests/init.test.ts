import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { init } from '../src/commands/init.js';

describe('init command', () => {
  let tempDir: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tauri-bundle-test-'));
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    consoleSpy.mockRestore();
  });

  function createTauriProject() {
    const srcTauri = path.join(tempDir, 'src-tauri');
    fs.mkdirSync(srcTauri, { recursive: true });
    fs.writeFileSync(
      path.join(srcTauri, 'tauri.conf.json'),
      JSON.stringify({ productName: 'TestApp', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'test', scripts: {} })
    );
  }

  it('creates windows bundle directory structure', async () => {
    createTauriProject();
    await init({ path: tempDir });

    const windowsDir = path.join(tempDir, 'src-tauri', 'gen', 'windows');
    expect(fs.existsSync(windowsDir)).toBe(true);
    expect(fs.existsSync(path.join(windowsDir, 'Assets'))).toBe(true);
  });

  it('creates bundle.config.json', async () => {
    createTauriProject();
    await init({ path: tempDir });

    const configPath = path.join(tempDir, 'src-tauri', 'gen', 'windows', 'bundle.config.json');
    expect(fs.existsSync(configPath)).toBe(true);

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(config.publisher).toBeDefined();
  });

  it('creates AppxManifest.xml.template', async () => {
    createTauriProject();
    await init({ path: tempDir });

    const templatePath = path.join(
      tempDir,
      'src-tauri',
      'gen',
      'windows',
      'AppxManifest.xml.template'
    );
    expect(fs.existsSync(templatePath)).toBe(true);
  });

  it('creates placeholder assets', async () => {
    createTauriProject();
    await init({ path: tempDir });

    const assetsDir = path.join(tempDir, 'src-tauri', 'gen', 'windows', 'Assets');
    expect(fs.existsSync(path.join(assetsDir, 'StoreLogo.png'))).toBe(true);
    expect(fs.existsSync(path.join(assetsDir, 'Square44x44Logo.png'))).toBe(true);
  });

  it('creates .gitignore', async () => {
    createTauriProject();
    await init({ path: tempDir });

    const gitignorePath = path.join(tempDir, 'src-tauri', 'gen', 'windows', '.gitignore');
    expect(fs.existsSync(gitignorePath)).toBe(true);
  });

  it('updates package.json with build script', async () => {
    createTauriProject();
    await init({ path: tempDir });

    const pkg = JSON.parse(fs.readFileSync(path.join(tempDir, 'package.json'), 'utf-8'));
    expect(pkg.scripts['tauri:windows:build']).toBe('tauri-windows-bundle build');
  });

  it('does not overwrite existing build script', async () => {
    const srcTauri = path.join(tempDir, 'src-tauri');
    fs.mkdirSync(srcTauri, { recursive: true });
    fs.writeFileSync(
      path.join(srcTauri, 'tauri.conf.json'),
      JSON.stringify({ productName: 'TestApp' })
    );
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test',
        scripts: { 'tauri:windows:build': 'custom-script' },
      })
    );

    await init({ path: tempDir });

    const pkg = JSON.parse(fs.readFileSync(path.join(tempDir, 'package.json'), 'utf-8'));
    expect(pkg.scripts['tauri:windows:build']).toBe('custom-script');
  });

  it('handles missing package.json gracefully', async () => {
    const srcTauri = path.join(tempDir, 'src-tauri');
    fs.mkdirSync(srcTauri, { recursive: true });
    fs.writeFileSync(
      path.join(srcTauri, 'tauri.conf.json'),
      JSON.stringify({ productName: 'TestApp' })
    );

    await init({ path: tempDir });

    // Should not throw
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Warning: package.json not found')
    );
  });

  it('handles invalid package.json gracefully', async () => {
    const srcTauri = path.join(tempDir, 'src-tauri');
    fs.mkdirSync(srcTauri, { recursive: true });
    fs.writeFileSync(
      path.join(srcTauri, 'tauri.conf.json'),
      JSON.stringify({ productName: 'TestApp' })
    );
    fs.writeFileSync(path.join(tempDir, 'package.json'), 'invalid json');

    await init({ path: tempDir });

    // Should not throw
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Warning: Could not update package.json')
    );
  });

  it('creates scripts object if missing in package.json', async () => {
    const srcTauri = path.join(tempDir, 'src-tauri');
    fs.mkdirSync(srcTauri, { recursive: true });
    fs.writeFileSync(
      path.join(srcTauri, 'tauri.conf.json'),
      JSON.stringify({ productName: 'TestApp' })
    );
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'test' }));

    await init({ path: tempDir });

    const pkg = JSON.parse(fs.readFileSync(path.join(tempDir, 'package.json'), 'utf-8'));
    expect(pkg.scripts['tauri:windows:build']).toBe('tauri-windows-bundle build');
  });

  it('shows shorter next steps when assets are copied from icons', async () => {
    const srcTauri = path.join(tempDir, 'src-tauri');
    const iconsDir = path.join(srcTauri, 'icons');
    fs.mkdirSync(iconsDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcTauri, 'tauri.conf.json'),
      JSON.stringify({ productName: 'TestApp', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'test', scripts: {} })
    );

    // Create a valid PNG icon (minimal 1x1 PNG)
    const minimalPng = Buffer.from([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a, // PNG signature
      0x00,
      0x00,
      0x00,
      0x0d,
      0x49,
      0x48,
      0x44,
      0x52, // IHDR chunk
      0x00,
      0x00,
      0x00,
      0x01,
      0x00,
      0x00,
      0x00,
      0x01, // 1x1 dimensions
      0x08,
      0x02,
      0x00,
      0x00,
      0x00,
      0x90,
      0x77,
      0x53,
      0xde, // bit depth, color type, etc.
      0x00,
      0x00,
      0x00,
      0x0c,
      0x49,
      0x44,
      0x41,
      0x54, // IDAT chunk
      0x08,
      0xd7,
      0x63,
      0xf8,
      0xff,
      0xff,
      0x3f,
      0x00,
      0x05,
      0xfe,
      0x02,
      0xfe,
      0x00,
      0x00,
      0x00,
      0x00,
      0x49,
      0x45,
      0x4e,
      0x44, // IEND chunk
      0xae,
      0x42,
      0x60,
      0x82,
    ]);
    fs.writeFileSync(path.join(iconsDir, 'StoreLogo.png'), minimalPng);
    fs.writeFileSync(path.join(iconsDir, 'Square44x44Logo.png'), minimalPng);
    fs.writeFileSync(path.join(iconsDir, 'Square150x150Logo.png'), minimalPng);
    fs.writeFileSync(path.join(iconsDir, 'icon.png'), minimalPng);

    await init({ path: tempDir });

    // When assets are copied, the next steps skip the "replace placeholder icons" step
    // Check that step 3 is directly the build command
    expect(consoleSpy).toHaveBeenCalledWith('  3. Run: pnpm tauri:windows:build');
    // And step 4 should NOT exist (no "Replace placeholder icons" step)
    expect(consoleSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Replace placeholder icons')
    );
  });
});

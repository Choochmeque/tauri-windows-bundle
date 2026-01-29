import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveVersion, toFourPartVersion } from '../src/core/project-discovery.js';

describe('toFourPartVersion', () => {
  it('converts 3-part version to 4-part', () => {
    expect(toFourPartVersion('1.2.3')).toBe('1.2.3.0');
  });

  it('converts 2-part version to 4-part', () => {
    expect(toFourPartVersion('1.2')).toBe('1.2.0.0');
  });

  it('converts 1-part version to 4-part', () => {
    expect(toFourPartVersion('1')).toBe('1.0.0.0');
  });

  it('keeps 4-part version as is', () => {
    expect(toFourPartVersion('1.2.3.4')).toBe('1.2.3.4');
  });

  it('truncates versions with more than 4 parts', () => {
    expect(toFourPartVersion('1.2.3.4.5')).toBe('1.2.3.4');
  });
});

describe('resolveVersion', () => {
  let tmpDir: string;

  function createTempFile(filename: string, content: string): void {
    fs.writeFileSync(path.join(tmpDir, filename), content, 'utf-8');
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tauri-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns version string as-is when it is a semver string', () => {
    expect(resolveVersion('1.2.3', tmpDir)).toBe('1.2.3');
  });

  it('resolves version from a package.json file', () => {
    createTempFile('package.json', JSON.stringify({ version: '2.5.0' }));
    expect(resolveVersion('package.json', tmpDir)).toBe('2.5.0');
  });

  it('resolves version from a relative path', () => {
    const subDir = path.join(tmpDir, 'sub');
    fs.mkdirSync(subDir);
    createTempFile('package.json', JSON.stringify({ version: '3.1.0' }));
    expect(resolveVersion('../package.json', subDir)).toBe('3.1.0');
  });

  it('throws when the file has no version field', () => {
    createTempFile('package.json', JSON.stringify({ name: 'test' }));
    expect(() => resolveVersion('package.json', tmpDir)).toThrow(
      'does not contain a valid "version" field'
    );
  });

  it('throws when the file is not valid JSON', () => {
    createTempFile('package.json', 'not json');
    expect(() => resolveVersion('package.json', tmpDir)).toThrow('Failed to parse');
  });
});

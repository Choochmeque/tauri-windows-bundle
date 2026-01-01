import { describe, it, expect } from 'vitest';
import * as index from '../src/index.js';

describe('index exports', () => {
  it('exports types', () => {
    expect(index.MSIX_ASSETS).toBeDefined();
    expect(index.DEFAULT_MIN_WINDOWS_VERSION).toBeDefined();
    expect(index.DEFAULT_CAPABILITIES).toBeDefined();
  });

  it('exports init command', () => {
    expect(index.init).toBeDefined();
    expect(typeof index.init).toBe('function');
  });

  it('exports build command', () => {
    expect(index.build).toBeDefined();
    expect(typeof index.build).toBe('function');
  });

  it('exports project discovery functions', () => {
    expect(index.findProjectRoot).toBeDefined();
    expect(index.readTauriConfig).toBeDefined();
    expect(index.readBundleConfig).toBeDefined();
    expect(index.getWindowsDir).toBeDefined();
    expect(index.toFourPartVersion).toBeDefined();
  });

  it('exports manifest functions', () => {
    expect(index.generateManifest).toBeDefined();
    expect(index.generateManifestTemplate).toBeDefined();
  });

  it('exports appx content function', () => {
    expect(index.prepareAppxContent).toBeDefined();
  });
});

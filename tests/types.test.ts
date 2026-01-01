import { describe, it, expect } from 'vitest';
import { MSIX_ASSETS, DEFAULT_MIN_WINDOWS_VERSION, DEFAULT_CAPABILITIES } from '../src/types.js';

describe('MSIX_ASSETS', () => {
  it('contains required assets', () => {
    const assetNames = MSIX_ASSETS.map((a) => a.name);

    expect(assetNames).toContain('StoreLogo.png');
    expect(assetNames).toContain('Square44x44Logo.png');
    expect(assetNames).toContain('Square150x150Logo.png');
    expect(assetNames).toContain('Wide310x150Logo.png');
    expect(assetNames).toContain('LargeTile.png');
  });

  it('has correct dimensions for each asset', () => {
    const storeLogo = MSIX_ASSETS.find((a) => a.name === 'StoreLogo.png');
    expect(storeLogo?.size).toBe(50);

    const square44 = MSIX_ASSETS.find((a) => a.name === 'Square44x44Logo.png');
    expect(square44?.size).toBe(44);

    const square150 = MSIX_ASSETS.find((a) => a.name === 'Square150x150Logo.png');
    expect(square150?.size).toBe(150);

    const wide = MSIX_ASSETS.find((a) => a.name === 'Wide310x150Logo.png');
    expect(wide?.width).toBe(310);
    expect(wide?.height).toBe(150);

    const large = MSIX_ASSETS.find((a) => a.name === 'LargeTile.png');
    expect(large?.size).toBe(310);
  });
});

describe('DEFAULT_MIN_WINDOWS_VERSION', () => {
  it('is Windows 10 1809', () => {
    expect(DEFAULT_MIN_WINDOWS_VERSION).toBe('10.0.17763.0');
  });

  it('has correct format', () => {
    expect(DEFAULT_MIN_WINDOWS_VERSION).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
  });
});

describe('DEFAULT_CAPABILITIES', () => {
  it('includes internetClient', () => {
    expect(DEFAULT_CAPABILITIES).toContain('internetClient');
  });

  it('is an array', () => {
    expect(Array.isArray(DEFAULT_CAPABILITIES)).toBe(true);
  });
});

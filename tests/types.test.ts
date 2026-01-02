import { describe, it, expect } from 'vitest';
import {
  MSIX_ASSETS,
  DEFAULT_MIN_WINDOWS_VERSION,
  DEFAULT_CAPABILITIES,
  GENERAL_CAPABILITIES,
  DEVICE_CAPABILITIES,
  RESTRICTED_CAPABILITIES,
  validateCapabilities,
} from '../src/types.js';

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
  it('includes internetClient in general', () => {
    expect(DEFAULT_CAPABILITIES.general).toContain('internetClient');
  });

  it('is an object with general array', () => {
    expect(typeof DEFAULT_CAPABILITIES).toBe('object');
    expect(Array.isArray(DEFAULT_CAPABILITIES.general)).toBe(true);
  });
});

describe('Capability constants', () => {
  it('GENERAL_CAPABILITIES contains expected values', () => {
    expect(GENERAL_CAPABILITIES).toContain('internetClient');
    expect(GENERAL_CAPABILITIES).toContain('internetClientServer');
    expect(GENERAL_CAPABILITIES).toContain('privateNetworkClientServer');
  });

  it('DEVICE_CAPABILITIES contains expected values', () => {
    expect(DEVICE_CAPABILITIES).toContain('webcam');
    expect(DEVICE_CAPABILITIES).toContain('microphone');
    expect(DEVICE_CAPABILITIES).toContain('location');
  });

  it('RESTRICTED_CAPABILITIES contains expected values', () => {
    expect(RESTRICTED_CAPABILITIES).toContain('broadFileSystemAccess');
    expect(RESTRICTED_CAPABILITIES).toContain('allowElevation');
  });
});

describe('validateCapabilities', () => {
  it('returns empty array for valid general capabilities', () => {
    const errors = validateCapabilities({ general: ['internetClient'] });
    expect(errors).toHaveLength(0);
  });

  it('returns empty array for valid device capabilities', () => {
    const errors = validateCapabilities({ device: ['webcam', 'microphone'] });
    expect(errors).toHaveLength(0);
  });

  it('returns empty array for valid restricted capabilities', () => {
    const errors = validateCapabilities({ restricted: ['broadFileSystemAccess'] });
    expect(errors).toHaveLength(0);
  });

  it('returns errors for invalid general capability', () => {
    const errors = validateCapabilities({ general: ['invalidCap'] });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Invalid general capability');
    expect(errors[0]).toContain('invalidCap');
  });

  it('returns errors for invalid device capability', () => {
    const errors = validateCapabilities({ device: ['badDevice'] });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Invalid device capability');
  });

  it('returns errors for invalid restricted capability', () => {
    const errors = validateCapabilities({ restricted: ['notRestricted'] });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Invalid restricted capability');
  });

  it('returns multiple errors for multiple invalid capabilities', () => {
    const errors = validateCapabilities({
      general: ['bad1', 'bad2'],
      device: ['bad3'],
    });
    expect(errors).toHaveLength(3);
  });

  it('returns empty array for empty config', () => {
    const errors = validateCapabilities({});
    expect(errors).toHaveLength(0);
  });

  it('validates mixed valid and invalid capabilities', () => {
    const errors = validateCapabilities({
      general: ['internetClient', 'badCap'],
      device: ['webcam'],
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('badCap');
  });
});

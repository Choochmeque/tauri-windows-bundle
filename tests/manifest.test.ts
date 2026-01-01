import { describe, it, expect } from 'vitest';
import { generateManifest } from '../src/core/manifest.js';
import type { MergedConfig } from '../src/types.js';

describe('generateManifest', () => {
  const mockConfig: MergedConfig = {
    displayName: 'Test App',
    version: '1.0.0.0',
    description: 'A test application',
    identifier: 'com.example.testapp',
    publisher: 'CN=TestCompany',
    publisherDisplayName: 'Test Company',
    capabilities: ['internetClient'],
  };

  it('replaces all template variables', () => {
    const manifest = generateManifest(mockConfig, 'x64', '10.0.17763.0');

    expect(manifest).not.toContain('{{');
    expect(manifest).toContain('Test App');
    expect(manifest).toContain('CN=TestCompany');
    expect(manifest).toContain('1.0.0.0');
  });

  it('generates manifest with correct arch', () => {
    const manifest = generateManifest(mockConfig, 'arm64', '10.0.17763.0');
    expect(manifest).toContain('ProcessorArchitecture="arm64"');
  });

  it('generates manifest with x64 arch', () => {
    const manifest = generateManifest(mockConfig, 'x64', '10.0.17763.0');
    expect(manifest).toContain('ProcessorArchitecture="x64"');
  });

  it('includes capabilities', () => {
    const config: MergedConfig = {
      ...mockConfig,
      capabilities: ['internetClient', 'webcam'],
    };
    const manifest = generateManifest(config, 'x64', '10.0.17763.0');

    expect(manifest).toContain('<Capability Name="internetClient"');
    expect(manifest).toContain('<Capability Name="webcam"');
  });

  it('includes share target extension when enabled', () => {
    const config: MergedConfig = {
      ...mockConfig,
      extensions: {
        shareTarget: true,
      },
    };
    const manifest = generateManifest(config, 'x64', '10.0.17763.0');

    expect(manifest).toContain('windows.shareTarget');
    expect(manifest).toContain('<uap:ShareTarget>');
  });

  it('includes protocol handler extension', () => {
    const config: MergedConfig = {
      ...mockConfig,
      extensions: {
        protocolHandlers: [{ name: 'myapp', displayName: 'My App Protocol' }],
      },
    };
    const manifest = generateManifest(config, 'x64', '10.0.17763.0');

    expect(manifest).toContain('windows.protocol');
    expect(manifest).toContain('<uap:Protocol Name="myapp"');
    expect(manifest).toContain('My App Protocol');
  });

  it('includes file association extension', () => {
    const config: MergedConfig = {
      ...mockConfig,
      extensions: {
        fileAssociations: [{ name: 'myfiles', extensions: ['.myf', '.myx'] }],
      },
    };
    const manifest = generateManifest(config, 'x64', '10.0.17763.0');

    expect(manifest).toContain('windows.fileTypeAssociation');
    expect(manifest).toContain('<uap:FileType>.myf</uap:FileType>');
    expect(manifest).toContain('<uap:FileType>.myx</uap:FileType>');
  });
});

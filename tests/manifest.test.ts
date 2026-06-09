import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  generateManifest,
  generateManifestTemplate,
  getDefaultLanguageFromManifestXml,
  getDefaultLanguageFromManifestFile,
} from '../src/core/manifest.js';
import type { MergedConfig } from '../src/types.js';

describe('generateManifest', () => {
  let tempDir: string;

  const mockConfig: MergedConfig = {
    displayName: 'Test App',
    version: '1.0.0.0',
    description: 'A test application',
    identifier: 'com.example.testapp',
    publisher: 'CN=TestCompany',
    publisherDisplayName: 'Test Company',
    capabilities: { general: ['internetClient'] },
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tauri-bundle-test-'));
    // Seed the temp dir with the bundled template (simulates what init does)
    generateManifestTemplate(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('replaces all template variables', () => {
    const manifest = generateManifest(mockConfig, 'x64', '10.0.17763.0', tempDir);

    expect(manifest).not.toContain('{{');
    expect(manifest).toContain('Test App');
    expect(manifest).toContain('CN=TestCompany');
    expect(manifest).toContain('1.0.0.0');
  });

  it('preserves dots in package name from identifier', () => {
    const manifest = generateManifest(mockConfig, 'x64', '10.0.17763.0', tempDir);
    expect(manifest).toContain('Name="com.example.testapp"');
  });

  it('generates manifest with correct arch', () => {
    const manifest = generateManifest(mockConfig, 'arm64', '10.0.17763.0', tempDir);
    expect(manifest).toContain('ProcessorArchitecture="arm64"');
  });

  it('generates manifest with x64 arch', () => {
    const manifest = generateManifest(mockConfig, 'x64', '10.0.17763.0', tempDir);
    expect(manifest).toContain('ProcessorArchitecture="x64"');
  });

  it('includes capabilities', () => {
    const config: MergedConfig = {
      ...mockConfig,
      capabilities: {
        general: ['internetClient'],
        device: ['webcam'],
        restricted: ['broadFileSystemAccess'],
      },
    };
    const manifest = generateManifest(config, 'x64', '10.0.17763.0', tempDir);

    expect(manifest).toContain('<Capability Name="internetClient"');
    expect(manifest).toContain('<DeviceCapability Name="webcam"');
    expect(manifest).toContain('<rescap:Capability Name="broadFileSystemAccess"');
  });

  it('always includes runFullTrust restricted capability', () => {
    const manifest = generateManifest(mockConfig, 'x64', '10.0.17763.0', tempDir);
    expect(manifest).toContain('<rescap:Capability Name="runFullTrust"');
  });

  it('includes share target extension when enabled', () => {
    const config: MergedConfig = {
      ...mockConfig,
      extensions: {
        shareTarget: true,
      },
    };
    const manifest = generateManifest(config, 'x64', '10.0.17763.0', tempDir);

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
    const manifest = generateManifest(config, 'x64', '10.0.17763.0', tempDir);

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
    const manifest = generateManifest(config, 'x64', '10.0.17763.0', tempDir);

    expect(manifest).toContain('windows.fileTypeAssociation');
    expect(manifest).toContain('<uap:FileType>.myf</uap:FileType>');
    expect(manifest).toContain('<uap:FileType>.myx</uap:FileType>');
  });

  it('includes startup task extension', () => {
    const config: MergedConfig = {
      ...mockConfig,
      extensions: {
        startupTask: { enabled: true },
      },
    };
    const manifest = generateManifest(config, 'x64', '10.0.17763.0', tempDir);

    expect(manifest).toContain('windows.startupTask');
    expect(manifest).toContain('<desktop:StartupTask');
    expect(manifest).toContain('TaskId="StartupTask"');
    expect(manifest).toContain(`DisplayName="${mockConfig.displayName}"`);
  });

  it('includes startup task with custom taskId', () => {
    const config: MergedConfig = {
      ...mockConfig,
      extensions: {
        startupTask: { enabled: true, taskId: 'CustomTask' },
      },
    };
    const manifest = generateManifest(config, 'x64', '10.0.17763.0', tempDir);

    expect(manifest).toContain('TaskId="CustomTask"');
  });

  it('excludes startup task when disabled', () => {
    const config: MergedConfig = {
      ...mockConfig,
      extensions: {
        startupTask: { enabled: false },
      },
    };
    const manifest = generateManifest(config, 'x64', '10.0.17763.0', tempDir);

    expect(manifest).not.toContain('windows.startupTask');
  });

  it('includes context menu extension', () => {
    const config: MergedConfig = {
      ...mockConfig,
      extensions: {
        contextMenus: [{ name: 'open-with', fileTypes: ['*', '.txt'] }],
      },
    };
    const manifest = generateManifest(config, 'x64', '10.0.17763.0', tempDir);

    expect(manifest).toContain('windows.fileExplorerContextMenus');
    expect(manifest).toContain('<desktop:Verb Id="open-with"');
    expect(manifest).toContain('<desktop:FileType>*</desktop:FileType>');
    expect(manifest).toContain('<desktop:FileType>.txt</desktop:FileType>');
  });

  it('includes background task with timer type', () => {
    const config: MergedConfig = {
      ...mockConfig,
      extensions: {
        backgroundTasks: [{ name: 'sync-task', type: 'timer' }],
      },
    };
    const manifest = generateManifest(config, 'x64', '10.0.17763.0', tempDir);

    expect(manifest).toContain('windows.backgroundTasks');
    expect(manifest).toContain('EntryPoint="sync-task"');
    expect(manifest).toContain('<uap:Task Type="TimeTrigger"');
  });

  it('includes background task with systemEvent type', () => {
    const config: MergedConfig = {
      ...mockConfig,
      extensions: {
        backgroundTasks: [{ name: 'event-task', type: 'systemEvent' }],
      },
    };
    const manifest = generateManifest(config, 'x64', '10.0.17763.0', tempDir);

    expect(manifest).toContain('<uap:Task Type="SystemTrigger"');
  });

  it('includes background task with pushNotification type', () => {
    const config: MergedConfig = {
      ...mockConfig,
      extensions: {
        backgroundTasks: [{ name: 'push-task', type: 'pushNotification' }],
      },
    };
    const manifest = generateManifest(config, 'x64', '10.0.17763.0', tempDir);

    expect(manifest).toContain('<uap:Task Type="PushNotificationTrigger"');
  });

  it('includes app execution alias', () => {
    const config: MergedConfig = {
      ...mockConfig,
      extensions: {
        appExecutionAliases: [{ alias: 'myapp' }],
      },
    };
    const manifest = generateManifest(config, 'x64', '10.0.17763.0', tempDir);

    expect(manifest).toContain('windows.appExecutionAlias');
    expect(manifest).toContain('Alias="myapp.exe"');
  });

  it('includes app execution alias with .exe suffix', () => {
    const config: MergedConfig = {
      ...mockConfig,
      extensions: {
        appExecutionAliases: [{ alias: 'myapp.exe' }],
      },
    };
    const manifest = generateManifest(config, 'x64', '10.0.17763.0', tempDir);

    expect(manifest).toContain('Alias="myapp.exe"');
  });

  it('includes app service', () => {
    const config: MergedConfig = {
      ...mockConfig,
      extensions: {
        appServices: [{ name: 'com.myapp.service' }],
      },
    };
    const manifest = generateManifest(config, 'x64', '10.0.17763.0', tempDir);

    expect(manifest).toContain('windows.appService');
    expect(manifest).toContain('Name="com.myapp.service"');
  });

  it('includes toast activation', () => {
    const config: MergedConfig = {
      ...mockConfig,
      extensions: {
        toastActivation: { activationType: 'foreground' },
      },
    };
    const manifest = generateManifest(config, 'x64', '10.0.17763.0', tempDir);

    expect(manifest).toContain('windows.toastNotificationActivation');
    expect(manifest).toContain('ToastActivatorCLSID=');
  });

  it('uses explicit toast activator CLSID when provided, stripping surrounding braces', () => {
    const clsid = '{12345678-1234-1234-1234-123456789012}';
    const config: MergedConfig = {
      ...mockConfig,
      extensions: {
        toastActivation: { activationType: 'foreground', clsid },
      },
    };
    const manifest = generateManifest(config, 'x64', '10.0.17763.0', tempDir);

    expect(manifest).toContain('ToastActivatorCLSID="12345678-1234-1234-1234-123456789012"');
    expect(manifest).not.toContain(`ToastActivatorCLSID="${clsid}"`);
  });

  it('strips braces from auto-generated toast activator CLSID', () => {
    const config: MergedConfig = {
      ...mockConfig,
      extensions: {
        toastActivation: { activationType: 'foreground' },
      },
    };
    const manifest = generateManifest(config, 'x64', '10.0.17763.0', tempDir);

    expect(manifest).toMatch(
      /ToastActivatorCLSID="[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}"/
    );
    expect(manifest).not.toMatch(/ToastActivatorCLSID="\{/);
  });

  it('includes autoplay content handler', () => {
    const config: MergedConfig = {
      ...mockConfig,
      extensions: {
        autoplayHandlers: [
          { verb: 'open', actionDisplayName: 'Open with MyApp', contentEvent: 'PlayMusicFiles' },
        ],
      },
    };
    const manifest = generateManifest(config, 'x64', '10.0.17763.0', tempDir);

    expect(manifest).toContain('windows.autoPlayContent');
    expect(manifest).toContain('Verb="open"');
    expect(manifest).toContain('ActionDisplayName="Open with MyApp"');
    expect(manifest).toContain('ContentEvent="PlayMusicFiles"');
  });

  it('includes autoplay device handler', () => {
    const config: MergedConfig = {
      ...mockConfig,
      extensions: {
        autoplayHandlers: [
          { verb: 'import', actionDisplayName: 'Import Photos', deviceEvent: 'WPD\\ImageSource' },
        ],
      },
    };
    const manifest = generateManifest(config, 'x64', '10.0.17763.0', tempDir);

    expect(manifest).toContain('windows.autoPlayDevice');
    expect(manifest).toContain('Verb="import"');
    expect(manifest).toContain('DeviceEvent="WPD\\ImageSource"');
  });

  it('includes print task settings', () => {
    const config: MergedConfig = {
      ...mockConfig,
      extensions: {
        printTaskSettings: { displayName: 'Print Settings' },
      },
    };
    const manifest = generateManifest(config, 'x64', '10.0.17763.0', tempDir);

    expect(manifest).toContain('windows.printWorkflowBackgroundTask');
  });

  it('includes thumbnail handler', () => {
    const config: MergedConfig = {
      ...mockConfig,
      extensions: {
        thumbnailHandlers: [
          { clsid: '{12345678-1234-1234-1234-123456789012}', fileTypes: ['.myf'] },
        ],
      },
    };
    const manifest = generateManifest(config, 'x64', '10.0.17763.0', tempDir);

    expect(manifest).toContain('ThumbnailHandler');
    expect(manifest).toContain('Clsid="{12345678-1234-1234-1234-123456789012}"');
    expect(manifest).toContain('<uap:FileType>.myf</uap:FileType>');
  });

  it('includes preview handler', () => {
    const config: MergedConfig = {
      ...mockConfig,
      extensions: {
        previewHandlers: [
          { clsid: '{ABCDEF12-1234-1234-1234-123456789012}', fileTypes: ['.doc', '.docx'] },
        ],
      },
    };
    const manifest = generateManifest(config, 'x64', '10.0.17763.0', tempDir);

    expect(manifest).toContain('DesktopPreviewHandler');
    expect(manifest).toContain('Clsid="{ABCDEF12-1234-1234-1234-123456789012}"');
    expect(manifest).toContain('<uap:FileType>.doc</uap:FileType>');
    expect(manifest).toContain('<uap:FileType>.docx</uap:FileType>');
  });

  it('uses custom local template when present', () => {
    const customTemplate = `<?xml version="1.0"?>
<Package>
  <!-- CUSTOM_TEMPLATE_MARKER -->
  <Identity Name="{{PACKAGE_NAME}}" Publisher="{{PUBLISHER}}" Version="{{VERSION}}" ProcessorArchitecture="{{ARCH}}" />
  <DisplayName>{{DISPLAY_NAME}}</DisplayName>
  <PublisherDisplayName>{{PUBLISHER_DISPLAY_NAME}}</PublisherDisplayName>
  <MinVersion>{{MIN_VERSION}}</MinVersion>
  <Executable>{{EXECUTABLE}}</Executable>
  <Description>{{DESCRIPTION}}</Description>
{{EXTENSIONS}}
{{CAPABILITIES}}
</Package>`;
    fs.writeFileSync(path.join(tempDir, 'AppxManifest.xml.template'), customTemplate);

    const manifest = generateManifest(mockConfig, 'x64', '10.0.17763.0', tempDir);

    expect(manifest).toContain('<!-- CUSTOM_TEMPLATE_MARKER -->');
    expect(manifest).not.toContain('{{');
    expect(manifest).toContain('Test App');
    expect(manifest).toContain('CN=TestCompany');
  });

  it('throws when local template is missing', () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tauri-bundle-test-empty-'));

    try {
      expect(() => generateManifest(mockConfig, 'x64', '10.0.17763.0', emptyDir)).toThrow(
        "Run 'tauri-windows-bundle init' first"
      );
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});

describe('getDefaultLanguageFromManifest', () => {
  it('extracts default language from manifest xml', () => {
    const manifest = `<?xml version="1.0"?>
<Package>
  <Resources>
    <Resource Language="de-de" />
  </Resources>
</Package>`;

    expect(getDefaultLanguageFromManifestXml(manifest)).toBe('de-de');
  });

  it('returns undefined when language is not present', () => {
    const manifest = `<?xml version="1.0"?><Package><Resources /></Package>`;
    expect(getDefaultLanguageFromManifestXml(manifest)).toBeUndefined();
  });

  it('extracts default language from manifest file', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tauri-bundle-manifest-lang-'));

    try {
      const manifestPath = path.join(tempDir, 'AppxManifest.xml');
      fs.writeFileSync(
        manifestPath,
        `<?xml version="1.0"?><Package><Resources><Resource Language="fr-fr" /></Resources></Package>`
      );

      expect(getDefaultLanguageFromManifestFile(manifestPath)).toBe('fr-fr');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

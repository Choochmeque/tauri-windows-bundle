import * as fs from 'node:fs';
import * as path from 'node:path';
import type { MergedConfig } from '../types.js';
import { replaceTemplateVariables } from '../utils/template.js';

const MANIFEST_TEMPLATE = `<?xml version="1.0" encoding="utf-8"?>
<Package
  xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
  xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
  xmlns:uap3="http://schemas.microsoft.com/appx/manifest/uap/windows10/3"
  xmlns:desktop="http://schemas.microsoft.com/appx/manifest/desktop/windows10"
  xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities">

  <Identity
    Name="{{PACKAGE_NAME}}"
    Publisher="{{PUBLISHER}}"
    Version="{{VERSION}}"
    ProcessorArchitecture="{{ARCH}}" />

  <Properties>
    <DisplayName>{{DISPLAY_NAME}}</DisplayName>
    <PublisherDisplayName>{{PUBLISHER_DISPLAY_NAME}}</PublisherDisplayName>
    <Logo>Assets\\StoreLogo.png</Logo>
  </Properties>

  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop"
      MinVersion="{{MIN_VERSION}}"
      MaxVersionTested="10.0.22621.0" />
  </Dependencies>

  <Resources>
    <Resource Language="en-us" />
  </Resources>

  <Applications>
    <Application Id="App"
      Executable="{{EXECUTABLE}}"
      EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements
        DisplayName="{{DISPLAY_NAME}}"
        Description="{{DESCRIPTION}}"
        BackgroundColor="transparent"
        Square150x150Logo="Assets\\Square150x150Logo.png"
        Square44x44Logo="Assets\\Square44x44Logo.png">
        <uap:DefaultTile Wide310x150Logo="Assets\\Wide310x150Logo.png" />
      </uap:VisualElements>

{{EXTENSIONS}}
    </Application>
  </Applications>

  <Capabilities>
{{CAPABILITIES}}
  </Capabilities>
</Package>
`;

export function generateManifestTemplate(windowsDir: string): void {
  const templatePath = path.join(windowsDir, 'AppxManifest.xml.template');
  fs.writeFileSync(templatePath, MANIFEST_TEMPLATE);
}

export function generateManifest(config: MergedConfig, arch: string, minVersion: string): string {
  // Read the template
  const variables: Record<string, string> = {
    PACKAGE_NAME: config.identifier.replace(/\./g, ''),
    PUBLISHER: config.publisher,
    VERSION: config.version,
    ARCH: arch,
    DISPLAY_NAME: config.displayName,
    PUBLISHER_DISPLAY_NAME: config.publisherDisplayName,
    MIN_VERSION: minVersion,
    EXECUTABLE: `${config.displayName.replace(/\s+/g, '')}.exe`,
    DESCRIPTION: config.description || config.displayName,
    EXTENSIONS: generateExtensions(config),
    CAPABILITIES: generateCapabilities(config.capabilities || []),
  };

  return replaceTemplateVariables(MANIFEST_TEMPLATE, variables);
}

function generateExtensions(config: MergedConfig): string {
  const extensions: string[] = [];

  if (config.extensions?.shareTarget) {
    extensions.push(`      <uap:Extension Category="windows.shareTarget">
        <uap:ShareTarget>
          <uap:SupportedFileTypes>
            <uap:SupportsAnyFileType />
          </uap:SupportedFileTypes>
          <uap:DataFormat>Text</uap:DataFormat>
          <uap:DataFormat>Uri</uap:DataFormat>
        </uap:ShareTarget>
      </uap:Extension>`);
  }

  if (config.extensions?.fileAssociations) {
    for (const assoc of config.extensions.fileAssociations) {
      const fileTypes = assoc.extensions
        .map((ext) => `          <uap:FileType>${ext}</uap:FileType>`)
        .join('\n');

      extensions.push(`      <uap:Extension Category="windows.fileTypeAssociation">
        <uap:FileTypeAssociation Name="${assoc.name}">
          <uap:SupportedFileTypes>
${fileTypes}
          </uap:SupportedFileTypes>
        </uap:FileTypeAssociation>
      </uap:Extension>`);
    }
  }

  if (config.extensions?.protocolHandlers) {
    for (const handler of config.extensions.protocolHandlers) {
      extensions.push(`      <uap:Extension Category="windows.protocol">
        <uap:Protocol Name="${handler.name}">
          <uap:DisplayName>${handler.displayName || handler.name}</uap:DisplayName>
        </uap:Protocol>
      </uap:Extension>`);
    }
  }

  return extensions.length > 0 ? extensions.join('\n\n') : '';
}

function generateCapabilities(capabilities: string[]): string {
  return capabilities.map((cap) => `    <Capability Name="${cap}" />`).join('\n');
}

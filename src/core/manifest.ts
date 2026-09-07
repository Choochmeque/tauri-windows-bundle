import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MergedConfig, CapabilitiesConfig } from '../types.js';
import { DEFAULT_CAPABILITIES } from '../types.js';
import { replaceTemplateVariables } from '../utils/template.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findPackageRoot(startDir: string): string {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  throw new Error('Could not find package root');
}

const PACKAGE_ROOT = findPackageRoot(__dirname);
const TEMPLATES_DIR = path.join(PACKAGE_ROOT, 'templates');
const EXTENSIONS_DIR = path.join(TEMPLATES_DIR, 'extensions');

export function getPackageVersion(): string {
  const pkg = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf-8'));
  return pkg.version;
}

function loadTemplate(templatePath: string): string {
  return fs.readFileSync(templatePath, 'utf-8');
}

function getManifestTemplate(windowsDir: string): string {
  const localPath = path.join(windowsDir, 'AppxManifest.xml.template');
  if (!fs.existsSync(localPath)) {
    throw new Error(
      `AppxManifest.xml.template not found at ${localPath}. Run 'tauri-windows-bundle init' first.`
    );
  }
  return loadTemplate(localPath);
}

function getExtensionTemplate(name: string): string {
  return loadTemplate(path.join(EXTENSIONS_DIR, `${name}.xml`));
}

export function generateManifestTemplate(windowsDir: string): void {
  const templatePath = path.join(windowsDir, 'AppxManifest.xml.template');
  const template = loadTemplate(path.join(TEMPLATES_DIR, 'AppxManifest.xml.template'));
  fs.writeFileSync(templatePath, template);
}

/**
 * Canonical exe filename. Used as the binary's name in the packaged appx root
 * and as the `Executable=` attribute on the main `<Application>` block plus any
 * extension that references the same binary (e.g. `com:ExeServer`,
 * `uap3:Extension Category="windows.appExecutionAlias"`).
 *
 * `config.executableName` (resolved once per build by {@link resolveExecutableName})
 * wins; the historical displayName-derived guess remains only as the last resort.
 */
export function executableName(
  config: Pick<MergedConfig, 'displayName' | 'executableName'>
): string {
  if (config.executableName) return config.executableName;
  return `${config.displayName.replace(/\s+/g, '')}.exe`;
}

/**
 * Resolves the real name of the binary `tauri build` produced. Tauri v2 does
 * not rename binaries to the product name: the artifact is the Cargo bin name
 * unless `mainBinaryName` overrides it. Order: explicit `executableName` in
 * bundle.config.json → `mainBinaryName` in tauri.conf.json → the first
 * `[[bin]]` name (else `[package]` name) from src-tauri/Cargo.toml →
 * undefined, letting {@link executableName} fall back to the displayName guess.
 */
export function resolveExecutableName(
  explicit: string | undefined,
  tauriConfig: { mainBinaryName?: string },
  srcTauriDir: string
): string | undefined {
  if (explicit) return explicit.toLowerCase().endsWith('.exe') ? explicit : `${explicit}.exe`;
  if (tauriConfig.mainBinaryName) return `${tauriConfig.mainBinaryName}.exe`;
  const cargoName = readCargoBinName(srcTauriDir);
  return cargoName ? `${cargoName}.exe` : undefined;
}

// Line-oriented, not a full TOML parser: a `[bin]`-looking line inside a
// multiline string would be misread. Cargo manifests in practice never carry
// those; both quote styles for `name` are handled.
function readCargoBinName(srcTauriDir: string): string | undefined {
  const cargoToml = path.join(srcTauriDir, 'Cargo.toml');
  if (!fs.existsSync(cargoToml)) return undefined;
  const lines = fs.readFileSync(cargoToml, 'utf8').split(/\r?\n/);
  let section = '';
  let packageName: string | undefined;
  for (const line of lines) {
    const header = line.match(/^\s*\[+\s*([^\]]+?)\s*\]+/);
    if (header) {
      section = header[1];
      continue;
    }
    const name = line.match(/^\s*name\s*=\s*(?:"([^"]+)"|'([^']+)')/);
    if (!name) continue;
    const value = name[1] ?? name[2];
    if (section === 'bin') return value;
    if (section === 'package' && packageName === undefined) packageName = value;
  }
  return packageName;
}

export function generateManifest(
  config: MergedConfig,
  arch: string,
  minVersion: string,
  windowsDir: string
): string {
  const variables: Record<string, string> = {
    PACKAGE_NAME: config.identifier,
    PUBLISHER: config.publisher,
    VERSION: config.version,
    ARCH: arch,
    DISPLAY_NAME: config.displayName,
    PUBLISHER_DISPLAY_NAME: config.publisherDisplayName,
    MIN_VERSION: minVersion,
    EXECUTABLE: executableName(config),
    DESCRIPTION: config.description || config.displayName,
    EXTENSIONS: generateExtensions(config),
    CAPABILITIES: generateCapabilities(config.capabilities || DEFAULT_CAPABILITIES),
  };

  return replaceTemplateVariables(getManifestTemplate(windowsDir), variables);
}

export function getDefaultLanguageFromManifestXml(manifestXml: string): string | undefined {
  const languageMatch = manifestXml.match(/<Resource\b[^>]*\bLanguage="([^"]+)"/i);
  return languageMatch?.[1];
}

export function getDefaultLanguageFromManifestFile(manifestPath: string): string | undefined {
  if (!fs.existsSync(manifestPath)) {
    return undefined;
  }

  const manifest = fs.readFileSync(manifestPath, 'utf-8');
  return getDefaultLanguageFromManifestXml(manifest);
}

function generateExtensions(config: MergedConfig): string {
  const extensions: string[] = [];

  if (config.extensions?.shareTarget) {
    const template = getExtensionTemplate('share-target');
    extensions.push(template.trimEnd());
  }

  if (config.extensions?.fileAssociations) {
    const template = getExtensionTemplate('file-association');
    for (const assoc of config.extensions.fileAssociations) {
      const fileTypes = assoc.extensions
        .map((ext) => `          <uap:FileType>${ext}</uap:FileType>`)
        .join('\n');

      const result = replaceTemplateVariables(template, {
        NAME: assoc.name,
        FILE_TYPES: fileTypes,
      });
      extensions.push(result.trimEnd());
    }
  }

  if (config.extensions?.protocolHandlers) {
    const template = getExtensionTemplate('protocol');
    for (const handler of config.extensions.protocolHandlers) {
      const result = replaceTemplateVariables(template, {
        NAME: handler.name,
        DISPLAY_NAME: handler.displayName || handler.name,
      });
      extensions.push(result.trimEnd());
    }
  }

  if (config.extensions?.startupTask?.enabled) {
    const template = getExtensionTemplate('startup-task');
    const taskId = config.extensions.startupTask.taskId || 'StartupTask';
    const result = replaceTemplateVariables(template, {
      TASK_ID: taskId,
      DISPLAY_NAME: config.displayName,
    });
    extensions.push(result.trimEnd());
  }

  if (config.extensions?.contextMenus) {
    const template = getExtensionTemplate('context-menu');
    for (const menu of config.extensions.contextMenus) {
      const fileTypes = menu.fileTypes
        .map((ft) => `            <desktop:FileType>${ft}</desktop:FileType>`)
        .join('\n');

      const result = replaceTemplateVariables(template, {
        NAME: menu.name,
        FILE_TYPES: fileTypes,
      });
      extensions.push(result.trimEnd());
    }
  }

  if (config.extensions?.backgroundTasks) {
    const template = getExtensionTemplate('background-task');
    for (const task of config.extensions.backgroundTasks) {
      const triggerType =
        task.type === 'timer'
          ? 'TimeTrigger'
          : task.type === 'systemEvent'
            ? 'SystemTrigger'
            : 'PushNotificationTrigger';

      const result = replaceTemplateVariables(template, {
        ENTRY_POINT: task.name,
        TRIGGER_TYPE: triggerType,
      });
      extensions.push(result.trimEnd());
    }
  }

  if (config.extensions?.appExecutionAliases) {
    const template = getExtensionTemplate('app-execution-alias');
    const executable = executableName(config);
    for (const alias of config.extensions.appExecutionAliases) {
      const result = replaceTemplateVariables(template, {
        ALIAS: alias.alias.endsWith('.exe') ? alias.alias : `${alias.alias}.exe`,
        EXECUTABLE: executable,
      });
      extensions.push(result.trimEnd());
    }
  }

  if (config.extensions?.appServices) {
    const template = getExtensionTemplate('app-service');
    for (const service of config.extensions.appServices) {
      const result = replaceTemplateVariables(template, {
        NAME: service.name,
      });
      extensions.push(result.trimEnd());
    }
  }

  if (config.extensions?.toastActivation) {
    const template = getExtensionTemplate('toast-activation');
    // MSIX schema for `ToastActivatorCLSID` requires the bare UUID form;
    // the braced `{xxx-...}` form fails MakeAppx validation with C00CE169.
    const clsid = (
      config.extensions.toastActivation.clsid ?? generateClsid(config.identifier + '.toast')
    ).replace(/[{}]/g, '');
    const result = replaceTemplateVariables(template, {
      CLSID: clsid,
      EXECUTABLE: executableName(config),
    });
    extensions.push(result.trimEnd());
  }

  if (config.extensions?.autoplayHandlers) {
    for (const handler of config.extensions.autoplayHandlers) {
      if (handler.contentEvent) {
        const template = getExtensionTemplate('autoplay');
        const result = replaceTemplateVariables(template, {
          VERB: handler.verb,
          ACTION_DISPLAY_NAME: handler.actionDisplayName,
          CONTENT_EVENT: handler.contentEvent,
        });
        extensions.push(result.trimEnd());
      }
      if (handler.deviceEvent) {
        const template = getExtensionTemplate('autoplay-device');
        const result = replaceTemplateVariables(template, {
          VERB: handler.verb,
          ACTION_DISPLAY_NAME: handler.actionDisplayName,
          DEVICE_EVENT: handler.deviceEvent,
        });
        extensions.push(result.trimEnd());
      }
    }
  }

  if (config.extensions?.printTaskSettings) {
    const template = getExtensionTemplate('print-task-settings');
    extensions.push(template.trimEnd());
  }

  if (config.extensions?.thumbnailHandlers) {
    const template = getExtensionTemplate('thumbnail-handler');
    for (const handler of config.extensions.thumbnailHandlers) {
      const fileTypes = handler.fileTypes
        .map((ext) => `          <uap:FileType>${ext}</uap:FileType>`)
        .join('\n');

      const result = replaceTemplateVariables(template, {
        NAME: `thumbnail-${handler.clsid.replace(/[{}]/g, '').slice(0, 8)}`,
        FILE_TYPES: fileTypes,
        CLSID: handler.clsid,
      });
      extensions.push(result.trimEnd());
    }
  }

  if (config.extensions?.previewHandlers) {
    const template = getExtensionTemplate('preview-handler');
    for (const handler of config.extensions.previewHandlers) {
      const fileTypes = handler.fileTypes
        .map((ext) => `          <uap:FileType>${ext}</uap:FileType>`)
        .join('\n');

      const result = replaceTemplateVariables(template, {
        NAME: `preview-${handler.clsid.replace(/[{}]/g, '').slice(0, 8)}`,
        FILE_TYPES: fileTypes,
        CLSID: handler.clsid,
      });
      extensions.push(result.trimEnd());
    }
  }

  if (extensions.length === 0) {
    return '';
  }

  return `      <Extensions>\n${extensions.join('\n\n')}\n      </Extensions>`;
}

function generateCapabilities(config: CapabilitiesConfig): string {
  const caps: string[] = [];

  // runFullTrust is always required for Tauri apps using Windows.FullTrustApplication
  caps.push('    <rescap:Capability Name="runFullTrust" />');

  // Add general capabilities
  if (config.general) {
    for (const cap of config.general) {
      caps.push(`    <Capability Name="${cap}" />`);
    }
  }

  // Add device capabilities
  if (config.device) {
    for (const cap of config.device) {
      caps.push(`    <DeviceCapability Name="${cap}" />`);
    }
  }

  // Add restricted capabilities
  if (config.restricted) {
    for (const cap of config.restricted) {
      caps.push(`    <rescap:Capability Name="${cap}" />`);
    }
  }

  return caps.join('\n');
}

function generateClsid(seed: string): string {
  // Generate a deterministic GUID-like string from the seed
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }

  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  const hex2 = Math.abs(hash * 31)
    .toString(16)
    .padStart(8, '0');
  const hex3 = Math.abs(hash * 37)
    .toString(16)
    .padStart(8, '0');
  const hex4 = Math.abs(hash * 41)
    .toString(16)
    .padStart(12, '0');

  return `{${hex.slice(0, 8)}-${hex2.slice(0, 4)}-${hex2.slice(4, 8)}-${hex3.slice(0, 4)}-${hex4.slice(0, 12)}}`.toUpperCase();
}

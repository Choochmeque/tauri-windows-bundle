import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MergedConfig } from '../types.js';
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

function loadTemplate(templatePath: string): string {
  return fs.readFileSync(templatePath, 'utf-8');
}

function getManifestTemplate(): string {
  return loadTemplate(path.join(TEMPLATES_DIR, 'AppxManifest.xml.template'));
}

function getExtensionTemplate(name: string): string {
  return loadTemplate(path.join(EXTENSIONS_DIR, `${name}.xml`));
}

export function generateManifestTemplate(windowsDir: string): void {
  const templatePath = path.join(windowsDir, 'AppxManifest.xml.template');
  const template = getManifestTemplate();
  fs.writeFileSync(templatePath, template);
}

export function generateManifest(config: MergedConfig, arch: string, minVersion: string): string {
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

  return replaceTemplateVariables(getManifestTemplate(), variables);
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
    const executable = `${config.displayName.replace(/\s+/g, '')}.exe`;
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
    // Generate a CLSID from the identifier
    const clsid = generateClsid(config.identifier + '.toast');
    const result = replaceTemplateVariables(template, {
      CLSID: clsid,
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

function generateCapabilities(capabilities: string[]): string {
  const caps: string[] = [];

  // runFullTrust is always required for Tauri apps using Windows.FullTrustApplication
  caps.push('    <rescap:Capability Name="runFullTrust" />');

  // Add user-specified capabilities
  for (const cap of capabilities) {
    caps.push(`    <Capability Name="${cap}" />`);
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

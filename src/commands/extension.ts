import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import type {
  BundleConfig,
  FileAssociation,
  ProtocolHandler,
  ContextMenu,
  BackgroundTask,
  AppExecutionAlias,
  AppService,
  AutoplayHandler,
  ThumbnailHandler,
  PreviewHandler,
} from '../types.js';
import { findProjectRoot, getWindowsDir } from '../core/project-discovery.js';

export interface ExtensionOptions {
  path?: string;
}

function readBundleConfig(windowsDir: string): BundleConfig {
  const configPath = path.join(windowsDir, 'bundle.config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`bundle.config.json not found. Run 'tauri-windows-bundle init' first.`);
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf-8')) as BundleConfig;
}

function writeBundleConfig(windowsDir: string, config: BundleConfig): void {
  const configPath = path.join(windowsDir, 'bundle.config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function extensionList(options: ExtensionOptions): Promise<void> {
  const projectRoot = findProjectRoot(options.path);
  const windowsDir = getWindowsDir(projectRoot);
  const config = readBundleConfig(windowsDir);

  console.log('\nConfigured extensions:\n');

  // Share Target
  const shareTarget = config.extensions?.shareTarget ?? false;
  console.log(`  Share Target: ${shareTarget ? 'enabled' : 'disabled'}`);

  // File Associations
  const fileAssociations = config.extensions?.fileAssociations ?? [];
  if (fileAssociations.length > 0) {
    console.log('\n  File Associations:');
    for (const assoc of fileAssociations) {
      console.log(`    - ${assoc.name}: ${assoc.extensions.join(', ')}`);
    }
  } else {
    console.log('\n  File Associations: none');
  }

  // Protocol Handlers
  const protocolHandlers = config.extensions?.protocolHandlers ?? [];
  if (protocolHandlers.length > 0) {
    console.log('\n  Protocol Handlers:');
    for (const handler of protocolHandlers) {
      console.log(`    - ${handler.name}:// (${handler.displayName || handler.name})`);
    }
  } else {
    console.log('\n  Protocol Handlers: none');
  }

  // Startup Task
  const startupTask = config.extensions?.startupTask;
  console.log(`\n  Startup Task: ${startupTask?.enabled ? 'enabled' : 'disabled'}`);

  // Context Menus
  const contextMenus = config.extensions?.contextMenus ?? [];
  if (contextMenus.length > 0) {
    console.log('\n  Context Menus:');
    for (const menu of contextMenus) {
      console.log(`    - ${menu.name}: ${menu.fileTypes.join(', ')}`);
    }
  } else {
    console.log('\n  Context Menus: none');
  }

  // Background Tasks
  const backgroundTasks = config.extensions?.backgroundTasks ?? [];
  if (backgroundTasks.length > 0) {
    console.log('\n  Background Tasks:');
    for (const task of backgroundTasks) {
      console.log(`    - ${task.name} (${task.type})`);
    }
  } else {
    console.log('\n  Background Tasks: none');
  }

  // App Execution Aliases
  const aliases = config.extensions?.appExecutionAliases ?? [];
  if (aliases.length > 0) {
    console.log('\n  App Execution Aliases:');
    for (const alias of aliases) {
      console.log(`    - ${alias.alias}`);
    }
  } else {
    console.log('\n  App Execution Aliases: none');
  }

  // App Services
  const appServices = config.extensions?.appServices ?? [];
  if (appServices.length > 0) {
    console.log('\n  App Services:');
    for (const service of appServices) {
      console.log(`    - ${service.name}`);
    }
  } else {
    console.log('\n  App Services: none');
  }

  // Toast Activation
  const toastActivation = config.extensions?.toastActivation;
  console.log(`\n  Toast Activation: ${toastActivation ? 'enabled' : 'disabled'}`);

  // Autoplay Handlers
  const autoplayHandlers = config.extensions?.autoplayHandlers ?? [];
  if (autoplayHandlers.length > 0) {
    console.log('\n  Autoplay Handlers:');
    for (const handler of autoplayHandlers) {
      console.log(`    - ${handler.verb}: ${handler.actionDisplayName}`);
    }
  } else {
    console.log('\n  Autoplay Handlers: none');
  }

  // Print Task Settings
  const printTaskSettings = config.extensions?.printTaskSettings;
  console.log(`\n  Print Task Settings: ${printTaskSettings ? 'enabled' : 'disabled'}`);

  // Thumbnail Handlers
  const thumbnailHandlers = config.extensions?.thumbnailHandlers ?? [];
  if (thumbnailHandlers.length > 0) {
    console.log('\n  Thumbnail Handlers:');
    for (const handler of thumbnailHandlers) {
      console.log(`    - ${handler.fileTypes.join(', ')}`);
    }
  } else {
    console.log('\n  Thumbnail Handlers: none');
  }

  // Preview Handlers
  const previewHandlers = config.extensions?.previewHandlers ?? [];
  if (previewHandlers.length > 0) {
    console.log('\n  Preview Handlers:');
    for (const handler of previewHandlers) {
      console.log(`    - ${handler.fileTypes.join(', ')}`);
    }
  } else {
    console.log('\n  Preview Handlers: none');
  }

  console.log('');
}

export async function extensionAddFileAssociation(options: ExtensionOptions): Promise<void> {
  const projectRoot = findProjectRoot(options.path);
  const windowsDir = getWindowsDir(projectRoot);
  const config = readBundleConfig(windowsDir);

  console.log('\nAdd File Association\n');

  const name = await prompt('Association name (e.g., myfiles): ');
  if (!name) {
    console.log('Cancelled.');
    return;
  }

  const extensionsInput = await prompt('File extensions (comma-separated, e.g., .myf,.myx): ');
  if (!extensionsInput) {
    console.log('Cancelled.');
    return;
  }

  const extensions = extensionsInput.split(',').map((ext) => {
    ext = ext.trim();
    return ext.startsWith('.') ? ext : `.${ext}`;
  });

  const description = await prompt('Description (optional): ');

  const fileAssociation: FileAssociation = {
    name,
    extensions,
  };

  if (description) {
    fileAssociation.description = description;
  }

  if (!config.extensions) {
    config.extensions = {};
  }
  if (!config.extensions.fileAssociations) {
    config.extensions.fileAssociations = [];
  }

  // Check for duplicate
  const existing = config.extensions.fileAssociations.find((a) => a.name === name);
  if (existing) {
    console.log(`\nFile association '${name}' already exists. Updating...`);
    Object.assign(existing, fileAssociation);
  } else {
    config.extensions.fileAssociations.push(fileAssociation);
  }

  writeBundleConfig(windowsDir, config);
  console.log(`\nFile association '${name}' added successfully.`);
}

export async function extensionAddProtocol(options: ExtensionOptions): Promise<void> {
  const projectRoot = findProjectRoot(options.path);
  const windowsDir = getWindowsDir(projectRoot);
  const config = readBundleConfig(windowsDir);

  console.log('\nAdd Protocol Handler\n');

  const name = await prompt('Protocol name (e.g., myapp): ');
  if (!name) {
    console.log('Cancelled.');
    return;
  }

  const displayName = await prompt(`Display name (default: ${name}): `);

  const protocolHandler: ProtocolHandler = {
    name,
  };

  if (displayName) {
    protocolHandler.displayName = displayName;
  }

  if (!config.extensions) {
    config.extensions = {};
  }
  if (!config.extensions.protocolHandlers) {
    config.extensions.protocolHandlers = [];
  }

  // Check for duplicate
  const existing = config.extensions.protocolHandlers.find((p) => p.name === name);
  if (existing) {
    console.log(`\nProtocol handler '${name}' already exists. Updating...`);
    Object.assign(existing, protocolHandler);
  } else {
    config.extensions.protocolHandlers.push(protocolHandler);
  }

  writeBundleConfig(windowsDir, config);
  console.log(`\nProtocol handler '${name}://' added successfully.`);
}

export async function extensionEnableShareTarget(options: ExtensionOptions): Promise<void> {
  const projectRoot = findProjectRoot(options.path);
  const windowsDir = getWindowsDir(projectRoot);
  const config = readBundleConfig(windowsDir);

  if (!config.extensions) {
    config.extensions = {};
  }

  config.extensions.shareTarget = true;

  writeBundleConfig(windowsDir, config);
  console.log('\nShare Target enabled.');
}

export async function extensionDisableShareTarget(options: ExtensionOptions): Promise<void> {
  const projectRoot = findProjectRoot(options.path);
  const windowsDir = getWindowsDir(projectRoot);
  const config = readBundleConfig(windowsDir);

  if (!config.extensions) {
    config.extensions = {};
  }

  config.extensions.shareTarget = false;

  writeBundleConfig(windowsDir, config);
  console.log('\nShare Target disabled.');
}

export async function extensionEnableStartupTask(options: ExtensionOptions): Promise<void> {
  const projectRoot = findProjectRoot(options.path);
  const windowsDir = getWindowsDir(projectRoot);
  const config = readBundleConfig(windowsDir);

  if (!config.extensions) {
    config.extensions = {};
  }

  config.extensions.startupTask = { enabled: true };

  writeBundleConfig(windowsDir, config);
  console.log('\nStartup Task enabled. App will run on Windows login.');
}

export async function extensionDisableStartupTask(options: ExtensionOptions): Promise<void> {
  const projectRoot = findProjectRoot(options.path);
  const windowsDir = getWindowsDir(projectRoot);
  const config = readBundleConfig(windowsDir);

  if (!config.extensions) {
    config.extensions = {};
  }

  config.extensions.startupTask = { enabled: false };

  writeBundleConfig(windowsDir, config);
  console.log('\nStartup Task disabled.');
}

export async function extensionAddContextMenu(options: ExtensionOptions): Promise<void> {
  const projectRoot = findProjectRoot(options.path);
  const windowsDir = getWindowsDir(projectRoot);
  const config = readBundleConfig(windowsDir);

  console.log('\nAdd Context Menu\n');

  const name = await prompt('Menu item name (e.g., open-with-myapp): ');
  if (!name) {
    console.log('Cancelled.');
    return;
  }

  const fileTypesInput = await prompt('File types (comma-separated, e.g., *, .txt, .doc): ');
  if (!fileTypesInput) {
    console.log('Cancelled.');
    return;
  }

  const fileTypes = fileTypesInput.split(',').map((t) => t.trim());
  const displayName = await prompt('Display name (shown in menu): ');

  const contextMenu: ContextMenu = {
    name,
    fileTypes,
  };

  if (displayName) {
    contextMenu.displayName = displayName;
  }

  if (!config.extensions) {
    config.extensions = {};
  }
  if (!config.extensions.contextMenus) {
    config.extensions.contextMenus = [];
  }

  const existing = config.extensions.contextMenus.find((m) => m.name === name);
  if (existing) {
    console.log(`\nContext menu '${name}' already exists. Updating...`);
    Object.assign(existing, contextMenu);
  } else {
    config.extensions.contextMenus.push(contextMenu);
  }

  writeBundleConfig(windowsDir, config);
  console.log(`\nContext menu '${name}' added successfully.`);
}

export async function extensionAddBackgroundTask(options: ExtensionOptions): Promise<void> {
  const projectRoot = findProjectRoot(options.path);
  const windowsDir = getWindowsDir(projectRoot);
  const config = readBundleConfig(windowsDir);

  console.log('\nAdd Background Task\n');

  const name = await prompt('Task name (e.g., sync-task): ');
  if (!name) {
    console.log('Cancelled.');
    return;
  }

  console.log('Task types:');
  console.log('  1. timer - Runs periodically');
  console.log('  2. systemEvent - Runs on system events');
  console.log('  3. pushNotification - Runs on push notification');

  const typeInput = await prompt('Task type (1/2/3): ');
  const typeMap: Record<string, BackgroundTask['type']> = {
    '1': 'timer',
    '2': 'systemEvent',
    '3': 'pushNotification',
    timer: 'timer',
    systemevent: 'systemEvent',
    pushnotification: 'pushNotification',
  };

  const taskType = typeMap[typeInput.toLowerCase()];
  if (!taskType) {
    console.log('Invalid task type. Cancelled.');
    return;
  }

  const backgroundTask: BackgroundTask = {
    name,
    type: taskType,
  };

  if (!config.extensions) {
    config.extensions = {};
  }
  if (!config.extensions.backgroundTasks) {
    config.extensions.backgroundTasks = [];
  }

  const existing = config.extensions.backgroundTasks.find((t) => t.name === name);
  if (existing) {
    console.log(`\nBackground task '${name}' already exists. Updating...`);
    Object.assign(existing, backgroundTask);
  } else {
    config.extensions.backgroundTasks.push(backgroundTask);
  }

  writeBundleConfig(windowsDir, config);
  console.log(`\nBackground task '${name}' (${taskType}) added successfully.`);
}

export async function extensionAddAppExecutionAlias(options: ExtensionOptions): Promise<void> {
  const projectRoot = findProjectRoot(options.path);
  const windowsDir = getWindowsDir(projectRoot);
  const config = readBundleConfig(windowsDir);

  console.log('\nAdd App Execution Alias\n');

  const alias = await prompt('Alias name (e.g., myapp): ');
  if (!alias) {
    console.log('Cancelled.');
    return;
  }

  const appAlias: AppExecutionAlias = { alias };

  if (!config.extensions) {
    config.extensions = {};
  }
  if (!config.extensions.appExecutionAliases) {
    config.extensions.appExecutionAliases = [];
  }

  const existing = config.extensions.appExecutionAliases.find((a) => a.alias === alias);
  if (existing) {
    console.log(`\nAlias '${alias}' already exists.`);
    return;
  }

  config.extensions.appExecutionAliases.push(appAlias);
  writeBundleConfig(windowsDir, config);
  console.log(`\nApp execution alias '${alias}' added. You can run your app from command line.`);
}

export async function extensionAddAppService(options: ExtensionOptions): Promise<void> {
  const projectRoot = findProjectRoot(options.path);
  const windowsDir = getWindowsDir(projectRoot);
  const config = readBundleConfig(windowsDir);

  console.log('\nAdd App Service\n');

  const name = await prompt('Service name (e.g., com.myapp.service): ');
  if (!name) {
    console.log('Cancelled.');
    return;
  }

  const appService: AppService = { name };

  if (!config.extensions) {
    config.extensions = {};
  }
  if (!config.extensions.appServices) {
    config.extensions.appServices = [];
  }

  const existing = config.extensions.appServices.find((s) => s.name === name);
  if (existing) {
    console.log(`\nApp service '${name}' already exists.`);
    return;
  }

  config.extensions.appServices.push(appService);
  writeBundleConfig(windowsDir, config);
  console.log(`\nApp service '${name}' added. Other apps can now call into your app.`);
}

export async function extensionEnableToastActivation(options: ExtensionOptions): Promise<void> {
  const projectRoot = findProjectRoot(options.path);
  const windowsDir = getWindowsDir(projectRoot);
  const config = readBundleConfig(windowsDir);

  if (!config.extensions) {
    config.extensions = {};
  }

  config.extensions.toastActivation = { activationType: 'foreground' };

  writeBundleConfig(windowsDir, config);
  console.log('\nToast Activation enabled. Your app will handle toast notification clicks.');
}

export async function extensionDisableToastActivation(options: ExtensionOptions): Promise<void> {
  const projectRoot = findProjectRoot(options.path);
  const windowsDir = getWindowsDir(projectRoot);
  const config = readBundleConfig(windowsDir);

  if (config.extensions) {
    delete config.extensions.toastActivation;
  }

  writeBundleConfig(windowsDir, config);
  console.log('\nToast Activation disabled.');
}

export async function extensionAddAutoplay(options: ExtensionOptions): Promise<void> {
  const projectRoot = findProjectRoot(options.path);
  const windowsDir = getWindowsDir(projectRoot);
  const config = readBundleConfig(windowsDir);

  console.log('\nAdd Autoplay Handler\n');

  const verb = await prompt('Verb (e.g., open, play): ');
  if (!verb) {
    console.log('Cancelled.');
    return;
  }

  const actionDisplayName = await prompt('Action display name (e.g., Open with MyApp): ');
  if (!actionDisplayName) {
    console.log('Cancelled.');
    return;
  }

  console.log('Event type:');
  console.log('  1. Content event (e.g., PlayMusicFilesOnArrival)');
  console.log('  2. Device event (e.g., WPD\\ImageSource)');

  const eventType = await prompt('Event type (1/2): ');

  const handler: AutoplayHandler = { verb, actionDisplayName };

  if (eventType === '1') {
    const contentEvent = await prompt('Content event (e.g., PlayMusicFilesOnArrival): ');
    if (!contentEvent) {
      console.log('Cancelled.');
      return;
    }
    handler.contentEvent = contentEvent;
  } else if (eventType === '2') {
    const deviceEvent = await prompt('Device event (e.g., WPD\\\\ImageSource): ');
    if (!deviceEvent) {
      console.log('Cancelled.');
      return;
    }
    handler.deviceEvent = deviceEvent;
  } else {
    console.log('Invalid event type. Cancelled.');
    return;
  }

  if (!config.extensions) {
    config.extensions = {};
  }
  if (!config.extensions.autoplayHandlers) {
    config.extensions.autoplayHandlers = [];
  }

  config.extensions.autoplayHandlers.push(handler);
  writeBundleConfig(windowsDir, config);
  console.log(`\nAutoplay handler '${verb}' added.`);
}

export async function extensionEnablePrintTaskSettings(options: ExtensionOptions): Promise<void> {
  const projectRoot = findProjectRoot(options.path);
  const windowsDir = getWindowsDir(projectRoot);
  const config = readBundleConfig(windowsDir);

  if (!config.extensions) {
    config.extensions = {};
  }

  config.extensions.printTaskSettings = { displayName: 'Print Settings' };

  writeBundleConfig(windowsDir, config);
  console.log('\nPrint Task Settings enabled.');
}

export async function extensionDisablePrintTaskSettings(options: ExtensionOptions): Promise<void> {
  const projectRoot = findProjectRoot(options.path);
  const windowsDir = getWindowsDir(projectRoot);
  const config = readBundleConfig(windowsDir);

  if (config.extensions) {
    delete config.extensions.printTaskSettings;
  }

  writeBundleConfig(windowsDir, config);
  console.log('\nPrint Task Settings disabled.');
}

export async function extensionAddThumbnailHandler(options: ExtensionOptions): Promise<void> {
  const projectRoot = findProjectRoot(options.path);
  const windowsDir = getWindowsDir(projectRoot);
  const config = readBundleConfig(windowsDir);

  console.log('\nAdd Thumbnail Handler\n');

  const clsid = await prompt('CLSID (e.g., {12345678-1234-1234-1234-123456789012}): ');
  if (!clsid) {
    console.log('Cancelled.');
    return;
  }

  const fileTypesInput = await prompt('File types (comma-separated, e.g., .myf,.myx): ');
  if (!fileTypesInput) {
    console.log('Cancelled.');
    return;
  }

  const fileTypes = fileTypesInput.split(',').map((t) => t.trim());

  const handler: ThumbnailHandler = { clsid, fileTypes };

  if (!config.extensions) {
    config.extensions = {};
  }
  if (!config.extensions.thumbnailHandlers) {
    config.extensions.thumbnailHandlers = [];
  }

  config.extensions.thumbnailHandlers.push(handler);
  writeBundleConfig(windowsDir, config);
  console.log(`\nThumbnail handler added for ${fileTypes.join(', ')}.`);
}

export async function extensionAddPreviewHandler(options: ExtensionOptions): Promise<void> {
  const projectRoot = findProjectRoot(options.path);
  const windowsDir = getWindowsDir(projectRoot);
  const config = readBundleConfig(windowsDir);

  console.log('\nAdd Preview Handler\n');

  const clsid = await prompt('CLSID (e.g., {12345678-1234-1234-1234-123456789012}): ');
  if (!clsid) {
    console.log('Cancelled.');
    return;
  }

  const fileTypesInput = await prompt('File types (comma-separated, e.g., .myf,.myx): ');
  if (!fileTypesInput) {
    console.log('Cancelled.');
    return;
  }

  const fileTypes = fileTypesInput.split(',').map((t) => t.trim());

  const handler: PreviewHandler = { clsid, fileTypes };

  if (!config.extensions) {
    config.extensions = {};
  }
  if (!config.extensions.previewHandlers) {
    config.extensions.previewHandlers = [];
  }

  config.extensions.previewHandlers.push(handler);
  writeBundleConfig(windowsDir, config);
  console.log(`\nPreview handler added for ${fileTypes.join(', ')}.`);
}

export async function extensionRemove(
  type: string,
  name: string,
  options: ExtensionOptions
): Promise<void> {
  const projectRoot = findProjectRoot(options.path);
  const windowsDir = getWindowsDir(projectRoot);
  const config = readBundleConfig(windowsDir);

  if (!config.extensions) {
    console.log('\nNo extensions configured.');
    return;
  }

  switch (type) {
    case 'file-association': {
      if (!config.extensions.fileAssociations) {
        console.log('\nNo file associations configured.');
        return;
      }
      const index = config.extensions.fileAssociations.findIndex((a) => a.name === name);
      if (index === -1) {
        console.log(`\nFile association '${name}' not found.`);
        return;
      }
      config.extensions.fileAssociations.splice(index, 1);
      writeBundleConfig(windowsDir, config);
      console.log(`\nFile association '${name}' removed.`);
      break;
    }

    case 'protocol': {
      if (!config.extensions.protocolHandlers) {
        console.log('\nNo protocol handlers configured.');
        return;
      }
      const index = config.extensions.protocolHandlers.findIndex((p) => p.name === name);
      if (index === -1) {
        console.log(`\nProtocol handler '${name}' not found.`);
        return;
      }
      config.extensions.protocolHandlers.splice(index, 1);
      writeBundleConfig(windowsDir, config);
      console.log(`\nProtocol handler '${name}' removed.`);
      break;
    }

    case 'context-menu': {
      if (!config.extensions.contextMenus) {
        console.log('\nNo context menus configured.');
        return;
      }
      const index = config.extensions.contextMenus.findIndex((m) => m.name === name);
      if (index === -1) {
        console.log(`\nContext menu '${name}' not found.`);
        return;
      }
      config.extensions.contextMenus.splice(index, 1);
      writeBundleConfig(windowsDir, config);
      console.log(`\nContext menu '${name}' removed.`);
      break;
    }

    case 'background-task': {
      if (!config.extensions.backgroundTasks) {
        console.log('\nNo background tasks configured.');
        return;
      }
      const index = config.extensions.backgroundTasks.findIndex((t) => t.name === name);
      if (index === -1) {
        console.log(`\nBackground task '${name}' not found.`);
        return;
      }
      config.extensions.backgroundTasks.splice(index, 1);
      writeBundleConfig(windowsDir, config);
      console.log(`\nBackground task '${name}' removed.`);
      break;
    }

    case 'app-execution-alias': {
      if (!config.extensions.appExecutionAliases) {
        console.log('\nNo app execution aliases configured.');
        return;
      }
      const index = config.extensions.appExecutionAliases.findIndex((a) => a.alias === name);
      if (index === -1) {
        console.log(`\nApp execution alias '${name}' not found.`);
        return;
      }
      config.extensions.appExecutionAliases.splice(index, 1);
      writeBundleConfig(windowsDir, config);
      console.log(`\nApp execution alias '${name}' removed.`);
      break;
    }

    case 'app-service': {
      if (!config.extensions.appServices) {
        console.log('\nNo app services configured.');
        return;
      }
      const index = config.extensions.appServices.findIndex((s) => s.name === name);
      if (index === -1) {
        console.log(`\nApp service '${name}' not found.`);
        return;
      }
      config.extensions.appServices.splice(index, 1);
      writeBundleConfig(windowsDir, config);
      console.log(`\nApp service '${name}' removed.`);
      break;
    }

    case 'autoplay': {
      if (!config.extensions.autoplayHandlers) {
        console.log('\nNo autoplay handlers configured.');
        return;
      }
      const index = config.extensions.autoplayHandlers.findIndex((h) => h.verb === name);
      if (index === -1) {
        console.log(`\nAutoplay handler '${name}' not found.`);
        return;
      }
      config.extensions.autoplayHandlers.splice(index, 1);
      writeBundleConfig(windowsDir, config);
      console.log(`\nAutoplay handler '${name}' removed.`);
      break;
    }

    case 'thumbnail-handler': {
      if (!config.extensions.thumbnailHandlers) {
        console.log('\nNo thumbnail handlers configured.');
        return;
      }
      const index = config.extensions.thumbnailHandlers.findIndex((h) => h.clsid === name);
      if (index === -1) {
        console.log(`\nThumbnail handler '${name}' not found.`);
        return;
      }
      config.extensions.thumbnailHandlers.splice(index, 1);
      writeBundleConfig(windowsDir, config);
      console.log(`\nThumbnail handler removed.`);
      break;
    }

    case 'preview-handler': {
      if (!config.extensions.previewHandlers) {
        console.log('\nNo preview handlers configured.');
        return;
      }
      const index = config.extensions.previewHandlers.findIndex((h) => h.clsid === name);
      if (index === -1) {
        console.log(`\nPreview handler '${name}' not found.`);
        return;
      }
      config.extensions.previewHandlers.splice(index, 1);
      writeBundleConfig(windowsDir, config);
      console.log(`\nPreview handler removed.`);
      break;
    }

    default:
      console.log(`\nUnknown extension type: ${type}`);
      console.log(
        'Valid types: file-association, protocol, context-menu, background-task, ' +
          'app-execution-alias, app-service, autoplay, thumbnail-handler, preview-handler'
      );
  }
}

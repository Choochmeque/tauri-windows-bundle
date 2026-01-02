import { Command } from 'commander';
import { init } from './commands/init.js';
import { build } from './commands/build.js';
import {
  extensionList,
  extensionAddFileAssociation,
  extensionAddProtocol,
  extensionEnableShareTarget,
  extensionDisableShareTarget,
  extensionEnableStartupTask,
  extensionDisableStartupTask,
  extensionAddContextMenu,
  extensionAddBackgroundTask,
  extensionAddAppExecutionAlias,
  extensionAddAppService,
  extensionEnableToastActivation,
  extensionDisableToastActivation,
  extensionAddAutoplay,
  extensionEnablePrintTaskSettings,
  extensionDisablePrintTaskSettings,
  extensionAddThumbnailHandler,
  extensionAddPreviewHandler,
  extensionRemove,
} from './commands/extension.js';

const program = new Command();

program
  .name('tauri-windows-bundle')
  .description('MSIX packaging tool for Tauri apps')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize Windows bundle configuration')
  .option('-p, --path <path>', 'Path to Tauri project')
  .action(async (options) => {
    try {
      await init(options);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('build')
  .description('Build MSIX package')
  .option('--arch <architectures>', 'Architectures to build (comma-separated: x64,arm64)', 'x64')
  .option('--release', 'Build in release mode')
  .option('--min-windows <version>', 'Minimum Windows version', '10.0.17763.0')
  .option('--runner <runner>', 'Build runner (cargo, pnpm, npm, yarn, etc.)', 'cargo')
  .option('--verbose', 'Show full build output instead of spinner')
  .action(async (options) => {
    try {
      await build(options);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Extension commands
const extension = program.command('extension').description('Manage Windows app extensions');

extension
  .command('list')
  .description('List configured extensions')
  .option('-p, --path <path>', 'Path to Tauri project')
  .action(async (options) => {
    try {
      await extensionList(options);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

extension
  .command('add')
  .description('Add an extension')
  .argument('<type>', 'Extension type')
  .option('-p, --path <path>', 'Path to Tauri project')
  .action(async (type, options) => {
    try {
      switch (type) {
        case 'file-association':
          await extensionAddFileAssociation(options);
          break;
        case 'protocol':
          await extensionAddProtocol(options);
          break;
        case 'share-target':
          await extensionEnableShareTarget(options);
          break;
        case 'startup-task':
          await extensionEnableStartupTask(options);
          break;
        case 'context-menu':
          await extensionAddContextMenu(options);
          break;
        case 'background-task':
          await extensionAddBackgroundTask(options);
          break;
        case 'app-execution-alias':
          await extensionAddAppExecutionAlias(options);
          break;
        case 'app-service':
          await extensionAddAppService(options);
          break;
        case 'toast-activation':
          await extensionEnableToastActivation(options);
          break;
        case 'autoplay':
          await extensionAddAutoplay(options);
          break;
        case 'print-task-settings':
          await extensionEnablePrintTaskSettings(options);
          break;
        case 'thumbnail-handler':
          await extensionAddThumbnailHandler(options);
          break;
        case 'preview-handler':
          await extensionAddPreviewHandler(options);
          break;
        default:
          console.error(`Unknown extension type: ${type}`);
          console.log(
            'Valid types: file-association, protocol, share-target, startup-task, context-menu, ' +
              'background-task, app-execution-alias, app-service, toast-activation, autoplay, ' +
              'print-task-settings, thumbnail-handler, preview-handler'
          );
          process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

extension
  .command('remove')
  .description('Remove an extension')
  .argument('<type>', 'Extension type')
  .argument('[name]', 'Extension name/identifier (required for most types)')
  .option('-p, --path <path>', 'Path to Tauri project')
  .action(async (type, name, options) => {
    try {
      // Toggle extensions (no name required)
      if (type === 'share-target') {
        await extensionDisableShareTarget(options);
      } else if (type === 'startup-task') {
        await extensionDisableStartupTask(options);
      } else if (type === 'toast-activation') {
        await extensionDisableToastActivation(options);
      } else if (type === 'print-task-settings') {
        await extensionDisablePrintTaskSettings(options);
      } else {
        // Extensions that require a name
        if (!name) {
          console.error('Name is required for this extension type');
          process.exit(1);
        }
        await extensionRemove(type, name, options);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();

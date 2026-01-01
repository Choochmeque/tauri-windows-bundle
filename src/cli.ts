import { Command } from 'commander';
import { init } from './commands/init.js';
import { build } from './commands/build.js';

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
  .action(async (options) => {
    try {
      await build(options);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();

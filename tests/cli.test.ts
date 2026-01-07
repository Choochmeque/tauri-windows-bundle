import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Store action handlers for testing
type ActionHandler = (...args: unknown[]) => Promise<void>;
const actionHandlers: Record<string, ActionHandler> = {};
let currentCommandPath: string[] = [];
let capturedVersion: string | undefined;

// Mock commander before importing cli
vi.mock('commander', () => {
  const createMockCommand = (path: string[] = []): Record<string, unknown> => {
    const mock: Record<string, unknown> = {};

    mock.name = vi.fn(function () {
      return mock;
    });
    mock.description = vi.fn(function () {
      return mock;
    });
    mock.version = vi.fn(function (v: string) {
      capturedVersion = v;
      return mock;
    });
    mock.option = vi.fn(function () {
      return mock;
    });
    mock.parse = vi.fn(function () {
      return mock;
    });
    mock.argument = vi.fn(function () {
      return mock;
    });

    mock.command = vi.fn(function (name: string) {
      currentCommandPath = [...path, name];
      return createMockCommand(currentCommandPath);
    });

    mock.action = vi.fn(function (handler: ActionHandler) {
      const key = currentCommandPath.join(':');
      actionHandlers[key] = handler;
      return mock;
    });

    return mock;
  };

  return {
    Command: vi.fn(function () {
      return createMockCommand();
    }),
  };
});

// Mock the commands
vi.mock('../src/commands/init.js', () => ({
  init: vi.fn(async function () {
    return undefined;
  }),
}));

vi.mock('../src/commands/build.js', () => ({
  build: vi.fn(async function () {
    return undefined;
  }),
}));

vi.mock('../src/commands/extension.js', () => ({
  extensionList: vi.fn(async function () {
    return undefined;
  }),
  extensionAddFileAssociation: vi.fn(async function () {
    return undefined;
  }),
  extensionAddProtocol: vi.fn(async function () {
    return undefined;
  }),
  extensionEnableShareTarget: vi.fn(async function () {
    return undefined;
  }),
  extensionDisableShareTarget: vi.fn(async function () {
    return undefined;
  }),
  extensionEnableStartupTask: vi.fn(async function () {
    return undefined;
  }),
  extensionDisableStartupTask: vi.fn(async function () {
    return undefined;
  }),
  extensionAddContextMenu: vi.fn(async function () {
    return undefined;
  }),
  extensionAddBackgroundTask: vi.fn(async function () {
    return undefined;
  }),
  extensionAddAppExecutionAlias: vi.fn(async function () {
    return undefined;
  }),
  extensionAddAppService: vi.fn(async function () {
    return undefined;
  }),
  extensionEnableToastActivation: vi.fn(async function () {
    return undefined;
  }),
  extensionDisableToastActivation: vi.fn(async function () {
    return undefined;
  }),
  extensionAddAutoplay: vi.fn(async function () {
    return undefined;
  }),
  extensionEnablePrintTaskSettings: vi.fn(async function () {
    return undefined;
  }),
  extensionDisablePrintTaskSettings: vi.fn(async function () {
    return undefined;
  }),
  extensionAddThumbnailHandler: vi.fn(async function () {
    return undefined;
  }),
  extensionAddPreviewHandler: vi.fn(async function () {
    return undefined;
  }),
  extensionRemove: vi.fn(async function () {
    return undefined;
  }),
}));

describe('cli', () => {
  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(function () {});
    vi.spyOn(console, 'log').mockImplementation(function () {});
    vi.spyOn(process, 'exit').mockImplementation(function () {
      throw new Error('process.exit called');
    } as () => never);

    // Reset action handlers
    Object.keys(actionHandlers).forEach((key) => delete actionHandlers[key]);
    currentCommandPath = [];
    capturedVersion = undefined;

    // Clear module cache and reimport to trigger setup
    vi.resetModules();

    // Import cli to trigger the setup
    await import('../src/cli.js');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('version', () => {
    it('reads version from package.json', async () => {
      // Read actual package.json version
      const fs = await import('node:fs');
      const path = await import('node:path');
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8')
      );

      expect(capturedVersion).toBe(packageJson.version);
    });
  });

  describe('init command', () => {
    it('registers init command', () => {
      expect(actionHandlers['init']).toBeDefined();
    });

    it('calls init with options', async () => {
      const { init } = await import('../src/commands/init.js');
      await actionHandlers['init']({ path: '/test' });
      expect(init).toHaveBeenCalledWith({ path: '/test' });
    });

    it('handles Error', async () => {
      const { init } = await import('../src/commands/init.js');
      vi.mocked(init).mockRejectedValueOnce(new Error('Test error'));
      await expect(actionHandlers['init']({})).rejects.toThrow('process.exit called');
      expect(console.error).toHaveBeenCalledWith('Error:', 'Test error');
    });

    it('handles non-Error', async () => {
      const { init } = await import('../src/commands/init.js');
      vi.mocked(init).mockRejectedValueOnce('string error');
      await expect(actionHandlers['init']({})).rejects.toThrow('process.exit called');
      expect(console.error).toHaveBeenCalledWith('Error:', 'string error');
    });
  });

  describe('build command', () => {
    it('registers build command', () => {
      expect(actionHandlers['build']).toBeDefined();
    });

    it('calls build with options', async () => {
      const { build } = await import('../src/commands/build.js');
      await actionHandlers['build']({ arch: 'x64', debug: true });
      expect(build).toHaveBeenCalledWith({ arch: 'x64', debug: true });
    });

    it('handles Error', async () => {
      const { build } = await import('../src/commands/build.js');
      vi.mocked(build).mockRejectedValueOnce(new Error('Build error'));
      await expect(actionHandlers['build']({})).rejects.toThrow('process.exit called');
      expect(console.error).toHaveBeenCalledWith('Error:', 'Build error');
    });

    it('handles non-Error', async () => {
      const { build } = await import('../src/commands/build.js');
      vi.mocked(build).mockRejectedValueOnce({ code: 1 });
      await expect(actionHandlers['build']({})).rejects.toThrow('process.exit called');
      expect(console.error).toHaveBeenCalledWith('Error:', { code: 1 });
    });
  });

  describe('extension list command', () => {
    it('registers extension list command', () => {
      expect(actionHandlers['extension:list']).toBeDefined();
    });

    it('calls extensionList with options', async () => {
      const { extensionList } = await import('../src/commands/extension.js');
      await actionHandlers['extension:list']({ path: '/test' });
      expect(extensionList).toHaveBeenCalledWith({ path: '/test' });
    });

    it('handles errors', async () => {
      const { extensionList } = await import('../src/commands/extension.js');
      vi.mocked(extensionList).mockRejectedValueOnce(new Error('List error'));
      await expect(actionHandlers['extension:list']({})).rejects.toThrow('process.exit called');
      expect(console.error).toHaveBeenCalledWith('Error:', 'List error');
    });
  });

  describe('extension add command', () => {
    it('registers extension add command', () => {
      expect(actionHandlers['extension:add']).toBeDefined();
    });

    it('adds file-association', async () => {
      const { extensionAddFileAssociation } = await import('../src/commands/extension.js');
      await actionHandlers['extension:add']('file-association', { path: '/test' });
      expect(extensionAddFileAssociation).toHaveBeenCalledWith({ path: '/test' });
    });

    it('adds protocol', async () => {
      const { extensionAddProtocol } = await import('../src/commands/extension.js');
      await actionHandlers['extension:add']('protocol', { path: '/test' });
      expect(extensionAddProtocol).toHaveBeenCalledWith({ path: '/test' });
    });

    it('adds share-target', async () => {
      const { extensionEnableShareTarget } = await import('../src/commands/extension.js');
      await actionHandlers['extension:add']('share-target', { path: '/test' });
      expect(extensionEnableShareTarget).toHaveBeenCalledWith({ path: '/test' });
    });

    it('adds startup-task', async () => {
      const { extensionEnableStartupTask } = await import('../src/commands/extension.js');
      await actionHandlers['extension:add']('startup-task', { path: '/test' });
      expect(extensionEnableStartupTask).toHaveBeenCalledWith({ path: '/test' });
    });

    it('adds context-menu', async () => {
      const { extensionAddContextMenu } = await import('../src/commands/extension.js');
      await actionHandlers['extension:add']('context-menu', { path: '/test' });
      expect(extensionAddContextMenu).toHaveBeenCalledWith({ path: '/test' });
    });

    it('adds background-task', async () => {
      const { extensionAddBackgroundTask } = await import('../src/commands/extension.js');
      await actionHandlers['extension:add']('background-task', { path: '/test' });
      expect(extensionAddBackgroundTask).toHaveBeenCalledWith({ path: '/test' });
    });

    it('adds app-execution-alias', async () => {
      const { extensionAddAppExecutionAlias } = await import('../src/commands/extension.js');
      await actionHandlers['extension:add']('app-execution-alias', { path: '/test' });
      expect(extensionAddAppExecutionAlias).toHaveBeenCalledWith({ path: '/test' });
    });

    it('adds app-service', async () => {
      const { extensionAddAppService } = await import('../src/commands/extension.js');
      await actionHandlers['extension:add']('app-service', { path: '/test' });
      expect(extensionAddAppService).toHaveBeenCalledWith({ path: '/test' });
    });

    it('adds toast-activation', async () => {
      const { extensionEnableToastActivation } = await import('../src/commands/extension.js');
      await actionHandlers['extension:add']('toast-activation', { path: '/test' });
      expect(extensionEnableToastActivation).toHaveBeenCalledWith({ path: '/test' });
    });

    it('adds autoplay', async () => {
      const { extensionAddAutoplay } = await import('../src/commands/extension.js');
      await actionHandlers['extension:add']('autoplay', { path: '/test' });
      expect(extensionAddAutoplay).toHaveBeenCalledWith({ path: '/test' });
    });

    it('adds print-task-settings', async () => {
      const { extensionEnablePrintTaskSettings } = await import('../src/commands/extension.js');
      await actionHandlers['extension:add']('print-task-settings', { path: '/test' });
      expect(extensionEnablePrintTaskSettings).toHaveBeenCalledWith({ path: '/test' });
    });

    it('adds thumbnail-handler', async () => {
      const { extensionAddThumbnailHandler } = await import('../src/commands/extension.js');
      await actionHandlers['extension:add']('thumbnail-handler', { path: '/test' });
      expect(extensionAddThumbnailHandler).toHaveBeenCalledWith({ path: '/test' });
    });

    it('adds preview-handler', async () => {
      const { extensionAddPreviewHandler } = await import('../src/commands/extension.js');
      await actionHandlers['extension:add']('preview-handler', { path: '/test' });
      expect(extensionAddPreviewHandler).toHaveBeenCalledWith({ path: '/test' });
    });

    it('handles unknown type', async () => {
      await expect(actionHandlers['extension:add']('unknown', {})).rejects.toThrow(
        'process.exit called'
      );
      expect(console.error).toHaveBeenCalledWith('Unknown extension type: unknown');
      expect(console.log).toHaveBeenCalledWith(
        'Valid types: file-association, protocol, share-target, startup-task, context-menu, ' +
          'background-task, app-execution-alias, app-service, toast-activation, autoplay, ' +
          'print-task-settings, thumbnail-handler, preview-handler'
      );
    });

    it('handles errors', async () => {
      const { extensionAddFileAssociation } = await import('../src/commands/extension.js');
      vi.mocked(extensionAddFileAssociation).mockRejectedValueOnce(new Error('Add error'));
      await expect(actionHandlers['extension:add']('file-association', {})).rejects.toThrow(
        'process.exit called'
      );
      expect(console.error).toHaveBeenCalledWith('Error:', 'Add error');
    });
  });

  describe('extension remove command', () => {
    it('registers extension remove command', () => {
      expect(actionHandlers['extension:remove']).toBeDefined();
    });

    it('removes share-target', async () => {
      const { extensionDisableShareTarget } = await import('../src/commands/extension.js');
      await actionHandlers['extension:remove']('share-target', undefined, { path: '/test' });
      expect(extensionDisableShareTarget).toHaveBeenCalledWith({ path: '/test' });
    });

    it('removes startup-task', async () => {
      const { extensionDisableStartupTask } = await import('../src/commands/extension.js');
      await actionHandlers['extension:remove']('startup-task', undefined, { path: '/test' });
      expect(extensionDisableStartupTask).toHaveBeenCalledWith({ path: '/test' });
    });

    it('removes toast-activation', async () => {
      const { extensionDisableToastActivation } = await import('../src/commands/extension.js');
      await actionHandlers['extension:remove']('toast-activation', undefined, { path: '/test' });
      expect(extensionDisableToastActivation).toHaveBeenCalledWith({ path: '/test' });
    });

    it('removes print-task-settings', async () => {
      const { extensionDisablePrintTaskSettings } = await import('../src/commands/extension.js');
      await actionHandlers['extension:remove']('print-task-settings', undefined, { path: '/test' });
      expect(extensionDisablePrintTaskSettings).toHaveBeenCalledWith({ path: '/test' });
    });

    it('removes file-association with name', async () => {
      const { extensionRemove } = await import('../src/commands/extension.js');
      await actionHandlers['extension:remove']('file-association', 'myfiles', { path: '/test' });
      expect(extensionRemove).toHaveBeenCalledWith('file-association', 'myfiles', {
        path: '/test',
      });
    });

    it('removes protocol with name', async () => {
      const { extensionRemove } = await import('../src/commands/extension.js');
      await actionHandlers['extension:remove']('protocol', 'myapp', {});
      expect(extensionRemove).toHaveBeenCalledWith('protocol', 'myapp', {});
    });

    it('requires name for file-association', async () => {
      await expect(
        actionHandlers['extension:remove']('file-association', undefined, {})
      ).rejects.toThrow('process.exit called');
      expect(console.error).toHaveBeenCalledWith('Name is required for this extension type');
    });

    it('requires name for protocol', async () => {
      await expect(actionHandlers['extension:remove']('protocol', null, {})).rejects.toThrow(
        'process.exit called'
      );
      expect(console.error).toHaveBeenCalledWith('Name is required for this extension type');
    });

    it('handles errors', async () => {
      const { extensionDisableShareTarget } = await import('../src/commands/extension.js');
      vi.mocked(extensionDisableShareTarget).mockRejectedValueOnce(new Error('Remove error'));
      await expect(
        actionHandlers['extension:remove']('share-target', undefined, {})
      ).rejects.toThrow('process.exit called');
      expect(console.error).toHaveBeenCalledWith('Error:', 'Remove error');
    });
  });
});

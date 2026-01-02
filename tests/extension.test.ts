import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
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
} from '../src/commands/extension.js';

// Mock readline
const mockQuestion = vi.fn();
const mockClose = vi.fn();
vi.mock('node:readline', () => ({
  createInterface: vi.fn(() => ({
    question: mockQuestion,
    close: mockClose,
  })),
}));

describe('extension commands', () => {
  let tempDir: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tauri-bundle-ext-test-'));
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockQuestion.mockReset();
    mockClose.mockReset();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    consoleSpy.mockRestore();
  });

  function createProject() {
    const srcTauri = path.join(tempDir, 'src-tauri');
    fs.mkdirSync(srcTauri, { recursive: true });
    fs.writeFileSync(
      path.join(srcTauri, 'tauri.conf.json'),
      JSON.stringify({ productName: 'TestApp' })
    );

    const windowsDir = path.join(srcTauri, 'gen', 'windows');
    fs.mkdirSync(windowsDir, { recursive: true });
    fs.writeFileSync(
      path.join(windowsDir, 'bundle.config.json'),
      JSON.stringify({
        publisher: 'CN=Test',
        publisherDisplayName: 'Test',
        capabilities: ['internetClient'],
      })
    );

    return windowsDir;
  }

  describe('extensionList', () => {
    it('lists extensions when none configured', async () => {
      createProject();
      await extensionList({ path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith('\nConfigured extensions:\n');
      expect(consoleSpy).toHaveBeenCalledWith('  Share Target: disabled');
    });

    it('lists configured extensions', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: {
            shareTarget: true,
            fileAssociations: [{ name: 'myfiles', extensions: ['.myf'] }],
            protocolHandlers: [{ name: 'myapp', displayName: 'My App' }],
          },
        })
      );

      await extensionList({ path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith('  Share Target: enabled');
      expect(consoleSpy).toHaveBeenCalledWith('    - myfiles: .myf');
      expect(consoleSpy).toHaveBeenCalledWith('    - myapp:// (My App)');
    });

    it('lists all extension types', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: {
            startupTask: { enabled: true },
            contextMenus: [{ name: 'open-with', fileTypes: ['*', '.txt'] }],
            backgroundTasks: [{ name: 'sync', type: 'timer' }],
          },
        })
      );

      await extensionList({ path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith('\n  Startup Task: enabled');
      expect(consoleSpy).toHaveBeenCalledWith('    - open-with: *, .txt');
      expect(consoleSpy).toHaveBeenCalledWith('    - sync (timer)');
    });
  });

  describe('extensionEnableShareTarget', () => {
    it('enables share target', async () => {
      const windowsDir = createProject();
      await extensionEnableShareTarget({ path: tempDir });

      const config = JSON.parse(
        fs.readFileSync(path.join(windowsDir, 'bundle.config.json'), 'utf-8')
      );
      expect(config.extensions.shareTarget).toBe(true);
    });
  });

  describe('extensionDisableShareTarget', () => {
    it('disables share target', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: { shareTarget: true },
        })
      );

      await extensionDisableShareTarget({ path: tempDir });

      const config = JSON.parse(
        fs.readFileSync(path.join(windowsDir, 'bundle.config.json'), 'utf-8')
      );
      expect(config.extensions.shareTarget).toBe(false);
    });
  });

  describe('extensionEnableStartupTask', () => {
    it('enables startup task', async () => {
      const windowsDir = createProject();
      await extensionEnableStartupTask({ path: tempDir });

      const config = JSON.parse(
        fs.readFileSync(path.join(windowsDir, 'bundle.config.json'), 'utf-8')
      );
      expect(config.extensions.startupTask.enabled).toBe(true);
    });
  });

  describe('extensionDisableStartupTask', () => {
    it('disables startup task', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: { startupTask: { enabled: true } },
        })
      );

      await extensionDisableStartupTask({ path: tempDir });

      const config = JSON.parse(
        fs.readFileSync(path.join(windowsDir, 'bundle.config.json'), 'utf-8')
      );
      expect(config.extensions.startupTask.enabled).toBe(false);
    });
  });

  describe('extensionAddFileAssociation', () => {
    it('adds file association', async () => {
      const windowsDir = createProject();

      // Mock user input
      mockQuestion
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb('myfiles'))
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb('.myf,.myx'))
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb('My Files'));

      await extensionAddFileAssociation({ path: tempDir });

      const config = JSON.parse(
        fs.readFileSync(path.join(windowsDir, 'bundle.config.json'), 'utf-8')
      );
      expect(config.extensions.fileAssociations).toHaveLength(1);
      expect(config.extensions.fileAssociations[0].name).toBe('myfiles');
      expect(config.extensions.fileAssociations[0].extensions).toEqual(['.myf', '.myx']);
      expect(config.extensions.fileAssociations[0].description).toBe('My Files');
    });

    it('cancels when name is empty', async () => {
      createProject();

      mockQuestion.mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb(''));

      await extensionAddFileAssociation({ path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith('Cancelled.');
    });

    it('updates existing file association', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: {
            fileAssociations: [{ name: 'myfiles', extensions: ['.old'] }],
          },
        })
      );

      mockQuestion
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb('myfiles'))
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb('.new'))
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb(''));

      await extensionAddFileAssociation({ path: tempDir });

      const config = JSON.parse(
        fs.readFileSync(path.join(windowsDir, 'bundle.config.json'), 'utf-8')
      );
      expect(config.extensions.fileAssociations).toHaveLength(1);
      expect(config.extensions.fileAssociations[0].extensions).toEqual(['.new']);
    });
  });

  describe('extensionAddProtocol', () => {
    it('adds protocol handler', async () => {
      const windowsDir = createProject();

      mockQuestion
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb('myapp'))
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) =>
          cb('My Application')
        );

      await extensionAddProtocol({ path: tempDir });

      const config = JSON.parse(
        fs.readFileSync(path.join(windowsDir, 'bundle.config.json'), 'utf-8')
      );
      expect(config.extensions.protocolHandlers).toHaveLength(1);
      expect(config.extensions.protocolHandlers[0].name).toBe('myapp');
      expect(config.extensions.protocolHandlers[0].displayName).toBe('My Application');
    });

    it('cancels when name is empty', async () => {
      createProject();

      mockQuestion.mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb(''));

      await extensionAddProtocol({ path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith('Cancelled.');
    });
  });

  describe('extensionAddContextMenu', () => {
    it('adds context menu', async () => {
      const windowsDir = createProject();

      mockQuestion
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb('open-with'))
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb('*, .txt'))
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) =>
          cb('Open with MyApp')
        );

      await extensionAddContextMenu({ path: tempDir });

      const config = JSON.parse(
        fs.readFileSync(path.join(windowsDir, 'bundle.config.json'), 'utf-8')
      );
      expect(config.extensions.contextMenus).toHaveLength(1);
      expect(config.extensions.contextMenus[0].name).toBe('open-with');
      expect(config.extensions.contextMenus[0].fileTypes).toEqual(['*', '.txt']);
      expect(config.extensions.contextMenus[0].displayName).toBe('Open with MyApp');
    });

    it('cancels when name is empty', async () => {
      createProject();

      mockQuestion.mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb(''));

      await extensionAddContextMenu({ path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith('Cancelled.');
    });

    it('cancels when file types is empty', async () => {
      createProject();

      mockQuestion
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb('open-with'))
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb(''));

      await extensionAddContextMenu({ path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith('Cancelled.');
    });

    it('updates existing context menu', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: {
            contextMenus: [{ name: 'open-with', fileTypes: ['.old'] }],
          },
        })
      );

      mockQuestion
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb('open-with'))
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb('.new'))
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb(''));

      await extensionAddContextMenu({ path: tempDir });

      const config = JSON.parse(
        fs.readFileSync(path.join(windowsDir, 'bundle.config.json'), 'utf-8')
      );
      expect(config.extensions.contextMenus).toHaveLength(1);
      expect(config.extensions.contextMenus[0].fileTypes).toEqual(['.new']);
    });
  });

  describe('extensionAddBackgroundTask', () => {
    it('adds background task with timer type', async () => {
      const windowsDir = createProject();

      mockQuestion
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb('sync-task'))
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb('1'));

      await extensionAddBackgroundTask({ path: tempDir });

      const config = JSON.parse(
        fs.readFileSync(path.join(windowsDir, 'bundle.config.json'), 'utf-8')
      );
      expect(config.extensions.backgroundTasks).toHaveLength(1);
      expect(config.extensions.backgroundTasks[0].name).toBe('sync-task');
      expect(config.extensions.backgroundTasks[0].type).toBe('timer');
    });

    it('adds background task with systemEvent type', async () => {
      const windowsDir = createProject();

      mockQuestion
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb('event-task'))
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb('2'));

      await extensionAddBackgroundTask({ path: tempDir });

      const config = JSON.parse(
        fs.readFileSync(path.join(windowsDir, 'bundle.config.json'), 'utf-8')
      );
      expect(config.extensions.backgroundTasks[0].type).toBe('systemEvent');
    });

    it('adds background task with pushNotification type', async () => {
      const windowsDir = createProject();

      mockQuestion
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb('push-task'))
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb('3'));

      await extensionAddBackgroundTask({ path: tempDir });

      const config = JSON.parse(
        fs.readFileSync(path.join(windowsDir, 'bundle.config.json'), 'utf-8')
      );
      expect(config.extensions.backgroundTasks[0].type).toBe('pushNotification');
    });

    it('cancels when name is empty', async () => {
      createProject();

      mockQuestion.mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb(''));

      await extensionAddBackgroundTask({ path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith('Cancelled.');
    });

    it('cancels when invalid task type', async () => {
      createProject();

      mockQuestion
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb('task'))
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb('invalid'));

      await extensionAddBackgroundTask({ path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith('Invalid task type. Cancelled.');
    });

    it('updates existing background task', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: {
            backgroundTasks: [{ name: 'sync-task', type: 'timer' }],
          },
        })
      );

      mockQuestion
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb('sync-task'))
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb('2'));

      await extensionAddBackgroundTask({ path: tempDir });

      const config = JSON.parse(
        fs.readFileSync(path.join(windowsDir, 'bundle.config.json'), 'utf-8')
      );
      expect(config.extensions.backgroundTasks).toHaveLength(1);
      expect(config.extensions.backgroundTasks[0].type).toBe('systemEvent');
    });
  });

  describe('extensionRemove', () => {
    it('removes file association', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: {
            fileAssociations: [{ name: 'myfiles', extensions: ['.myf'] }],
          },
        })
      );

      await extensionRemove('file-association', 'myfiles', { path: tempDir });

      const config = JSON.parse(
        fs.readFileSync(path.join(windowsDir, 'bundle.config.json'), 'utf-8')
      );
      expect(config.extensions.fileAssociations).toHaveLength(0);
    });

    it('removes protocol handler', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: {
            protocolHandlers: [{ name: 'myapp' }],
          },
        })
      );

      await extensionRemove('protocol', 'myapp', { path: tempDir });

      const config = JSON.parse(
        fs.readFileSync(path.join(windowsDir, 'bundle.config.json'), 'utf-8')
      );
      expect(config.extensions.protocolHandlers).toHaveLength(0);
    });

    it('handles not found file association', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: { fileAssociations: [] },
        })
      );

      await extensionRemove('file-association', 'notfound', { path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith("\nFile association 'notfound' not found.");
    });

    it('handles unknown extension type', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: { shareTarget: true },
        })
      );

      await extensionRemove('unknown', 'test', { path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith('\nUnknown extension type: unknown');
    });

    it('handles no extensions configured', async () => {
      createProject();

      await extensionRemove('file-association', 'test', { path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith('\nNo extensions configured.');
    });

    it('removes context menu', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: {
            contextMenus: [{ name: 'open-with', fileTypes: ['*'] }],
          },
        })
      );

      await extensionRemove('context-menu', 'open-with', { path: tempDir });

      const config = JSON.parse(
        fs.readFileSync(path.join(windowsDir, 'bundle.config.json'), 'utf-8')
      );
      expect(config.extensions.contextMenus).toHaveLength(0);
    });

    it('handles not found context menu', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: { contextMenus: [] },
        })
      );

      await extensionRemove('context-menu', 'notfound', { path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith("\nContext menu 'notfound' not found.");
    });

    it('handles no context menus configured', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: { shareTarget: true },
        })
      );

      await extensionRemove('context-menu', 'test', { path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith('\nNo context menus configured.');
    });

    it('removes background task', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: {
            backgroundTasks: [{ name: 'sync', type: 'timer' }],
          },
        })
      );

      await extensionRemove('background-task', 'sync', { path: tempDir });

      const config = JSON.parse(
        fs.readFileSync(path.join(windowsDir, 'bundle.config.json'), 'utf-8')
      );
      expect(config.extensions.backgroundTasks).toHaveLength(0);
    });

    it('handles not found background task', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: { backgroundTasks: [] },
        })
      );

      await extensionRemove('background-task', 'notfound', { path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith("\nBackground task 'notfound' not found.");
    });

    it('handles no background tasks configured', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: { shareTarget: true },
        })
      );

      await extensionRemove('background-task', 'test', { path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith('\nNo background tasks configured.');
    });
  });

  describe('extensionAddAppExecutionAlias', () => {
    it('adds app execution alias', async () => {
      const windowsDir = createProject();

      mockQuestion.mockImplementationOnce((_msg: string, cb: (answer: string) => void) =>
        cb('myapp')
      );

      await extensionAddAppExecutionAlias({ path: tempDir });

      const config = JSON.parse(
        fs.readFileSync(path.join(windowsDir, 'bundle.config.json'), 'utf-8')
      );
      expect(config.extensions.appExecutionAliases).toHaveLength(1);
      expect(config.extensions.appExecutionAliases[0].alias).toBe('myapp');
    });

    it('cancels when alias is empty', async () => {
      createProject();

      mockQuestion.mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb(''));

      await extensionAddAppExecutionAlias({ path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith('Cancelled.');
    });

    it('handles duplicate alias', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: {
            appExecutionAliases: [{ alias: 'myapp' }],
          },
        })
      );

      mockQuestion.mockImplementationOnce((_msg: string, cb: (answer: string) => void) =>
        cb('myapp')
      );

      await extensionAddAppExecutionAlias({ path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith("\nAlias 'myapp' already exists.");
    });
  });

  describe('extensionAddAppService', () => {
    it('adds app service', async () => {
      const windowsDir = createProject();

      mockQuestion.mockImplementationOnce((_msg: string, cb: (answer: string) => void) =>
        cb('com.myapp.service')
      );

      await extensionAddAppService({ path: tempDir });

      const config = JSON.parse(
        fs.readFileSync(path.join(windowsDir, 'bundle.config.json'), 'utf-8')
      );
      expect(config.extensions.appServices).toHaveLength(1);
      expect(config.extensions.appServices[0].name).toBe('com.myapp.service');
    });

    it('cancels when name is empty', async () => {
      createProject();

      mockQuestion.mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb(''));

      await extensionAddAppService({ path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith('Cancelled.');
    });

    it('handles duplicate service', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: {
            appServices: [{ name: 'com.myapp.service' }],
          },
        })
      );

      mockQuestion.mockImplementationOnce((_msg: string, cb: (answer: string) => void) =>
        cb('com.myapp.service')
      );

      await extensionAddAppService({ path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith("\nApp service 'com.myapp.service' already exists.");
    });
  });

  describe('extensionEnableToastActivation', () => {
    it('enables toast activation', async () => {
      const windowsDir = createProject();
      await extensionEnableToastActivation({ path: tempDir });

      const config = JSON.parse(
        fs.readFileSync(path.join(windowsDir, 'bundle.config.json'), 'utf-8')
      );
      expect(config.extensions.toastActivation).toEqual({ activationType: 'foreground' });
    });
  });

  describe('extensionDisableToastActivation', () => {
    it('disables toast activation', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: { toastActivation: { activationType: 'foreground' } },
        })
      );

      await extensionDisableToastActivation({ path: tempDir });

      const config = JSON.parse(
        fs.readFileSync(path.join(windowsDir, 'bundle.config.json'), 'utf-8')
      );
      expect(config.extensions.toastActivation).toBeUndefined();
    });

    it('handles no extensions configured', async () => {
      createProject();
      await extensionDisableToastActivation({ path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith('\nToast Activation disabled.');
    });
  });

  describe('extensionAddAutoplay', () => {
    it('adds autoplay content handler', async () => {
      const windowsDir = createProject();

      mockQuestion
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb('open'))
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) =>
          cb('Open with MyApp')
        )
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb('1'))
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) =>
          cb('PlayMusicFilesOnArrival')
        );

      await extensionAddAutoplay({ path: tempDir });

      const config = JSON.parse(
        fs.readFileSync(path.join(windowsDir, 'bundle.config.json'), 'utf-8')
      );
      expect(config.extensions.autoplayHandlers).toHaveLength(1);
      expect(config.extensions.autoplayHandlers[0].verb).toBe('open');
      expect(config.extensions.autoplayHandlers[0].contentEvent).toBe('PlayMusicFilesOnArrival');
    });

    it('adds autoplay device handler', async () => {
      const windowsDir = createProject();

      mockQuestion
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb('import'))
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb('Import Photos'))
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb('2'))
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) =>
          cb('WPD\\ImageSource')
        );

      await extensionAddAutoplay({ path: tempDir });

      const config = JSON.parse(
        fs.readFileSync(path.join(windowsDir, 'bundle.config.json'), 'utf-8')
      );
      expect(config.extensions.autoplayHandlers).toHaveLength(1);
      expect(config.extensions.autoplayHandlers[0].deviceEvent).toBe('WPD\\ImageSource');
    });

    it('cancels when verb is empty', async () => {
      createProject();

      mockQuestion.mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb(''));

      await extensionAddAutoplay({ path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith('Cancelled.');
    });

    it('cancels when action display name is empty', async () => {
      createProject();

      mockQuestion
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb('open'))
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb(''));

      await extensionAddAutoplay({ path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith('Cancelled.');
    });

    it('cancels when content event is empty', async () => {
      createProject();

      mockQuestion
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb('open'))
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) =>
          cb('Open with MyApp')
        )
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb('1'))
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb(''));

      await extensionAddAutoplay({ path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith('Cancelled.');
    });

    it('cancels when device event is empty', async () => {
      createProject();

      mockQuestion
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb('open'))
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) =>
          cb('Open with MyApp')
        )
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb('2'))
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb(''));

      await extensionAddAutoplay({ path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith('Cancelled.');
    });

    it('cancels on invalid event type', async () => {
      createProject();

      mockQuestion
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb('open'))
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) =>
          cb('Open with MyApp')
        )
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb('3'));

      await extensionAddAutoplay({ path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith('Invalid event type. Cancelled.');
    });
  });

  describe('extensionEnablePrintTaskSettings', () => {
    it('enables print task settings', async () => {
      const windowsDir = createProject();
      await extensionEnablePrintTaskSettings({ path: tempDir });

      const config = JSON.parse(
        fs.readFileSync(path.join(windowsDir, 'bundle.config.json'), 'utf-8')
      );
      expect(config.extensions.printTaskSettings).toEqual({ displayName: 'Print Settings' });
    });
  });

  describe('extensionDisablePrintTaskSettings', () => {
    it('disables print task settings', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: { printTaskSettings: { displayName: 'Print Settings' } },
        })
      );

      await extensionDisablePrintTaskSettings({ path: tempDir });

      const config = JSON.parse(
        fs.readFileSync(path.join(windowsDir, 'bundle.config.json'), 'utf-8')
      );
      expect(config.extensions.printTaskSettings).toBeUndefined();
    });

    it('handles no extensions configured', async () => {
      createProject();
      await extensionDisablePrintTaskSettings({ path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith('\nPrint Task Settings disabled.');
    });
  });

  describe('extensionAddThumbnailHandler', () => {
    it('adds thumbnail handler', async () => {
      const windowsDir = createProject();

      mockQuestion
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) =>
          cb('{12345678-1234-1234-1234-123456789012}')
        )
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb('.myf,.myx'));

      await extensionAddThumbnailHandler({ path: tempDir });

      const config = JSON.parse(
        fs.readFileSync(path.join(windowsDir, 'bundle.config.json'), 'utf-8')
      );
      expect(config.extensions.thumbnailHandlers).toHaveLength(1);
      expect(config.extensions.thumbnailHandlers[0].clsid).toBe(
        '{12345678-1234-1234-1234-123456789012}'
      );
      expect(config.extensions.thumbnailHandlers[0].fileTypes).toEqual(['.myf', '.myx']);
    });

    it('cancels when clsid is empty', async () => {
      createProject();

      mockQuestion.mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb(''));

      await extensionAddThumbnailHandler({ path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith('Cancelled.');
    });

    it('cancels when file types is empty', async () => {
      createProject();

      mockQuestion
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) =>
          cb('{12345678-1234-1234-1234-123456789012}')
        )
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb(''));

      await extensionAddThumbnailHandler({ path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith('Cancelled.');
    });
  });

  describe('extensionAddPreviewHandler', () => {
    it('adds preview handler', async () => {
      const windowsDir = createProject();

      mockQuestion
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) =>
          cb('{ABCDEF12-1234-1234-1234-123456789012}')
        )
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb('.doc,.docx'));

      await extensionAddPreviewHandler({ path: tempDir });

      const config = JSON.parse(
        fs.readFileSync(path.join(windowsDir, 'bundle.config.json'), 'utf-8')
      );
      expect(config.extensions.previewHandlers).toHaveLength(1);
      expect(config.extensions.previewHandlers[0].clsid).toBe(
        '{ABCDEF12-1234-1234-1234-123456789012}'
      );
      expect(config.extensions.previewHandlers[0].fileTypes).toEqual(['.doc', '.docx']);
    });

    it('cancels when clsid is empty', async () => {
      createProject();

      mockQuestion.mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb(''));

      await extensionAddPreviewHandler({ path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith('Cancelled.');
    });

    it('cancels when file types is empty', async () => {
      createProject();

      mockQuestion
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) =>
          cb('{ABCDEF12-1234-1234-1234-123456789012}')
        )
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb(''));

      await extensionAddPreviewHandler({ path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith('Cancelled.');
    });
  });

  describe('extensionRemove - new extension types', () => {
    it('removes app execution alias', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: {
            appExecutionAliases: [{ alias: 'myapp' }],
          },
        })
      );

      await extensionRemove('app-execution-alias', 'myapp', { path: tempDir });

      const config = JSON.parse(
        fs.readFileSync(path.join(windowsDir, 'bundle.config.json'), 'utf-8')
      );
      expect(config.extensions.appExecutionAliases).toHaveLength(0);
    });

    it('handles not found app execution alias', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: { appExecutionAliases: [] },
        })
      );

      await extensionRemove('app-execution-alias', 'notfound', { path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith("\nApp execution alias 'notfound' not found.");
    });

    it('handles no app execution aliases configured', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: { shareTarget: true },
        })
      );

      await extensionRemove('app-execution-alias', 'test', { path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith('\nNo app execution aliases configured.');
    });

    it('removes app service', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: {
            appServices: [{ name: 'com.myapp.service' }],
          },
        })
      );

      await extensionRemove('app-service', 'com.myapp.service', { path: tempDir });

      const config = JSON.parse(
        fs.readFileSync(path.join(windowsDir, 'bundle.config.json'), 'utf-8')
      );
      expect(config.extensions.appServices).toHaveLength(0);
    });

    it('handles not found app service', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: { appServices: [] },
        })
      );

      await extensionRemove('app-service', 'notfound', { path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith("\nApp service 'notfound' not found.");
    });

    it('handles no app services configured', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: { shareTarget: true },
        })
      );

      await extensionRemove('app-service', 'test', { path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith('\nNo app services configured.');
    });

    it('removes autoplay handler', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: {
            autoplayHandlers: [{ verb: 'open', actionDisplayName: 'Open' }],
          },
        })
      );

      await extensionRemove('autoplay', 'open', { path: tempDir });

      const config = JSON.parse(
        fs.readFileSync(path.join(windowsDir, 'bundle.config.json'), 'utf-8')
      );
      expect(config.extensions.autoplayHandlers).toHaveLength(0);
    });

    it('handles not found autoplay handler', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: { autoplayHandlers: [] },
        })
      );

      await extensionRemove('autoplay', 'notfound', { path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith("\nAutoplay handler 'notfound' not found.");
    });

    it('handles no autoplay handlers configured', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: { shareTarget: true },
        })
      );

      await extensionRemove('autoplay', 'test', { path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith('\nNo autoplay handlers configured.');
    });

    it('removes thumbnail handler', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: {
            thumbnailHandlers: [{ clsid: '{12345678}', fileTypes: ['.myf'] }],
          },
        })
      );

      await extensionRemove('thumbnail-handler', '{12345678}', { path: tempDir });

      const config = JSON.parse(
        fs.readFileSync(path.join(windowsDir, 'bundle.config.json'), 'utf-8')
      );
      expect(config.extensions.thumbnailHandlers).toHaveLength(0);
    });

    it('handles not found thumbnail handler', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: { thumbnailHandlers: [] },
        })
      );

      await extensionRemove('thumbnail-handler', 'notfound', { path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith("\nThumbnail handler 'notfound' not found.");
    });

    it('handles no thumbnail handlers configured', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: { shareTarget: true },
        })
      );

      await extensionRemove('thumbnail-handler', 'test', { path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith('\nNo thumbnail handlers configured.');
    });

    it('removes preview handler', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: {
            previewHandlers: [{ clsid: '{ABCDEF12}', fileTypes: ['.doc'] }],
          },
        })
      );

      await extensionRemove('preview-handler', '{ABCDEF12}', { path: tempDir });

      const config = JSON.parse(
        fs.readFileSync(path.join(windowsDir, 'bundle.config.json'), 'utf-8')
      );
      expect(config.extensions.previewHandlers).toHaveLength(0);
    });

    it('handles not found preview handler', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: { previewHandlers: [] },
        })
      );

      await extensionRemove('preview-handler', 'notfound', { path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith("\nPreview handler 'notfound' not found.");
    });

    it('handles no preview handlers configured', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: { shareTarget: true },
        })
      );

      await extensionRemove('preview-handler', 'test', { path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith('\nNo preview handlers configured.');
    });
  });

  describe('extensionList - new extension types', () => {
    it('lists app execution aliases', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: {
            appExecutionAliases: [{ alias: 'myapp' }],
          },
        })
      );

      await extensionList({ path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith('\n  App Execution Aliases:');
      expect(consoleSpy).toHaveBeenCalledWith('    - myapp');
    });

    it('lists app services', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: {
            appServices: [{ name: 'com.myapp.service' }],
          },
        })
      );

      await extensionList({ path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith('\n  App Services:');
      expect(consoleSpy).toHaveBeenCalledWith('    - com.myapp.service');
    });

    it('lists toast activation', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: {
            toastActivation: { activationType: 'foreground' },
          },
        })
      );

      await extensionList({ path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith('\n  Toast Activation: enabled');
    });

    it('lists autoplay handlers', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: {
            autoplayHandlers: [{ verb: 'open', actionDisplayName: 'Open with MyApp' }],
          },
        })
      );

      await extensionList({ path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith('\n  Autoplay Handlers:');
      expect(consoleSpy).toHaveBeenCalledWith('    - open: Open with MyApp');
    });

    it('lists print task settings', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: {
            printTaskSettings: { displayName: 'Print Settings' },
          },
        })
      );

      await extensionList({ path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith('\n  Print Task Settings: enabled');
    });

    it('lists thumbnail handlers', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: {
            thumbnailHandlers: [{ clsid: '{12345678}', fileTypes: ['.myf', '.myx'] }],
          },
        })
      );

      await extensionList({ path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith('\n  Thumbnail Handlers:');
      expect(consoleSpy).toHaveBeenCalledWith('    - .myf, .myx');
    });

    it('lists preview handlers', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: {
            previewHandlers: [{ clsid: '{ABCDEF12}', fileTypes: ['.doc', '.docx'] }],
          },
        })
      );

      await extensionList({ path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith('\n  Preview Handlers:');
      expect(consoleSpy).toHaveBeenCalledWith('    - .doc, .docx');
    });
  });

  describe('extensionAddFileAssociation - edge cases', () => {
    it('cancels when extensions is empty', async () => {
      createProject();

      mockQuestion
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb('myfiles'))
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb(''));

      await extensionAddFileAssociation({ path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith('Cancelled.');
    });

    it('adds dot prefix to extensions without it', async () => {
      const windowsDir = createProject();

      mockQuestion
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb('myfiles'))
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb('myf,myx'))
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb(''));

      await extensionAddFileAssociation({ path: tempDir });

      const config = JSON.parse(
        fs.readFileSync(path.join(windowsDir, 'bundle.config.json'), 'utf-8')
      );
      expect(config.extensions.fileAssociations[0].extensions).toEqual(['.myf', '.myx']);
    });
  });

  describe('extensionAddProtocol - edge cases', () => {
    it('adds protocol without display name', async () => {
      const windowsDir = createProject();

      mockQuestion
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb('myapp'))
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb(''));

      await extensionAddProtocol({ path: tempDir });

      const config = JSON.parse(
        fs.readFileSync(path.join(windowsDir, 'bundle.config.json'), 'utf-8')
      );
      expect(config.extensions.protocolHandlers[0].displayName).toBeUndefined();
    });

    it('updates existing protocol handler', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: {
            protocolHandlers: [{ name: 'myapp', displayName: 'Old Name' }],
          },
        })
      );

      mockQuestion
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb('myapp'))
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb('New Name'));

      await extensionAddProtocol({ path: tempDir });

      const config = JSON.parse(
        fs.readFileSync(path.join(windowsDir, 'bundle.config.json'), 'utf-8')
      );
      expect(config.extensions.protocolHandlers).toHaveLength(1);
      expect(config.extensions.protocolHandlers[0].displayName).toBe('New Name');
    });
  });

  describe('extensionRemove - edge cases', () => {
    it('handles no file associations array', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: { shareTarget: true },
        })
      );

      await extensionRemove('file-association', 'test', { path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith('\nNo file associations configured.');
    });

    it('handles not found protocol handler', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: { protocolHandlers: [{ name: 'other' }] },
        })
      );

      await extensionRemove('protocol', 'notfound', { path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith("\nProtocol handler 'notfound' not found.");
    });

    it('handles no protocol handlers array', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: { shareTarget: true },
        })
      );

      await extensionRemove('protocol', 'test', { path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith('\nNo protocol handlers configured.');
    });
  });

  describe('extensionAddContextMenu - edge cases', () => {
    it('adds context menu without display name', async () => {
      const windowsDir = createProject();

      mockQuestion
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb('open-with'))
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb('*'))
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb(''));

      await extensionAddContextMenu({ path: tempDir });

      const config = JSON.parse(
        fs.readFileSync(path.join(windowsDir, 'bundle.config.json'), 'utf-8')
      );
      expect(config.extensions.contextMenus[0].displayName).toBeUndefined();
    });
  });

  describe('extensionAddBackgroundTask - edge cases', () => {
    it('accepts text task type names', async () => {
      const windowsDir = createProject();

      mockQuestion
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb('my-task'))
        .mockImplementationOnce((_msg: string, cb: (answer: string) => void) => cb('timer'));

      await extensionAddBackgroundTask({ path: tempDir });

      const config = JSON.parse(
        fs.readFileSync(path.join(windowsDir, 'bundle.config.json'), 'utf-8')
      );
      expect(config.extensions.backgroundTasks[0].type).toBe('timer');
    });
  });

  describe('extensionList - protocol without displayName', () => {
    it('uses protocol name when displayName is missing', async () => {
      const windowsDir = createProject();
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
          extensions: {
            protocolHandlers: [{ name: 'myapp' }],
          },
        })
      );

      await extensionList({ path: tempDir });

      expect(consoleSpy).toHaveBeenCalledWith('    - myapp:// (myapp)');
    });
  });

  describe('extensionDisableShareTarget - no extensions object', () => {
    it('creates extensions object if not present', async () => {
      const windowsDir = createProject();
      // Config without extensions object
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
        })
      );

      await extensionDisableShareTarget({ path: tempDir });

      const config = JSON.parse(
        fs.readFileSync(path.join(windowsDir, 'bundle.config.json'), 'utf-8')
      );
      expect(config.extensions.shareTarget).toBe(false);
    });
  });

  describe('extensionDisableStartupTask - no extensions object', () => {
    it('creates extensions object if not present', async () => {
      const windowsDir = createProject();
      // Config without extensions object
      fs.writeFileSync(
        path.join(windowsDir, 'bundle.config.json'),
        JSON.stringify({
          publisher: 'CN=Test',
          publisherDisplayName: 'Test',
        })
      );

      await extensionDisableStartupTask({ path: tempDir });

      const config = JSON.parse(
        fs.readFileSync(path.join(windowsDir, 'bundle.config.json'), 'utf-8')
      );
      expect(config.extensions.startupTask.enabled).toBe(false);
    });
  });

  describe('error handling', () => {
    it('throws error when bundle.config.json does not exist', async () => {
      const srcTauri = path.join(tempDir, 'src-tauri');
      fs.mkdirSync(srcTauri, { recursive: true });
      fs.writeFileSync(
        path.join(srcTauri, 'tauri.conf.json'),
        JSON.stringify({ productName: 'TestApp' })
      );

      // Create windows dir but NOT bundle.config.json
      const windowsDir = path.join(srcTauri, 'gen', 'windows');
      fs.mkdirSync(windowsDir, { recursive: true });

      await expect(extensionList({ path: tempDir })).rejects.toThrow(
        "bundle.config.json not found. Run 'tauri-windows-bundle init' first."
      );
    });
  });
});

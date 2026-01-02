import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type ExecCallback = (error: Error | null, result: { stdout: string; stderr: string }) => void;

// Mock child_process - use hoisted mock
vi.mock('node:child_process', () => {
  const mockExec = vi.fn();
  const mockSpawn = vi.fn();
  return {
    exec: mockExec,
    spawn: mockSpawn,
    __mockExec: mockExec,
    __mockSpawn: mockSpawn,
  };
});

// Mock readline - use hoisted mock
vi.mock('node:readline', () => {
  const mockQuestion = vi.fn();
  const mockClose = vi.fn();
  return {
    createInterface: vi.fn(() => ({
      question: mockQuestion,
      close: mockClose,
    })),
    __mockQuestion: mockQuestion,
    __mockClose: mockClose,
  };
});

// Import after mocks
import {
  execAsync,
  execWithProgress,
  isMsixbundleCliInstalled,
  getMsixbundleCliVersion,
  isVersionSufficient,
  MIN_MSIXBUNDLE_CLI_VERSION,
  promptInstall,
  Spinner,
} from '../src/utils/exec.js';
import * as childProcess from 'node:child_process';
import * as readline from 'node:readline';

// Get mock references
const mockExec = (childProcess as unknown as { __mockExec: ReturnType<typeof vi.fn> }).__mockExec;
const mockSpawn = (childProcess as unknown as { __mockSpawn: ReturnType<typeof vi.fn> })
  .__mockSpawn;
const mockQuestion = (readline as unknown as { __mockQuestion: ReturnType<typeof vi.fn> })
  .__mockQuestion;
const mockClose = (readline as unknown as { __mockClose: ReturnType<typeof vi.fn> }).__mockClose;

describe('execAsync', () => {
  beforeEach(() => {
    mockExec.mockReset();
  });

  it('executes command and returns stdout/stderr', async () => {
    mockExec.mockImplementation((_cmd: string, _opts: unknown, callback: ExecCallback) => {
      callback(null, { stdout: 'output', stderr: '' });
    });

    const result = await execAsync('echo test');
    expect(result.stdout).toBe('output');
    expect(result.stderr).toBe('');
  });

  it('passes options to exec', async () => {
    mockExec.mockImplementation(
      (_cmd: string, opts: { cwd?: string; encoding?: string }, callback: ExecCallback) => {
        expect(opts.cwd).toBe('/tmp');
        expect(opts.encoding).toBe('utf8');
        callback(null, { stdout: 'output', stderr: '' });
      }
    );

    await execAsync('echo test', { cwd: '/tmp' });
    expect(mockExec).toHaveBeenCalled();
  });

  it('rejects on error', async () => {
    mockExec.mockImplementation((_cmd: string, _opts: unknown, callback: ExecCallback) => {
      callback(new Error('Command failed'), { stdout: '', stderr: 'error' });
    });

    await expect(execAsync('fail')).rejects.toThrow('Command failed');
  });
});

describe('isMsixbundleCliInstalled', () => {
  beforeEach(() => {
    mockExec.mockReset();
  });

  it('returns true when msixbundle-cli is installed', async () => {
    mockExec.mockImplementation((_cmd: string, _opts: unknown, callback: ExecCallback) => {
      callback(null, { stdout: '1.0.0', stderr: '' });
    });

    const result = await isMsixbundleCliInstalled();
    expect(result).toBe(true);
  });

  it('returns false when msixbundle-cli is not installed', async () => {
    mockExec.mockImplementation((_cmd: string, _opts: unknown, callback: ExecCallback) => {
      callback(new Error('command not found'), { stdout: '', stderr: '' });
    });

    const result = await isMsixbundleCliInstalled();
    expect(result).toBe(false);
  });
});

describe('promptInstall', () => {
  beforeEach(() => {
    mockQuestion.mockReset();
    mockClose.mockReset();
  });

  it('returns true when user answers y', async () => {
    mockQuestion.mockImplementation((_msg: string, callback: (answer: string) => void) => {
      callback('y');
    });

    const result = await promptInstall('Install?');
    expect(result).toBe(true);
    expect(mockClose).toHaveBeenCalled();
  });

  it('returns true when user answers Y', async () => {
    mockQuestion.mockImplementation((_msg: string, callback: (answer: string) => void) => {
      callback('Y');
    });

    const result = await promptInstall('Install?');
    expect(result).toBe(true);
  });

  it('returns false when user answers n', async () => {
    mockQuestion.mockImplementation((_msg: string, callback: (answer: string) => void) => {
      callback('n');
    });

    const result = await promptInstall('Install?');
    expect(result).toBe(false);
  });

  it('returns false when user answers anything else', async () => {
    mockQuestion.mockImplementation((_msg: string, callback: (answer: string) => void) => {
      callback('maybe');
    });

    const result = await promptInstall('Install?');
    expect(result).toBe(false);
  });

  it('returns false on empty answer', async () => {
    mockQuestion.mockImplementation((_msg: string, callback: (answer: string) => void) => {
      callback('');
    });

    const result = await promptInstall('Install?');
    expect(result).toBe(false);
  });

  it('includes message in question', async () => {
    mockQuestion.mockImplementation((msg: string, callback: (answer: string) => void) => {
      expect(msg).toBe('Custom message [y/N] ');
      callback('n');
    });

    await promptInstall('Custom message');
    expect(mockQuestion).toHaveBeenCalled();
  });
});

describe('getMsixbundleCliVersion', () => {
  beforeEach(() => {
    mockExec.mockReset();
  });

  it('returns version from "msixbundle-cli X.X.X" format', async () => {
    mockExec.mockImplementation((_cmd: string, _opts: unknown, callback: ExecCallback) => {
      callback(null, { stdout: 'msixbundle-cli 1.2.3', stderr: '' });
    });

    const result = await getMsixbundleCliVersion();
    expect(result).toBe('1.2.3');
  });

  it('returns version from plain "X.X.X" format', async () => {
    mockExec.mockImplementation((_cmd: string, _opts: unknown, callback: ExecCallback) => {
      callback(null, { stdout: '2.0.0', stderr: '' });
    });

    const result = await getMsixbundleCliVersion();
    expect(result).toBe('2.0.0');
  });

  it('returns version with whitespace trimmed', async () => {
    mockExec.mockImplementation((_cmd: string, _opts: unknown, callback: ExecCallback) => {
      callback(null, { stdout: '  1.0.0\n', stderr: '' });
    });

    const result = await getMsixbundleCliVersion();
    expect(result).toBe('1.0.0');
  });

  it('returns null when version cannot be parsed', async () => {
    mockExec.mockImplementation((_cmd: string, _opts: unknown, callback: ExecCallback) => {
      callback(null, { stdout: 'unknown version', stderr: '' });
    });

    const result = await getMsixbundleCliVersion();
    expect(result).toBeNull();
  });

  it('returns null when command fails', async () => {
    mockExec.mockImplementation((_cmd: string, _opts: unknown, callback: ExecCallback) => {
      callback(new Error('command not found'), { stdout: '', stderr: '' });
    });

    const result = await getMsixbundleCliVersion();
    expect(result).toBeNull();
  });
});

describe('isVersionSufficient', () => {
  it('returns true when major is greater', () => {
    expect(isVersionSufficient('2.0.0', '1.0.0')).toBe(true);
    expect(isVersionSufficient('3.0.0', '1.5.0')).toBe(true);
  });

  it('returns false when major is less', () => {
    expect(isVersionSufficient('0.9.0', '1.0.0')).toBe(false);
    expect(isVersionSufficient('1.0.0', '2.0.0')).toBe(false);
  });

  it('returns true when minor is greater (same major)', () => {
    expect(isVersionSufficient('1.2.0', '1.1.0')).toBe(true);
    expect(isVersionSufficient('1.5.0', '1.0.0')).toBe(true);
  });

  it('returns false when minor is less (same major)', () => {
    expect(isVersionSufficient('1.0.0', '1.1.0')).toBe(false);
    expect(isVersionSufficient('1.4.0', '1.5.0')).toBe(false);
  });

  it('returns true when patch is greater or equal (same major.minor)', () => {
    expect(isVersionSufficient('1.0.1', '1.0.0')).toBe(true);
    expect(isVersionSufficient('1.0.5', '1.0.3')).toBe(true);
    expect(isVersionSufficient('1.0.0', '1.0.0')).toBe(true);
  });

  it('returns false when patch is less (same major.minor)', () => {
    expect(isVersionSufficient('1.0.0', '1.0.1')).toBe(false);
    expect(isVersionSufficient('1.0.2', '1.0.5')).toBe(false);
  });

  it('works with MIN_MSIXBUNDLE_CLI_VERSION constant', () => {
    expect(MIN_MSIXBUNDLE_CLI_VERSION).toBe('1.0.0');
    expect(isVersionSufficient('1.0.0', MIN_MSIXBUNDLE_CLI_VERSION)).toBe(true);
    expect(isVersionSufficient('0.9.9', MIN_MSIXBUNDLE_CLI_VERSION)).toBe(false);
    expect(isVersionSufficient('1.1.0', MIN_MSIXBUNDLE_CLI_VERSION)).toBe(true);
  });
});

describe('execWithProgress', () => {
  beforeEach(() => {
    mockSpawn.mockReset();
  });

  function createMockChildProcess(exitCode: number = 0, emitError: Error | null = null) {
    const stdout = {
      on: vi.fn((event: string, callback: (data: Buffer) => void) => {
        if (event === 'data') {
          callback(Buffer.from('stdout output'));
        }
      }),
    };
    const stderr = {
      on: vi.fn((event: string, callback: (data: Buffer) => void) => {
        if (event === 'data') {
          callback(Buffer.from('stderr output'));
        }
      }),
    };
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};

    const child = {
      stdout,
      stderr,
      on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
        if (!listeners[event]) {
          listeners[event] = [];
        }
        listeners[event].push(callback);

        // Simulate async close/error events
        setTimeout(() => {
          if (event === 'close' && !emitError) {
            callback(exitCode);
          } else if (event === 'error' && emitError) {
            callback(emitError);
          }
        }, 0);
      }),
    };

    return child;
  }

  it('resolves when command succeeds', async () => {
    const mockChild = createMockChildProcess(0);
    mockSpawn.mockReturnValue(mockChild);

    await expect(execWithProgress('echo test')).resolves.toBeUndefined();
    expect(mockSpawn).toHaveBeenCalledWith('echo', ['test'], expect.any(Object));
  });

  it('rejects when command fails with non-zero exit code', async () => {
    const mockChild = createMockChildProcess(1);
    mockSpawn.mockReturnValue(mockChild);

    await expect(execWithProgress('fail command')).rejects.toThrow(
      'Command failed with exit code 1'
    );
  });

  it('rejects on spawn error', async () => {
    const mockChild = createMockChildProcess(0, new Error('spawn failed'));
    mockSpawn.mockReturnValue(mockChild);

    await expect(execWithProgress('fail command')).rejects.toThrow('spawn failed');
  });

  it('passes cwd option to spawn', async () => {
    const mockChild = createMockChildProcess(0);
    mockSpawn.mockReturnValue(mockChild);

    await execWithProgress('echo test', { cwd: '/tmp' });

    expect(mockSpawn).toHaveBeenCalledWith('echo', ['test'], {
      cwd: '/tmp',
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: true,
    });
  });

  it('writes stdout to process.stdout in verbose mode', async () => {
    const mockChild = createMockChildProcess(0);
    mockSpawn.mockReturnValue(mockChild);
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await execWithProgress('echo test', { verbose: true });

    expect(writeSpy).toHaveBeenCalledWith(Buffer.from('stdout output'));
    writeSpy.mockRestore();
  });

  it('writes stderr to process.stderr in verbose mode', async () => {
    const mockChild = createMockChildProcess(0);
    mockSpawn.mockReturnValue(mockChild);
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await execWithProgress('echo test', { verbose: true });

    expect(writeSpy).toHaveBeenCalledWith(Buffer.from('stderr output'));
    writeSpy.mockRestore();
  });

  it('shows spinner instead of output when not verbose', async () => {
    const mockChild = createMockChildProcess(0);
    mockSpawn.mockReturnValue(mockChild);
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await execWithProgress('echo test', { message: 'Testing...' });

    // Spinner writes to stdout with carriage return
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('Testing...'));
    writeSpy.mockRestore();
  });

  it('shows captured output on error when not verbose', async () => {
    const mockChild = createMockChildProcess(1);
    mockSpawn.mockReturnValue(mockChild);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await expect(execWithProgress('fail command', { message: 'Failing...' })).rejects.toThrow(
      'Command failed with exit code 1'
    );

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Build output:'));
    errorSpy.mockRestore();
  });
});

describe('Spinner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts and stops with success symbol', () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const spinner = new Spinner('Loading...');
    spinner.start();

    // Let it run one frame
    vi.advanceTimersByTime(80);

    spinner.stop(true);

    // Should have written spinner frame and success message
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('Loading...'));
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('✓'));

    writeSpy.mockRestore();
  });

  it('stops with failure symbol when fail() is called', () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const spinner = new Spinner('Processing...');
    spinner.start();
    spinner.fail();

    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('✗'));

    writeSpy.mockRestore();
  });

  it('clears interval on stop', () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const clearSpy = vi.spyOn(global, 'clearInterval');

    const spinner = new Spinner('Test');
    spinner.start();
    spinner.stop();

    expect(clearSpy).toHaveBeenCalled();

    clearSpy.mockRestore();
  });
});

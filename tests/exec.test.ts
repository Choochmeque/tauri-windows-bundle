import { describe, it, expect, vi, beforeEach } from 'vitest';

type ExecCallback = (error: Error | null, result: { stdout: string; stderr: string }) => void;

// Mock child_process - use hoisted mock
vi.mock('node:child_process', () => {
  const mockExec = vi.fn();
  return {
    exec: mockExec,
    __mockExec: mockExec,
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
import { execAsync, isMsixbundleCliInstalled, promptInstall } from '../src/utils/exec.js';
import * as childProcess from 'node:child_process';
import * as readline from 'node:readline';

// Get mock references
const mockExec = (childProcess as unknown as { __mockExec: ReturnType<typeof vi.fn> }).__mockExec;
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

import { describe, it, expect } from 'vitest';
import { mergeFileAssociations } from '../src/core/file-associations.js';

describe('mergeFileAssociations', () => {
  it('maps tauri.conf.json entries to the MSIX shape and adds leading dots', () => {
    const result = mergeFileAssociations(
      [{ ext: ['ics'], name: 'iCalendar', description: 'iCalendar event file' }],
      undefined
    );

    expect(result).toEqual([
      { name: 'iCalendar', extensions: ['.ics'], description: 'iCalendar event file' },
    ]);
  });

  it('preserves extensions that already have a leading dot', () => {
    const result = mergeFileAssociations([{ ext: ['.ics', 'ical'] }], undefined);

    expect(result[0].extensions).toEqual(['.ics', '.ical']);
  });

  it('falls back to the first extension when no name is given', () => {
    const result = mergeFileAssociations([{ ext: ['ics'] }], undefined);

    expect(result[0].name).toBe('.ics');
  });

  it('skips tauri entries with no extensions', () => {
    const result = mergeFileAssociations([{ ext: [], name: 'empty' }], undefined);

    expect(result).toEqual([]);
  });

  it('keeps bundle.config.json associations working', () => {
    const result = mergeFileAssociations(undefined, [
      { name: 'myfiles', extensions: ['.myf'], description: 'My Files' },
    ]);

    expect(result).toEqual([{ name: 'myfiles', extensions: ['.myf'], description: 'My Files' }]);
  });

  it('lets bundle.config.json win on a name collision', () => {
    const result = mergeFileAssociations(
      [{ ext: ['ics'], name: 'iCalendar', description: 'from tauri.conf.json' }],
      [{ name: 'iCalendar', extensions: ['.ics', '.ical'], description: 'from bundle.config.json' }]
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: 'iCalendar',
      extensions: ['.ics', '.ical'],
      description: 'from bundle.config.json',
    });
  });

  it('unions distinct associations from both sources', () => {
    const result = mergeFileAssociations(
      [{ ext: ['ics'], name: 'iCalendar' }],
      [{ name: 'myfiles', extensions: ['.myf'] }]
    );

    expect(result).toHaveLength(2);
    expect(result.map((a) => a.name)).toEqual(['iCalendar', 'myfiles']);
  });

  it('returns an empty array when both sources are empty', () => {
    expect(mergeFileAssociations(undefined, undefined)).toEqual([]);
  });
});

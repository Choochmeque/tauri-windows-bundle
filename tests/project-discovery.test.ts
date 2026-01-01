import { describe, it, expect } from 'vitest';
import { toFourPartVersion } from '../src/core/project-discovery.js';

describe('toFourPartVersion', () => {
  it('converts 3-part version to 4-part', () => {
    expect(toFourPartVersion('1.2.3')).toBe('1.2.3.0');
  });

  it('converts 2-part version to 4-part', () => {
    expect(toFourPartVersion('1.2')).toBe('1.2.0.0');
  });

  it('converts 1-part version to 4-part', () => {
    expect(toFourPartVersion('1')).toBe('1.0.0.0');
  });

  it('keeps 4-part version as is', () => {
    expect(toFourPartVersion('1.2.3.4')).toBe('1.2.3.4');
  });

  it('truncates versions with more than 4 parts', () => {
    expect(toFourPartVersion('1.2.3.4.5')).toBe('1.2.3.4');
  });
});

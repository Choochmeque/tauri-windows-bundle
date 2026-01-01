import { describe, it, expect } from 'vitest';
import { replaceTemplateVariables } from '../src/utils/template.js';

describe('replaceTemplateVariables', () => {
  it('replaces single variable', () => {
    const result = replaceTemplateVariables('Hello {{NAME}}!', { NAME: 'World' });
    expect(result).toBe('Hello World!');
  });

  it('replaces multiple variables', () => {
    const result = replaceTemplateVariables('{{GREETING}} {{NAME}}!', {
      GREETING: 'Hello',
      NAME: 'World',
    });
    expect(result).toBe('Hello World!');
  });

  it('replaces same variable multiple times', () => {
    const result = replaceTemplateVariables('{{X}} + {{X}} = {{X}}{{X}}', { X: '1' });
    expect(result).toBe('1 + 1 = 11');
  });

  it('leaves unknown variables unchanged', () => {
    const result = replaceTemplateVariables('{{KNOWN}} {{UNKNOWN}}', { KNOWN: 'value' });
    expect(result).toBe('value {{UNKNOWN}}');
  });

  it('handles empty variables object', () => {
    const result = replaceTemplateVariables('{{VAR}}', {});
    expect(result).toBe('{{VAR}}');
  });

  it('handles empty template', () => {
    const result = replaceTemplateVariables('', { VAR: 'value' });
    expect(result).toBe('');
  });
});

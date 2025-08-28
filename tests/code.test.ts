import { generateCode } from '../src/utils/code.js';

describe('code generator', () => {
  test('generates correct length and charset', () => {
    const code = generateCode(8);
    expect(code).toHaveLength(8);
    expect(/^[A-Za-z0-9]+$/.test(code)).toBe(true);
  });

  test('uses default length of 6', () => {
    const code = generateCode();
    expect(code).toHaveLength(6);
  });

  test('zero or negative length returns empty', () => {
    expect(generateCode(0)).toBe('');
    expect(generateCode(-1)).toBe('');
  });
});

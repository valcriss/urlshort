import { generateCode } from '../src/utils/code.js';

describe('code generator', () => {
  test('generates correct length and charset', () => {
    const code = generateCode(8);
    expect(code).toHaveLength(8);
    expect(/^[A-Za-z0-9]+$/.test(code)).toBe(true);
  });
});

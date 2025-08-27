import { isValidHttpUrl, parseOptionalDate, isCodeValid } from '../src/utils/validate';

describe('validate utils', () => {
  test('validates http/https urls', () => {
    expect(isValidHttpUrl('http://example.com')).toBe(true);
    expect(isValidHttpUrl('https://example.com/x?y=z')).toBe(true);
    expect(isValidHttpUrl('ftp://example.com')).toBe(false);
    expect(isValidHttpUrl('not-a-url')).toBe(false);
  });

  test('parseOptionalDate', () => {
    expect(parseOptionalDate(null)).toBeNull();
    expect(parseOptionalDate('')).toBeNull();
    const d = parseOptionalDate('2024-01-01T00:00:00Z');
    expect(d).toBeInstanceOf(Date);
  });

  test('isCodeValid', () => {
    expect(isCodeValid('Abc123')).toBe(true);
    expect(isCodeValid('bad!')).toBe(false);
    expect(isCodeValid('')).toBe(false);
  });
});


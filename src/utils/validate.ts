export function isValidHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function parseOptionalDate(input: unknown): Date | null {
  if (input === undefined || input === null || input === '') return null;
  const d = new Date(String(input));
  return isNaN(d.getTime()) ? null : d;
}

export function isCodeValid(code: string): boolean {
  return /^[A-Za-z0-9]{1,32}$/.test(code);
}


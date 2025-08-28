import { getPrisma } from '../src/db.js';
import { shortUrlService } from '../src/services/shortUrl.service.js';
import * as codeUtil from '../src/utils/code.js';

describe('ShortUrlService', () => {
  const prisma = getPrisma();
  const createSpy = jest.spyOn(prisma.shortUrl, 'create');
  const findUniqueSpy = jest.spyOn(prisma.shortUrl, 'findUnique');
  const findManySpy = jest.spyOn(prisma.shortUrl, 'findMany');
  const updateSpy = jest.spyOn(prisma.shortUrl, 'update');
  const deleteSpy = jest.spyOn(prisma.shortUrl, 'delete');
  const genSpy = jest.spyOn(codeUtil, 'generateCode');

  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('getByCode, listByUser, listByEmailAsAdmin delegate to prisma', async () => {
    findUniqueSpy.mockResolvedValue({ code: 'A' } as any);
    findManySpy.mockResolvedValue([{ code: 'A' } as any]);
    await expect(shortUrlService.getByCode('A')).resolves.toEqual({ code: 'A' });
    await expect(shortUrlService.listByUser('u')).resolves.toHaveLength(1);
    await expect(shortUrlService.listByEmailAsAdmin('u')).resolves.toHaveLength(1);
    expect(findUniqueSpy).toHaveBeenCalled();
    expect(findManySpy).toHaveBeenCalledTimes(2);
  });

  test('create validates and retries on conflict, then fails after attempts', async () => {
    genSpy.mockReturnValue('ABCDEF');
    createSpy
      .mockRejectedValueOnce(new Error('conflict'))
      .mockRejectedValueOnce(new Error('conflict'))
      .mockResolvedValueOnce({ code: 'ABCDEF' } as any);
    const created = await shortUrlService.create({ label: ' L ', longUrl: 'https://x', createdBy: 'u' });
    expect(created.code).toBe('ABCDEF');
    expect(createSpy).toHaveBeenCalledTimes(3);

    // Invalid URL
    await expect(shortUrlService.create({ label: 'a', longUrl: 'ftp://x', createdBy: 'u' })).rejects.toThrow('invalid longUrl');
    // Missing label
    await expect(shortUrlService.create({ label: '  ', longUrl: 'https://x', createdBy: 'u' })).rejects.toThrow('label is required');

    // Exceed attempts
    createSpy.mockRejectedValue(new Error('conflict'));
    await expect(shortUrlService.create({ label: 'a', longUrl: 'https://x', createdBy: 'u' })).rejects.toThrow('could not generate unique code');
  });

  test('update validations, forbidden, and success', async () => {
    // Not found
    findUniqueSpy.mockResolvedValue(null as any);
    await expect(shortUrlService.update({ code: 'A', updatedBy: 'u' }, 'u', false)).resolves.toBeNull();

    // Forbidden
    findUniqueSpy.mockResolvedValue({ code: 'A', label: 'L', longUrl: 'https://x', createdBy: 'other', expiresAt: null } as any);
    await expect(shortUrlService.update({ code: 'A', updatedBy: 'u' }, 'u', false)).rejects.toThrow('forbidden');

    // Invalid longUrl
    findUniqueSpy.mockResolvedValue({ code: 'A', label: 'L', longUrl: 'https://x', createdBy: 'u', expiresAt: null } as any);
    await expect(shortUrlService.update({ code: 'A', longUrl: 'ftp://x', updatedBy: 'u' }, 'u', false)).rejects.toThrow('invalid longUrl');

    // Success with partial fields untouched
    updateSpy.mockResolvedValue({ code: 'A', label: 'L2' } as any);
    await expect(shortUrlService.update({ code: 'A', label: 'L2', updatedBy: 'u' }, 'u', true)).resolves.toEqual({ code: 'A', label: 'L2' });

    // Success with expiresAt provided (alternate branch)
    findUniqueSpy.mockResolvedValue({ code: 'A', label: 'L', longUrl: 'https://x', createdBy: 'u', expiresAt: new Date() } as any);
    updateSpy.mockResolvedValue({ code: 'A', label: 'L', expiresAt: null } as any);
    await expect(shortUrlService.update({ code: 'A', expiresAt: null, updatedBy: 'u' }, 'u', true)).resolves.toEqual({ code: 'A', label: 'L', expiresAt: null });
  });

  test('remove not found, forbidden, success', async () => {
    findUniqueSpy.mockResolvedValue(null as any);
    await expect(shortUrlService.remove('A', 'u', false)).resolves.toBe(false);

    findUniqueSpy.mockResolvedValue({ code: 'A', createdBy: 'other' } as any);
    await expect(shortUrlService.remove('A', 'u', false)).rejects.toThrow('forbidden');

    findUniqueSpy.mockResolvedValue({ code: 'A', createdBy: 'u' } as any);
    deleteSpy.mockResolvedValue({} as any);
    await expect(shortUrlService.remove('A', 'u', false)).resolves.toBe(true);
  });

  test('incrementStatsOnRedirect delegates to prisma', async () => {
    updateSpy.mockResolvedValue({ code: 'A' } as any);
    const r = await shortUrlService.incrementStatsOnRedirect('A');
    expect(r).toEqual({ code: 'A' });
    expect(updateSpy).toHaveBeenCalled();
  });
});

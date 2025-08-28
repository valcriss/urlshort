import { AppConfiguration, TestAppConfiguration, setAppConfiguration } from '../src/config/appConfig.js';

describe('db client export', () => {
  afterEach(() => {
    jest.resetModules();
    setAppConfiguration(new AppConfiguration());
    jest.dontMock('@prisma/client');
    jest.resetAllMocks();
  });

  test('exports stub in test env', async () => {
    setAppConfiguration(new TestAppConfiguration({ nodeEnv: 'test' }));
    const { prisma } = await import('../src/db.js');
    expect(prisma).toBeDefined();
    expect(typeof prisma.shortUrl.findUnique).toBe('function');
    await expect(prisma.shortUrl.findUnique()).resolves.toBeNull();
    await expect(prisma.shortUrl.findMany()).resolves.toEqual([]);
    // exercise stubbed throw branches for coverage
    await expect(prisma.shortUrl.create()).rejects.toThrow('not implemented');
    await expect(prisma.shortUrl.update()).rejects.toThrow('not implemented');
    await expect(prisma.shortUrl.delete()).rejects.toThrow('not implemented');
  });

  test('exports real client in non-test env (mocked)', async () => {
    // Mock @prisma/client to avoid requiring generated client
    jest.doMock(
      '@prisma/client',
      () => ({
        PrismaClient: class {
          shortUrl = { findUnique: async () => null } as any;
        }
      }),
      { virtual: true }
    );

    setAppConfiguration(new TestAppConfiguration({ nodeEnv: 'production' }));
    jest.resetModules();
    const { prisma } = await import('../src/db.js');
    expect(prisma).toBeDefined();
    expect(prisma.shortUrl).toBeDefined();
    await expect(prisma.shortUrl.findUnique()).resolves.toBeNull();
  });
});

import { PrismaClient } from '@prisma/client';

import { getAppConfiguration } from './config/appConfig.js';

// In tests, avoid requiring a real generated Prisma client/connection.
// Provide a minimal in-memory stub that tests can spy on.
const isTest = getAppConfiguration().nodeEnv === 'test';

export const prisma: any = isTest
  ? {
      shortUrl: {
        findUnique: async () => null,
        findMany: async () => [],
        create: async () => {
          throw new Error('not implemented');
        },
        update: async () => {
          throw new Error('not implemented');
        },
        delete: async () => {
          throw new Error('not implemented');
        }
      }
    }
  : new PrismaClient();

import { PrismaClient } from '@prisma/client';

import { getAppConfiguration } from './config/appConfig.js';

let prismaInstance: any | undefined;

function buildPrisma(): any {
  const isTest = getAppConfiguration().nodeEnv === 'test';
  if (isTest) {
    return {
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
    };
  }
  return new PrismaClient();
}

export function getPrisma(): any {
  if (!prismaInstance) {
    prismaInstance = buildPrisma();
  }
  return prismaInstance;
}

// Test-only helper to rebuild prisma when configuration changes between tests
export function __resetPrismaForTests(): void {
  prismaInstance = undefined;
}

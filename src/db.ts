import { PrismaClient } from '@prisma/client';

// In tests, avoid requiring a real generated Prisma client/connection.
// Provide a minimal in-memory stub that tests can spy on.
export const prisma: any =
  process.env.NODE_ENV === 'test'
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

import { prisma } from '../db.js';
import { generateCode } from '../utils/code.js';
import { isValidHttpUrl } from '../utils/validate.js';

export interface CreateUrlInput {
  label: string;
  longUrl: string;
  expiresAt?: Date | null;
  createdBy: string;
}

export interface UpdateUrlInput {
  code: string;
  label?: string;
  longUrl?: string;
  expiresAt?: Date | null;
  updatedBy: string;
}

export class ShortUrlService {
  async getByCode(code: string) {
    return prisma.shortUrl.findUnique({ where: { code } });
  }

  async listByUser(email: string) {
    return prisma.shortUrl.findMany({
      where: { createdBy: email },
      orderBy: { createdAt: 'desc' }
    });
  }

  async listByEmailAsAdmin(email: string) {
    return prisma.shortUrl.findMany({
      where: { createdBy: email },
      orderBy: { createdAt: 'desc' }
    });
  }

  async create(input: CreateUrlInput) {
    if (!input.label?.trim()) throw new Error('label is required');
    if (!isValidHttpUrl(input.longUrl)) throw new Error('invalid longUrl');

    // try to generate unique code up to N times
    let attempts = 0;
    while (attempts < 5) {
      const code = generateCode(6);
      try {
        return await prisma.shortUrl.create({
          data: {
            code,
            label: input.label.trim(),
            longUrl: input.longUrl,
            expiresAt: input.expiresAt ?? null,
            createdBy: input.createdBy,
            updatedBy: input.createdBy
          }
        });
      } catch (e: unknown) {
        // unique conflict, retry
        attempts += 1;
      }
    }
    throw new Error('could not generate unique code');
  }

  async update(input: UpdateUrlInput, requesterEmail: string, isAdmin: boolean) {
    const existing = await prisma.shortUrl.findUnique({ where: { code: input.code } });
    if (!existing) return null;
    if (!isAdmin && existing.createdBy !== requesterEmail) {
      throw new Error('forbidden');
    }

    if (input.longUrl !== undefined && !isValidHttpUrl(input.longUrl)) {
      throw new Error('invalid longUrl');
    }

    return prisma.shortUrl.update({
      where: { code: input.code },
      data: {
        label: input.label ?? existing.label,
        longUrl: input.longUrl ?? existing.longUrl,
        expiresAt: input.expiresAt === undefined ? existing.expiresAt : input.expiresAt,
        updatedBy: input.updatedBy
      }
    });
  }

  async remove(code: string, requesterEmail: string, isAdmin: boolean) {
    const existing = await prisma.shortUrl.findUnique({ where: { code } });
    if (!existing) return false;
    if (!isAdmin && existing.createdBy !== requesterEmail) {
      throw new Error('forbidden');
    }
    await prisma.shortUrl.delete({ where: { code } });
    return true;
  }

  async incrementStatsOnRedirect(code: string) {
    return prisma.shortUrl.update({
      where: { code },
      data: {
        clickCount: { increment: 1 },
        lastAccessAt: new Date()
      }
    });
  }
}

export const shortUrlService = new ShortUrlService();


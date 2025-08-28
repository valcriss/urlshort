import { Router, type Request, type Response } from 'express';

import { shortUrlService } from '../services/shortUrl.service.js';

type CacheEntry = { longUrl: string; expiresAt: Date | null };

class LRUCache {
  private max: number;
  private map = new Map<string, CacheEntry>();
  constructor(max = 1000) { this.max = max; }
  get(key: string): CacheEntry | undefined {
    const val = this.map.get(key);
    if (!val) return undefined;
    // refresh recency
    this.map.delete(key);
    this.map.set(key, val);
    return val;
  }
  set(key: string, val: CacheEntry): void {
    this.map.set(key, val);
    if (this.map.size > this.max) {
      const firstKey = this.map.keys().next().value as string;
      this.map.delete(firstKey);
    }
  }
  delete(key: string): void {
    this.map.delete(key);
  }
}

const cache = new LRUCache(Number(process.env.REDIRECT_CACHE_MAX) || 2000);

export function invalidateCacheFor(code: string): void {
  cache.delete(code);
}

export const redirectRouter = Router();

// Mount after API/backends; restrict param to avoid catching /api and /backend
redirectRouter.get('/:code([A-Za-z0-9]{1,32})', async (req: Request, res: Response) => {
  const code = req.params.code;
  try {
    let entry = cache.get(code);
    if (!entry) {
      const item = await shortUrlService.getByCode(code);
      if (!item) return res.status(404).set('Cache-Control', 'no-store').set('X-Robots-Tag', 'noindex').send('Not found');
      entry = { longUrl: item.longUrl, expiresAt: item.expiresAt ?? null };
      cache.set(code, entry);
    }

    const now = new Date();
    if (entry.expiresAt && entry.expiresAt.getTime() <= now.getTime()) {
      return res
        .status(410)
        .set('Cache-Control', 'no-store')
        .set('X-Robots-Tag', 'noindex')
        .type('text/plain; charset=utf-8')
        .send('Ce lien a expiré. Veuillez contacter le propriétaire ou créer un nouveau lien.');
    }

    // Stats update in DB regardless of cache hit
    void shortUrlService.incrementStatsOnRedirect(code).catch(() => undefined);

    res.set('Cache-Control', 'no-store').set('X-Robots-Tag', 'noindex');
    return res.redirect(302, entry.longUrl);
  } catch {
    return res.status(500).set('Cache-Control', 'no-store').set('X-Robots-Tag', 'noindex').send('Server error');
  }
});

export default redirectRouter;

import { Router, type Request, type Response } from 'express';

import { invalidateCacheFor } from './redirect.js';
import { authMiddleware } from '../middleware/auth.js';
import { shortUrlService } from '../services/shortUrl.service.js';
import { parseOptionalDate, isCodeValid, isValidHttpUrl } from '../utils/validate.js';

export const apiRouter = Router();

apiRouter.use(authMiddleware);

// GET /api/url?email=... (email allowed only for admin)
apiRouter.get('/url', async (req: Request, res: Response) => {
  try {
    if (req.isAdmin) {
      const email = String(req.query.email || '');
      if (!email) return res.status(400).json({ error: 'email is required for admin listing' });
      const items = await shortUrlService.listByEmailAsAdmin(email);
      return res.json(items);
    }
    const email = req.userEmail!;
    const items = await shortUrlService.listByUser(email);
    return res.json(items);
  } catch {
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/url/:code
apiRouter.get('/url/:code', async (req: Request, res: Response) => {
  const { code } = req.params;
  if (!isCodeValid(code)) return res.status(400).json({ error: 'invalid code' });
  const item = await shortUrlService.getByCode(code);
  if (!item) return res.status(404).json({ error: 'not found' });
  if (!req.isAdmin && item.createdBy !== req.userEmail) return res.status(403).json({ error: 'forbidden' });
  return res.json(item);
});

// POST /api/url
apiRouter.post('/url', async (req: Request, res: Response) => {
  try {
    const { label, longUrl, expiresAt, email } = req.body as { label?: string; longUrl?: string; expiresAt?: unknown; email?: string };
    const exp = parseOptionalDate(expiresAt);
    if (exp === null && expiresAt !== undefined && expiresAt !== null && expiresAt !== '') {
      return res.status(400).json({ error: 'invalid expiresAt' });
    }
    if (!label || !longUrl) return res.status(400).json({ error: 'label and longUrl are required' });
    if (!isValidHttpUrl(longUrl)) return res.status(400).json({ error: 'invalid longUrl' });

    // Only admin token (not group-admin) can override createdBy
    const createdBy = req.adminToken ? (email || 'system@local') : req.userEmail!;
    const created = await shortUrlService.create({ label, longUrl, expiresAt: exp, createdBy });
    return res.status(201).json(created);
  } catch (e) {
    const msg = (e as Error).message || 'Server error';
    if (msg === 'could not generate unique code') return res.status(409).json({ error: msg });
    return res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/url
apiRouter.put('/url', async (req: Request, res: Response) => {
  try {
    const { code, label, longUrl, expiresAt } = req.body as { code?: string; label?: string; longUrl?: string; expiresAt?: unknown };
    if (!code || !isCodeValid(code)) return res.status(400).json({ error: 'invalid code' });
    if (longUrl !== undefined && !isValidHttpUrl(longUrl)) return res.status(400).json({ error: 'invalid longUrl' });
    const exp = parseOptionalDate(expiresAt);
    if (exp === null && expiresAt !== undefined && expiresAt !== null && expiresAt !== '') {
      return res.status(400).json({ error: 'invalid expiresAt' });
    }

    const updated = await shortUrlService.update(
      { code, label, longUrl, expiresAt: expiresAt === undefined ? undefined : exp, updatedBy: req.isAdmin ? 'admin@local' : req.userEmail! },
      req.userEmail!,
      !!req.isAdmin
    );
    if (!updated) return res.status(404).json({ error: 'not found' });
    // Invalidate redirect cache so next redirect uses fresh values
    invalidateCacheFor(code);
    return res.json(updated);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'forbidden') return res.status(403).json({ error: 'forbidden' });
    if (msg === 'invalid longUrl') return res.status(400).json({ error: 'invalid longUrl' });
    return res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/url
apiRouter.delete('/url', async (req: Request, res: Response) => {
  try {
    const { code } = req.body as { code?: string };
    if (!code || !isCodeValid(code)) return res.status(400).json({ error: 'invalid code' });
    const ok = await shortUrlService.remove(code, req.userEmail!, !!req.isAdmin);
    if (!ok) return res.status(404).json({ error: 'not found' });
    invalidateCacheFor(code);
    return res.status(204).send();
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'forbidden') return res.status(403).json({ error: 'forbidden' });
    return res.status(500).json({ error: 'Server error' });
  }
});

export default apiRouter;

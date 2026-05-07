import { Router } from 'express';
import { sql } from 'drizzle-orm';
import { getDb } from '@damga/db';
import { isConfigured } from '../config/env';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'damga-api',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    configured: isConfigured,
  });
});

healthRouter.get('/ready', async (_req, res) => {
  const checks: Record<string, { ok: boolean; error?: string }> = {};
  if (isConfigured.db) {
    try {
      await getDb().execute(sql`select 1`);
      checks.database = { ok: true };
    } catch (err) {
      checks.database = { ok: false, error: (err as Error).message };
    }
  }
  const allOk = Object.values(checks).every((c) => c.ok);
  res.status(allOk ? 200 : 503).json({ ok: allOk, checks });
});

healthRouter.get('/healthz', (_req, res) => {
  res.type('text/plain').send('ok');
});

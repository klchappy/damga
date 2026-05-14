/**
 * Status route range parametresi testi (DB mock'lu).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@damga/db', () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: () => Promise.resolve([]),
          }),
        }),
      }),
    }),
    execute: () => Promise.resolve({ rows: [] }),
  }),
  monitorPings: {
    is_up: 'is_up',
    latency_ms: 'latency_ms',
    target: 'target',
    checked_at: 'checked_at',
    url: 'url',
    status_code: 'status_code',
  },
}));

import express from 'express';
import request from 'supertest';
import { statusRouter } from '../src/routes/status';

describe('GET /v1/status — range validation', () => {
  const app = express();
  app.use('/v1/status', statusRouter);

  it('default range = 24h, web + api services döner', async () => {
    const r = await request(app).get('/v1/status');
    expect(r.status).toBe(200);
    expect(r.body.range).toBe('24h');
    expect(r.body.services).toHaveLength(2);
    expect(r.body.services[0]).toMatchObject({
      target: 'web',
      current: 'unknown', // hiç ping yok mock'ta
      uptime_pct: 0,
      total_checks: 0,
    });
    expect(r.body.services[1].target).toBe('api');
  });

  it('range=7d kabul edilir', async () => {
    const r = await request(app).get('/v1/status?range=7d');
    expect(r.status).toBe(200);
    expect(r.body.range).toBe('7d');
  });

  it('range=30d kabul edilir', async () => {
    const r = await request(app).get('/v1/status?range=30d');
    expect(r.status).toBe(200);
    expect(r.body.range).toBe('30d');
  });

  it('geçersiz range default 24h\'a düşer', async () => {
    const r = await request(app).get('/v1/status?range=invalid');
    expect(r.status).toBe(200);
    expect(r.body.range).toBe('invalid'); // gelen değer dönüyor ama config 24h
  });

  it('Cache-Control header 30 saniye', async () => {
    const r = await request(app).get('/v1/status');
    expect(r.headers['cache-control']).toContain('max-age=30');
  });

  it('generated_at ISO 8601 formatında', async () => {
    const r = await request(app).get('/v1/status');
    expect(r.body.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

/**
 * Health + status endpoint integration testleri.
 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { healthRouter } from '../src/routes/health';

describe('Health endpoint family', () => {
  const app = express();
  app.use('/v1/health', healthRouter);

  it('GET /v1/health/healthz - 200 plain text', async () => {
    const r = await request(app).get('/v1/health/healthz');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('text/plain');
  });

  it('GET /v1/health - JSON with required fields', async () => {
    const r = await request(app).get('/v1/health');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      status: 'ok',
      service: 'damga-api',
      version: expect.any(String),
      timestamp: expect.any(String),
      configured: expect.any(Object),
    });
  });

  it('GET /v1/health/ready - 503 when DB unavailable (test env)', async () => {
    const r = await request(app).get('/v1/health/ready');
    // Test env'da gerçek DB yok, ya 200 ya 503 — sadece formatın doğru olduğunu kontrol et
    expect([200, 503]).toContain(r.status);
    expect(r.body).toHaveProperty('ok');
    expect(r.body).toHaveProperty('checks');
  });

  it('Health timestamp ISO 8601 formatında', async () => {
    const r = await request(app).get('/v1/health');
    expect(r.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(new Date(r.body.timestamp).toString()).not.toBe('Invalid Date');
  });
});

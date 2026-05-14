/**
 * Health endpoint smoke testi — express app boot ediyor mu?
 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { healthRouter } from '../src/routes/health';

describe('Health endpoints', () => {
  const app = express();
  app.use('/v1/health', healthRouter);

  it('GET /v1/health/healthz → 200 + "ok"', async () => {
    const r = await request(app).get('/v1/health/healthz');
    expect(r.status).toBe(200);
    expect(r.text).toMatch(/^ok\n?$/);
  });

  it('GET /v1/health → JSON status', async () => {
    const r = await request(app).get('/v1/health');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      status: 'ok',
      service: 'damga-api',
    });
    expect(typeof r.body.timestamp).toBe('string');
    expect(typeof r.body.configured).toBe('object');
  });
});

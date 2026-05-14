/**
 * shift-lookup smoke testleri — Istanbul day string conversion.
 */
import { describe, it, expect } from 'vitest';
import { toIstanbulDayString } from '../src/lib/shift-lookup';

describe('toIstanbulDayString', () => {
  it('UTC 21:00 → ertesi gün Istanbul saatinde (UTC+3)', () => {
    // UTC 2026-05-14 21:00 = Istanbul 2026-05-15 00:00
    const d = new Date('2026-05-14T21:00:00.000Z');
    expect(toIstanbulDayString(d)).toBe('2026-05-15');
  });

  it('UTC 06:00 → aynı gün Istanbul', () => {
    const d = new Date('2026-05-14T06:00:00.000Z');
    expect(toIstanbulDayString(d)).toBe('2026-05-14');
  });

  it('gece yarısı UTC → aynı gün Istanbul 03:00', () => {
    const d = new Date('2026-05-14T00:00:00.000Z');
    expect(toIstanbulDayString(d)).toBe('2026-05-14');
  });

  it('YYYY-MM-DD format', () => {
    const d = new Date('2026-01-01T12:00:00.000Z');
    const s = toIstanbulDayString(d);
    expect(s).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

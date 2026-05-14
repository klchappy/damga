/**
 * XP bonus/ceza hesaplama smoke testleri.
 * Vardiya saatlerine göre on-time bonus/late penalty doğru hesaplanıyor mu?
 */
import { describe, it, expect } from 'vitest';
import { computeOnTimeBonus } from '../src/lib/xp';

// Helper: İstanbul saatinde belirli HH:MM için UTC Date üret (UTC+3 sabit)
function istanbulTime(hour: number, minute: number): Date {
  const d = new Date(Date.UTC(2026, 4, 14, hour - 3, minute, 0));
  return d;
}

describe('computeOnTimeBonus — check_in', () => {
  it('vardiya atanmamış kullanıcı → 0 bonus, no_shift_assigned', () => {
    const r = computeOnTimeBonus({
      type: 'check_in',
      serverTime: istanbulTime(8, 0),
      workStart: null,
      workEnd: null,
    });
    expect(r.bonus).toBe(0);
    expect(r.reason).toBe('no_shift_assigned');
  });

  it('Tam zamanında geldi → +5 XP on_time_check_in', () => {
    const r = computeOnTimeBonus({
      type: 'check_in',
      serverTime: istanbulTime(9, 0),
      workStart: '09:00',
      workEnd: '18:00',
    });
    expect(r.bonus).toBe(5);
    expect(r.reason).toBe('on_time_check_in');
  });

  it('Erken geldi → +5 XP', () => {
    const r = computeOnTimeBonus({
      type: 'check_in',
      serverTime: istanbulTime(8, 45),
      workStart: '09:00',
      workEnd: '18:00',
    });
    expect(r.bonus).toBe(5);
  });

  it('15 dakika gecikti → +2 XP slightly_late', () => {
    const r = computeOnTimeBonus({
      type: 'check_in',
      serverTime: istanbulTime(9, 15),
      workStart: '09:00',
      workEnd: '18:00',
    });
    expect(r.bonus).toBe(2);
    expect(r.reason).toBe('slightly_late_check_in');
  });

  it('45 dakika geç → -5 XP ceza late_penalty_30', () => {
    const r = computeOnTimeBonus({
      type: 'check_in',
      serverTime: istanbulTime(9, 45),
      workStart: '09:00',
      workEnd: '18:00',
    });
    expect(r.bonus).toBe(-5);
    expect(r.reason).toBe('late_penalty_30');
  });

  it('70 dakika geç → -10 XP ceza late_penalty_60', () => {
    const r = computeOnTimeBonus({
      type: 'check_in',
      serverTime: istanbulTime(10, 10),
      workStart: '09:00',
      workEnd: '18:00',
    });
    expect(r.bonus).toBe(-10);
    expect(r.reason).toBe('late_penalty_60');
  });
});

describe('computeOnTimeBonus — check_out', () => {
  it('Tam zamanında çıkış → +5 full_day_check_out', () => {
    const r = computeOnTimeBonus({
      type: 'check_out',
      serverTime: istanbulTime(18, 0),
      workStart: '09:00',
      workEnd: '18:00',
    });
    expect(r.bonus).toBe(5);
    expect(r.reason).toBe('full_day_check_out');
  });

  it('Geç çıkış (overtime alanı) → +5 full_day', () => {
    const r = computeOnTimeBonus({
      type: 'check_out',
      serverTime: istanbulTime(19, 30),
      workStart: '09:00',
      workEnd: '18:00',
    });
    expect(r.bonus).toBe(5);
  });

  it('15dk erken çıkış → +2 almost_full_day', () => {
    const r = computeOnTimeBonus({
      type: 'check_out',
      serverTime: istanbulTime(17, 50),
      workStart: '09:00',
      workEnd: '18:00',
    });
    expect(r.bonus).toBe(2);
    expect(r.reason).toBe('almost_full_day');
  });

  it('Çok erken çıkış → 0 early_check_out', () => {
    const r = computeOnTimeBonus({
      type: 'check_out',
      serverTime: istanbulTime(15, 0),
      workStart: '09:00',
      workEnd: '18:00',
    });
    expect(r.bonus).toBe(0);
    expect(r.reason).toBe('early_check_out');
  });

  it('Vardiya atanmamış → 0 bonus check_out', () => {
    const r = computeOnTimeBonus({
      type: 'check_out',
      serverTime: istanbulTime(18, 0),
      workStart: null,
      workEnd: null,
    });
    expect(r.bonus).toBe(0);
    expect(r.reason).toBe('no_shift_assigned');
  });
});

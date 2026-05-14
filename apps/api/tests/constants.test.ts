/**
 * Constants regression testleri.
 *
 * Bu testlerin amacı: kritik production değerleri yanlışlıkla değişmesin.
 * Birisi VELOCITY_WINDOW_MS'i 30 sn'den 30 ms'ye düşürse production
 * replay attack korumasız kalır → bu test fail eder, PR review'da yakalanır.
 */
import { describe, it, expect } from 'vitest';
import * as C from '../src/config/constants';

describe('Critical production constants', () => {
  it('VELOCITY_WINDOW_MS = 30 saniye', () => {
    expect(C.VELOCITY_WINDOW_MS).toBe(30 * 1000);
  });

  it('Trust score eşikleri standart', () => {
    expect(C.TRUST_SCORE_FULL).toBe(100);
    expect(C.TRUST_SCORE_TRUSTED).toBe(80);
  });

  it('Account lockout 5 fail = 15dk kilit', () => {
    expect(C.LOCKOUT_THRESHOLD).toBe(5);
    expect(C.LOCKOUT_DURATION_MIN).toBe(15);
    expect(C.LOCKOUT_WINDOW_MIN).toBe(15);
  });

  it('KVKK silme süreleri yasal uyum', () => {
    // KVKK Md.7 + Md.11 — 30 gün grace + 60 gün audit window
    expect(C.ACCOUNT_DELETION_GRACE_DAYS).toBe(30);
    expect(C.ACCOUNT_HARD_DELETE_AFTER_DAYS).toBe(60);
    // Toplam talep + 90 gün
    expect(C.ACCOUNT_DELETION_GRACE_DAYS + C.ACCOUNT_HARD_DELETE_AFTER_DAYS).toBe(90);
  });

  it('Idempotency TTL = 24 saat', () => {
    expect(C.IDEMPOTENCY_TTL_HOURS).toBe(24);
  });

  it('Webhook timestamp tolerance 5 dk', () => {
    expect(C.WEBHOOK_TIMESTAMP_TOLERANCE_SEC).toBe(300);
  });

  it('Health monitoring 5dk interval, 90 gün retention', () => {
    expect(C.HEALTH_PING_INTERVAL_MIN).toBe(5);
    expect(C.HEALTH_RETENTION_DAYS).toBe(90);
  });

  it('XP top3 ödülleri tutarlı', () => {
    expect(C.XP_WEEKLY_TOP3).toEqual([500, 300, 100]);
    expect(C.XP_MONTHLY_TOP3).toEqual([2000, 1000, 500]);
    // Aylık haftalıktan yüksek olmalı
    expect(C.XP_MONTHLY_TOP3[0]).toBeGreaterThan(C.XP_WEEKLY_TOP3[0]);
  });

  it('Selfie 5MB binary limit', () => {
    expect(C.SELFIE_MAX_BINARY_BYTES).toBe(5 * 1024 * 1024);
    // Base64 ~33% büyür, 8M karakter yaklaşık 6MB binary'e karşılık gelir (limit + buffer)
    expect(C.SELFIE_MAX_BASE64_CHARS).toBeGreaterThan(C.SELFIE_MAX_BINARY_BYTES);
  });
});

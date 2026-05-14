/**
 * Damga API — Magic number / hardcoded constant'lar tek bir yerde.
 *
 * Kural: Bir sayı veya string >1 yerde kullanılıyorsa veya
 * "tuning parameter" sayılıyorsa burada tutulur.
 *
 * Bu dosya production tuning için **tek elden** değiştirilebilen yer.
 * Environment-aware değerler için `apps/api/src/config/env.ts` kullan.
 */

// ============================================================================
// CHECK-IN / DAMGA
// ============================================================================

/** Aynı kullanıcı 30 saniyede ikinci damga atamaz (replay attack koruması) */
export const VELOCITY_WINDOW_MS = 30 * 1000;

/** Trust score "tam doğrulama" eşiği — XP bonusu için */
export const TRUST_SCORE_FULL = 100;

/** Trust score güvenilir kabul edilen alt sınır (otomatik onay) */
export const TRUST_SCORE_TRUSTED = 80;

/** Selfie upload max bytes (base64 öncesi binary) */
export const SELFIE_MAX_BINARY_BYTES = 5 * 1024 * 1024; // 5 MB

/** Selfie upload max base64 char sayısı (~6.5 MB ham → ~5 MB binary) */
export const SELFIE_MAX_BASE64_CHARS = 8_000_000;

// ============================================================================
// XP / GAMIFICATION
// ============================================================================

/** Tam zamanında check-in XP bonusu */
export const XP_ON_TIME_CHECK_IN = 5;

/** 15dk gecikme XP bonusu (yine pozitif, biraz daha az) */
export const XP_SLIGHTLY_LATE = 2;

/** 30dk-60dk geç (penalty) */
export const XP_LATE_PENALTY_30 = -5;

/** 60dk+ geç (büyük penalty) */
export const XP_LATE_PENALTY_60 = -10;

/** Tam gün check-out (mesai bittikten sonra) */
export const XP_FULL_DAY_CHECK_OUT = 5;

/** Mesai bitimine 15dk içinde check-out */
export const XP_ALMOST_FULL_DAY = 2;

/** Trust 100 ek bonus */
export const XP_FULL_TRUST_BONUS = 5;

/** Haftalık top3 ödülü (1, 2, 3) */
export const XP_WEEKLY_TOP3 = [500, 300, 100];

/** Aylık top3 ödülü */
export const XP_MONTHLY_TOP3 = [2000, 1000, 500];

// ============================================================================
// HEALTH MONITORING (self-hosted uptime)
// ============================================================================

/** Ping interval — her N dakikada hedefler kontrol edilir */
export const HEALTH_PING_INTERVAL_MIN = 5;

/** Ping timeout — bir endpoint kaç saniye sonra "down" sayılır */
export const HEALTH_PING_TIMEOUT_MS = 10_000;

/** monitor_pings retention — kaç gün veri saklanır */
export const HEALTH_RETENTION_DAYS = 90;

/** Health monitor cron tick — kaç saniyede bir kontrol et */
export const HEALTH_TICK_INTERVAL_MS = 30_000;

// ============================================================================
// KVKK / ACCOUNT DELETION
// ============================================================================

/** Talep + bu kadar gün sonra anonymize edilir (grace period) */
export const ACCOUNT_DELETION_GRACE_DAYS = 30;

/** Anonymize'den bu kadar gün sonra hard delete edilir */
export const ACCOUNT_HARD_DELETE_AFTER_DAYS = 60;

// ============================================================================
// ACCOUNT LOCKOUT
// ============================================================================

/** Son N dakika içinde başarısız deneme penceresi */
export const LOCKOUT_WINDOW_MIN = 15;

/** Bu kadar başarısız deneme → kilit */
export const LOCKOUT_THRESHOLD = 5;

/** Lock süresi (dakika) */
export const LOCKOUT_DURATION_MIN = 15;

/** auth_failed_attempts retention */
export const AUTH_ATTEMPTS_RETENTION_DAYS = 30;

// ============================================================================
// API KEYS & RATE LIMIT
// ============================================================================

/** Per-key rate limit penceresi */
export const API_KEY_RATE_WINDOW_MS = 60_000;

/** Per-key rate limit max istek (varsayılan) */
export const API_KEY_RATE_DEFAULT_MAX = 100;

// ============================================================================
// IDEMPOTENCY
// ============================================================================

/** Idempotency key TTL — bu süre kadar replay engellenir */
export const IDEMPOTENCY_TTL_HOURS = 24;

// ============================================================================
// WEBHOOK
// ============================================================================

/** Webhook delivery retry sayısı (exponential backoff) */
export const WEBHOOK_MAX_RETRIES = 5;

/** Webhook timestamp tolerance (replay protection, ±N saniye) */
export const WEBHOOK_TIMESTAMP_TOLERANCE_SEC = 300;

// ============================================================================
// EMAIL
// ============================================================================

/** Resend webhook replay protection (timestamp ±N saniye) */
export const EMAIL_WEBHOOK_TOLERANCE_SEC = 300;

/** email_events retention */
export const EMAIL_EVENTS_RETENTION_DAYS = 90;

// ============================================================================
// TIME ZONES
// ============================================================================

/** Damga'nın varsayılan zaman dilimi (Türkiye) */
export const DEFAULT_TIMEZONE = 'Europe/Istanbul';

/** UTC+3 offset (Türkiye yaz/kış saati farkı yok) */
export const ISTANBUL_UTC_OFFSET_HOURS = 3;

// ============================================================================
// CRON SCHEDULE
// ============================================================================

/** Pazartesi 09:00 → weekly leaderboard finalize */
export const CRON_WEEKLY_DAY = 'Mon';
export const CRON_WEEKLY_HOUR = '09';

/** Ay başı 09:00 → monthly leaderboard finalize */
export const CRON_MONTHLY_DAY = '01';
export const CRON_MONTHLY_HOUR = '09';

/** Gece 03:00 → backup */
export const CRON_BACKUP_HOUR = '03';
export const CRON_BACKUP_MIN = '00';

/** Gece 04:00 → account cleanup */
export const CRON_CLEANUP_HOUR = '04';
export const CRON_CLEANUP_MIN = '00';

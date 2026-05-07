/**
 * Damga uygulama-geneli sabitler (UI + API ortak).
 */

export const APP_NAME = 'Damga';
export const APP_TAGLINE = 'Şeffaf işyeri yoklama';

// Plan limitleri
export const PLAN_LIMITS = {
  free: { users: 3, locations: 1, api_keys: 0, webhooks: 0 },
  starter: { users: 10, locations: 2, api_keys: 1, webhooks: 1 },
  pro: { users: 25, locations: 5, api_keys: 3, webhooks: 3 },
  business: { users: 100, locations: 20, api_keys: 10, webhooks: 10 },
  enterprise: { users: Infinity, locations: Infinity, api_keys: Infinity, webhooks: Infinity },
} as const;

// Plan fiyatları (₺/ay, KDV dahil)
export const PLAN_PRICES_TRY = {
  free: 0,
  starter: 99,
  pro: 299,
  business: 899,
  enterprise: 0, // contract-based
} as const;

// Trust score eşikleri
export const TRUST_THRESHOLDS = {
  AUTO_APPROVE: 80, // ≥80 → otomatik onay
  FLAG_FOR_REVIEW: 60, // 60–79 → onay ama bayrak
  REJECT: 0, // <60 → reddet (admin'e yönlendir)
} as const;

// Trust score puanları (toplam 100)
export const TRUST_POINTS = {
  NFC: 30,
  GPS: 25,
  WIFI: 20,
  TIME_CONSISTENCY: 15,
  KNOWN_DEVICE: 10,
  NEW_DEVICE_PARTIAL: 5,
  QR: 25, // QR varsa NFC alternatifi
} as const;

// Gamification
export const XP_REWARDS = {
  CHECK_IN: 10,
  CHECK_IN_ON_TIME: 5, // bonus, geç değilse
  CHECK_IN_FULL_TRUST: 5, // bonus, score = 100
  STREAK_MILESTONE_7: 50,
  STREAK_MILESTONE_30: 200,
  STREAK_MILESTONE_100: 1000,
  MOOD_LOGGED: 2,
} as const;

/** Level formülü: floor(sqrt(xp/100)) + 1 */
export function xpToLevel(xp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1;
}

/** Sonraki level için gereken XP */
export function xpForNextLevel(currentLevel: number): number {
  return Math.pow(currentLevel, 2) * 100;
}

// Mood emoji → score eşlemesi
export const MOOD_EMOJI_SCORE: Record<string, number> = {
  '😄': 5,
  '🙂': 4,
  '😐': 3,
  '😕': 2,
  '😫': 1,
};

export const MOOD_EMOJIS = ['😄', '🙂', '😐', '😕', '😫'] as const;
export type MoodEmojiUnion = (typeof MOOD_EMOJIS)[number];

// Status type → TR etiket
export const STATUS_LABELS = {
  running_late: '⏰ Geç kalıyorum',
  on_lunch: '🍽️ Yemekteyim',
  sick: '🤒 Hastayım',
  wfh: '🏠 Evden çalışıyorum',
  in_focus: '🎯 Odak modunda',
  on_business: '💼 İş seyahatinde',
  on_break: '☕ Mola',
} as const;

// Çalışma saatleri varsayılan
export const DEFAULT_WORK_HOURS = {
  start: '09:00',
  end: '18:00',
  lunch_start: '12:00',
  lunch_end: '13:00',
} as const;

// Geofence default yarıçapı
export const DEFAULT_GEOFENCE_RADIUS_M = 100;

// API rate limits
export const RATE_LIMITS = {
  default: { window_ms: 60_000, max: 120 },
  auth: { window_ms: 60_000, max: 10 },
  check_in: { window_ms: 60_000, max: 6 }, // dakikada 6 → 10sn'de bir, anti-spam
  webhook: { window_ms: 60_000, max: 60 },
} as const;

// API scope listesi
export const API_SCOPES = [
  'events:read',
  'events:write',
  'leaves:read',
  'leaves:write',
  'users:read',
  'users:write',
  'locations:read',
  'locations:write',
  'webhooks:manage',
  'reports:read',
] as const;
export type ApiScope = (typeof API_SCOPES)[number];

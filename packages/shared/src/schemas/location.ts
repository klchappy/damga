import { z } from 'zod';

export const createLocationSchema = z.object({
  name: z.string().min(2).max(100),
  address: z.string().max(300).optional(),
  city: z.string().max(80).optional(),
  timezone: z.string().default('Europe/Istanbul'),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  geofence_radius_m: z.number().int().min(10).max(5000).default(100),
  wifi_bssids: z
    .array(z.string().regex(/^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/))
    .default([]),
  nfc_tag_ids: z.array(z.string().min(4).max(200)).default([]),
  qr_codes: z.array(z.string().min(8).max(500)).default([]),
  work_hours_start: z.string().regex(/^\d{2}:\d{2}$/).default('09:00'),
  work_hours_end: z.string().regex(/^\d{2}:\d{2}$/).default('18:00'),
});
export type CreateLocationInput = z.infer<typeof createLocationSchema>;

export const updateLocationSchema = createLocationSchema.partial();

/** NFC tag oluşturma — sistem otomatik signature üretir */
export const createNfcTagSchema = z.object({
  location_id: z.string().uuid(),
  label: z.string().min(2).max(80), // "Ana giriş", "B kapısı"
});

/** QR kod oluşturma — sistem HMAC ile imzalı payload üretir */
export const createQrCodeSchema = z.object({
  location_id: z.string().uuid(),
  label: z.string().min(2).max(80),
  /** QR'ın geçerlilik süresi (gün, default: 90) */
  ttl_days: z.number().int().min(1).max(365).default(90),
});

import { z } from 'zod';

/**
 * Check-in / Check-out request body.
 * Tüm alanlar opsiyonel — bütün kanıtlar (NFC + GPS + WiFi) tek tek puan alır.
 * En az bir doğrulama yöntemi olmalı (NFC veya QR veya GPS).
 */
export const checkInSchema = z
  .object({
    location_id: z.string().uuid().optional(),
    client_time: z.string().datetime(),

    // Konum (GPS)
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    gps_accuracy_m: z.number().int().nonnegative().max(10_000).optional(),

    // NFC
    nfc_tag_id: z.string().min(4).max(200).optional(),
    nfc_signature: z.string().min(8).max(500).optional(),

    // QR
    qr_code_payload: z.string().min(8).max(500).optional(),

    // WiFi
    wifi_bssid: z
      .string()
      .regex(/^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/, 'Geçerli MAC adresi değil')
      .optional(),

    // Cihaz
    device_id: z.string().min(8).max(100).optional(),
    app_version: z.string().max(50).optional(),
    /** İstemci cihaz bilgisi (DeviceInfo tipinde JSON) */
    device_info: z
      .object({
        platform: z.enum(['web', 'ios', 'android']).optional(),
        os_version: z.string().optional(),
        model: z.string().optional(),
      })
      .optional(),
  })
  .refine(
    (data) => {
      // En az bir doğrulama kanıtı olmalı
      const hasNfc = !!data.nfc_tag_id;
      const hasQr = !!data.qr_code_payload;
      const hasGps = data.latitude !== undefined && data.longitude !== undefined;
      return hasNfc || hasQr || hasGps;
    },
    {
      message: 'En az bir doğrulama yöntemi gerekli (NFC veya QR veya GPS)',
      path: ['nfc_tag_id'],
    },
  );

export type CheckInInput = z.infer<typeof checkInSchema>;

/** Çalışan itirazı */
export const disputeEventSchema = z.object({
  reason: z.string().min(10, 'Açıklama en az 10 karakter').max(500),
});

/** Yönetici düzeltme talebi */
export const editEventSchema = z.object({
  new_effective_time: z.string().datetime(),
  reason: z.string().min(10).max(500),
});

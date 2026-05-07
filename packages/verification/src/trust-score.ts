import { TRUST_POINTS, TRUST_THRESHOLDS } from '@damga/shared';
import { haversineDistanceM } from './geo';
import { verifyNfcTag } from './nfc';
import { verifyQrCode } from './qr';

export interface TrustInput {
  // Doğrulama kanıtları
  nfc_raw?: string | null;
  qr_raw?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  gps_accuracy_m?: number | null;
  wifi_bssid?: string | null;
  device_id?: string | null;
  client_time: Date;

  // Lokasyon (whitelist verileri)
  location?: {
    latitude: number;
    longitude: number;
    geofence_radius_m: number;
    wifi_bssids: string[];
    nfc_tag_ids: string[];
  } | null;

  // Cihaz tanıma
  knownDeviceIds: string[];

  // Sunucu zamanı
  serverTime: Date;

  // Secret (NFC/QR HMAC için)
  signingSecret: string;
}

export interface TrustResult {
  score: number;
  decision: 'auto_approve' | 'flag_for_review' | 'reject';
  flags: string[];
  verification_methods: string[];
  distance_from_office_m?: number;
  /** UI'da göstermek için her doğrulamanın ayrı sonucu */
  breakdown: {
    nfc?: { granted: number; reason?: string };
    qr?: { granted: number; reason?: string };
    gps?: { granted: number; distance_m?: number; reason?: string };
    wifi?: { granted: number; reason?: string };
    time?: { granted: number; drift_ms?: number; reason?: string };
    device?: { granted: number; reason?: string };
  };
}

/**
 * Trust score hesaplama — DAMGA çekirdek mantığı.
 * Her kanıt bağımsız puan alır, toplam üzerinden karar verilir.
 *   ≥80 → auto_approve
 *   60-79 → flag_for_review (kabul ama bayraklı)
 *   <60 → reject (admin onayı şart)
 */
export function computeTrustScore(input: TrustInput): TrustResult {
  let score = 0;
  const flags: string[] = [];
  const methods: string[] = [];
  const breakdown: TrustResult['breakdown'] = {};
  let distance: number | undefined;

  // === 1) NFC: 30 puan ===
  if (input.nfc_raw) {
    const nfcResult = verifyNfcTag(input.signingSecret, input.nfc_raw);
    if (nfcResult.valid) {
      // Tag, lokasyonun whitelist'inde mi?
      if (
        input.location &&
        nfcResult.payload &&
        input.location.nfc_tag_ids.includes(nfcResult.payload.tag_id)
      ) {
        score += TRUST_POINTS.NFC;
        methods.push('nfc');
        breakdown.nfc = { granted: TRUST_POINTS.NFC };
      } else {
        flags.push('nfc_not_in_location');
        breakdown.nfc = { granted: 0, reason: 'tag bu lokasyona ait değil' };
      }
    } else {
      flags.push('nfc_invalid');
      breakdown.nfc = { granted: 0, reason: nfcResult.reason };
    }
  }

  // === 2) QR: 25 puan (NFC alternatifi) ===
  if (input.qr_raw && !methods.includes('nfc')) {
    const qrResult = verifyQrCode(input.signingSecret, input.qr_raw);
    if (qrResult.valid) {
      if (
        input.location &&
        qrResult.payload &&
        qrResult.payload.location_id // location_id eşleşmesi DB'de kontrol edilir
      ) {
        score += TRUST_POINTS.QR;
        methods.push('qr');
        breakdown.qr = { granted: TRUST_POINTS.QR };
      } else {
        flags.push('qr_not_in_location');
        breakdown.qr = { granted: 0, reason: 'qr bu lokasyona ait değil' };
      }
    } else {
      flags.push('qr_invalid');
      breakdown.qr = { granted: 0, reason: qrResult.reason };
    }
  }

  // === 3) GPS Geofence: 25 puan ===
  if (
    input.location &&
    input.latitude !== undefined &&
    input.latitude !== null &&
    input.longitude !== undefined &&
    input.longitude !== null
  ) {
    distance = haversineDistanceM(
      input.latitude,
      input.longitude,
      input.location.latitude,
      input.location.longitude,
    );
    // Yüksek GPS hata payı varsa (>200m) flag
    const accuracyPenalty = (input.gps_accuracy_m ?? 0) > 200;
    if (accuracyPenalty) flags.push('gps_low_accuracy');

    if (distance <= input.location.geofence_radius_m) {
      score += TRUST_POINTS.GPS;
      methods.push('gps');
      breakdown.gps = { granted: TRUST_POINTS.GPS, distance_m: distance };
    } else {
      flags.push('out_of_geofence');
      breakdown.gps = {
        granted: 0,
        distance_m: distance,
        reason: `Geofence dışında (${distance}m, sınır ${input.location.geofence_radius_m}m)`,
      };
    }
  }

  // === 4) WiFi BSSID: 20 puan ===
  if (input.wifi_bssid && input.location) {
    const normalized = input.wifi_bssid.toLowerCase();
    const whitelist = input.location.wifi_bssids.map((b) => b.toLowerCase());
    if (whitelist.includes(normalized)) {
      score += TRUST_POINTS.WIFI;
      methods.push('wifi');
      breakdown.wifi = { granted: TRUST_POINTS.WIFI };
    } else {
      flags.push('wifi_not_whitelisted');
      breakdown.wifi = { granted: 0, reason: 'WiFi BSSID listede yok' };
    }
  }

  // === 5) Time consistency: 15 puan ===
  const drift = Math.abs(input.client_time.getTime() - input.serverTime.getTime());
  if (drift < 30_000) {
    score += TRUST_POINTS.TIME_CONSISTENCY;
    methods.push('time');
    breakdown.time = { granted: TRUST_POINTS.TIME_CONSISTENCY, drift_ms: drift };
  } else if (drift < 5 * 60 * 1000) {
    score += Math.round(TRUST_POINTS.TIME_CONSISTENCY * 0.5);
    breakdown.time = {
      granted: Math.round(TRUST_POINTS.TIME_CONSISTENCY * 0.5),
      drift_ms: drift,
      reason: '5dk altı drift',
    };
    flags.push('time_drift_minor');
  } else {
    flags.push('time_drift_major');
    breakdown.time = { granted: 0, drift_ms: drift, reason: 'Saat uyumsuz' };
  }

  // === 6) Device recognition: 10 puan ===
  if (input.device_id) {
    if (input.knownDeviceIds.includes(input.device_id)) {
      score += TRUST_POINTS.KNOWN_DEVICE;
      methods.push('device');
      breakdown.device = { granted: TRUST_POINTS.KNOWN_DEVICE };
    } else {
      score += TRUST_POINTS.NEW_DEVICE_PARTIAL;
      flags.push('new_device');
      breakdown.device = {
        granted: TRUST_POINTS.NEW_DEVICE_PARTIAL,
        reason: 'Yeni cihaz — yarım puan',
      };
    }
  }

  // === Karar ===
  let decision: TrustResult['decision'];
  if (score >= TRUST_THRESHOLDS.AUTO_APPROVE) {
    decision = 'auto_approve';
  } else if (score >= TRUST_THRESHOLDS.FLAG_FOR_REVIEW) {
    decision = 'flag_for_review';
    flags.push('low_trust');
  } else {
    decision = 'reject';
    flags.push('insufficient_trust');
  }

  return {
    score: Math.min(100, score),
    decision,
    flags,
    verification_methods: methods,
    distance_from_office_m: distance,
    breakdown,
  };
}

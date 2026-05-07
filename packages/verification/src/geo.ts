/**
 * İki coğrafi nokta arasındaki mesafe (Haversine formülü).
 * Sonuç metre cinsinden.
 */
export function haversineDistanceM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6_371_000; // Dünya yarıçapı (metre)
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

/** Bir noktanın geofence içinde olup olmadığı */
export function isInsideGeofence(
  point: { lat: number; lon: number },
  fence: { lat: number; lon: number; radius_m: number },
): boolean {
  return haversineDistanceM(point.lat, point.lon, fence.lat, fence.lon) <= fence.radius_m;
}

/** IP adresinin son 2 oktet'ini maskele (KVKK) — 192.168.1.1 → 192.168.0.0 */
export function maskIp(ip: string): string {
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.0.0`;
  }
  // IPv6 — son 64 bit'i maskele
  if (ip.includes(':')) {
    const segments = ip.split(':');
    if (segments.length >= 4) {
      return segments.slice(0, 4).join(':') + '::';
    }
  }
  return ip;
}

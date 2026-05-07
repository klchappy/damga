import { useState } from 'react';

export interface GeoResult {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

export function useGeolocation() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState<GeoResult | null>(null);

  const getCurrent = (): Promise<GeoResult> => {
    return new Promise((resolve, reject) => {
      setLoading(true);
      setError(null);
      if (!navigator.geolocation) {
        const msg = 'Tarayıcı konum API desteklemiyor';
        setError(msg);
        setLoading(false);
        reject(new Error(msg));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const result: GeoResult = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: Math.round(pos.coords.accuracy),
            timestamp: pos.timestamp,
          };
          setPosition(result);
          setLoading(false);
          resolve(result);
        },
        (err) => {
          const msg =
            err.code === 1
              ? 'Konum erişimi reddedildi — ayarlardan izin ver'
              : err.code === 2
                ? 'Konum alınamadı — GPS açık mı?'
                : err.code === 3
                  ? 'Konum zaman aşımına uğradı'
                  : err.message;
          setError(msg);
          setLoading(false);
          reject(new Error(msg));
        },
        {
          enableHighAccuracy: true,
          timeout: 15_000,
          maximumAge: 0,
        },
      );
    });
  };

  return { loading, error, position, getCurrent };
}

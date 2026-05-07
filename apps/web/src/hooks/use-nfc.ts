import { useState } from 'react';

/**
 * Web NFC API — Android Chrome 89+ destekliyor.
 * iOS Safari desteklemiyor (Capacitor wrapper'da native plugin gerekecek).
 */
export interface NfcReadResult {
  serialNumber?: string;
  records: Array<{ recordType: string; mediaType?: string; data?: string }>;
  rawData: string;
}

export function useNfc() {
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supported] = useState<boolean>(typeof window !== 'undefined' && 'NDEFReader' in window);

  const read = (): Promise<NfcReadResult> => {
    return new Promise((resolve, reject) => {
      if (!supported) {
        const msg = 'Tarayıcınız NFC desteklemiyor (Android Chrome gerekli)';
        setError(msg);
        reject(new Error(msg));
        return;
      }
      setReading(true);
      setError(null);
      try {
        // @ts-expect-error - NDEFReader Web NFC API (henüz tüm tiplerde yok)
        const reader = new window.NDEFReader();
        const ctrl = new AbortController();
        const timeout = setTimeout(() => {
          ctrl.abort();
          setReading(false);
          const msg = 'NFC okuma zaman aşımı (30sn)';
          setError(msg);
          reject(new Error(msg));
        }, 30_000);

        void reader.scan({ signal: ctrl.signal }).then(() => {
          reader.onreading = (event: {
            serialNumber?: string;
            message: { records: Array<{ recordType: string; mediaType?: string; data: ArrayBuffer }> };
          }) => {
            clearTimeout(timeout);
            ctrl.abort();
            const decoder = new TextDecoder();
            const records = event.message.records.map((r) => ({
              recordType: r.recordType,
              mediaType: r.mediaType,
              data: r.data ? decoder.decode(r.data) : undefined,
            }));
            // Genelde tek text record olur — Damga payload'ı oradadır
            const rawData = records.find((r) => r.data)?.data ?? '';
            setReading(false);
            resolve({
              serialNumber: event.serialNumber,
              records,
              rawData,
            });
          };
          reader.onreadingerror = (e: Event) => {
            clearTimeout(timeout);
            ctrl.abort();
            setReading(false);
            const msg = 'NFC okuma hatası';
            setError(msg);
            reject(new Error(msg + ': ' + (e as ErrorEvent).message));
          };
        }).catch((err: Error) => {
          clearTimeout(timeout);
          setReading(false);
          setError(err.message);
          reject(err);
        });
      } catch (err) {
        setReading(false);
        const msg = err instanceof Error ? err.message : 'Bilinmeyen NFC hatası';
        setError(msg);
        reject(new Error(msg));
      }
    });
  };

  return { reading, error, supported, read };
}

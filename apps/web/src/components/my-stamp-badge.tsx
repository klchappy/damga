/**
 * Kullanıcının kişisel QR badge'i — profil sayfasında.
 *
 * "Yeni QR üret" butonu:
 *   POST /v1/me/stamp-credentials/generate → credential_value döner (sadece bu seferlik)
 *   Frontend QR'a çevirir + yazdırma butonu
 *
 * Eski credential'lar otomatik revoke edilir (revoke_existing=true).
 *
 * Kullanım: çalışan bu QR'ı yazdırıp cüzdanında taşır. Lokasyonda kiosk'a
 * gösterir → check-in/out otomatik.
 */
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import QRCode from 'qrcode';
import { Loader2, Printer, RefreshCw, ScanLine, ShieldOff } from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/hooks/use-auth';

interface CredentialRow {
  id: string;
  credential_type: string;
  credential_prefix: string;
  label: string | null;
  is_active: boolean;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export function MyStampBadge() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const org = useAuthStore((s) => s.org);
  const [freshValue, setFreshValue] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery<{ items: CredentialRow[] }>({
    queryKey: ['me', 'stamp-credentials'],
    queryFn: async () => (await api.get('/me/stamp-credentials')).data,
    staleTime: 30_000,
  });

  const active = (data?.items ?? []).find((c) => c.is_active && !c.revoked_at);

  const generateMut = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{
        credential_value: string;
        credential_prefix: string;
      }>('/me/stamp-credentials/generate', { revoke_existing: true });
      return data;
    },
    onSuccess: async (data) => {
      setFreshValue(data.credential_value);
      toast.success('Yeni QR üretildi — şimdi yazdır');
      qc.invalidateQueries({ queryKey: ['me', 'stamp-credentials'] });
      // QR oluştur
      try {
        const url = await QRCode.toDataURL(data.credential_value, {
          width: 480,
          margin: 2,
          errorCorrectionLevel: 'M',
        });
        setQrDataUrl(url);
      } catch (e) {
        toast.error('QR görseli oluşturulamadı');
      }
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  // İlk render'da aktif credential varsa kullanıcıya bildir (QR değeri gösteremeyiz, sadece prefix)
  useEffect(() => {
    if (!data) return;
  }, [data]);

  const handlePrint = () => {
    if (!printRef.current) return;
    const w = window.open('', '_blank', 'width=700,height=900');
    if (!w) return;
    w.document.write(`
      <html>
        <head>
          <title>Damga — ${user?.full_name ?? 'Kart'}</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; padding: 40px; }
            .card {
              max-width: 480px; margin: 0 auto; border: 2px solid #f97316;
              border-radius: 24px; padding: 32px; text-align: center;
            }
            h1 { color: #f97316; margin: 0 0 8px; }
            .org { color: #6b7280; font-size: 14px; margin-bottom: 24px; }
            .name { font-size: 24px; font-weight: bold; margin-top: 16px; }
            .role { color: #6b7280; font-size: 14px; }
            .qr { margin: 24px 0; }
            .note { font-size: 11px; color: #9ca3af; margin-top: 16px; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>DAMGA</h1>
            <div class="org">${org?.name ?? ''}</div>
            <img src="${qrDataUrl}" class="qr" />
            <div class="name">${user?.full_name ?? ''}</div>
            <div class="role">${(user as { title?: string })?.title ?? user?.role ?? ''}</div>
            <div class="note">
              Bu QR sadece sana özeldir. Kaybolursa profilden yeniden üret.<br>
              Sadece izin verilmiş lokasyonlarda geçerlidir.
            </div>
          </div>
          <script>setTimeout(() => window.print(), 300);</script>
        </body>
      </html>
    `);
    w.document.close();
  };

  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="size-10 rounded-lg bg-orange-100 text-orange-500 flex items-center justify-center shrink-0">
          <ScanLine className="size-5" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-ink">Kişisel damga QR'ım</h3>
          <p className="mt-1 text-sm text-muted">
            Lokasyondaki kiosk tabletinde KENDİ QR'ını okutarak giriş-çıkış yaparsın.
            Aşağıdaki butona basıp yazdırırsın, cüzdanında taşırsın.
          </p>
        </div>
      </div>

      {/* Mevcut credential durumu */}
      {active && !freshValue && (
        <div className="rounded-lg bg-white border border-orange-100 p-3 text-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-medium">Aktif kartın var</span>
            <span className="text-xs text-muted">#{active.credential_prefix.slice(0, 4)}…</span>
          </div>
          <div className="text-xs text-muted">
            {active.label && <>📌 {active.label} · </>}
            Oluşturma: {new Date(active.created_at).toLocaleDateString('tr-TR')}
            {active.last_used_at && (
              <> · Son kullanım: {new Date(active.last_used_at).toLocaleDateString('tr-TR')}</>
            )}
          </div>
          <p className="text-xs text-warning pt-1">
            <ShieldOff className="size-3 inline mr-1" />
            Güvenlik nedeniyle aktif QR değerini tekrar gösteremem. Kaybettiysen yeni üret.
          </p>
        </div>
      )}

      {/* Yeni üretilen QR'ı GÖSTER (tek seferlik) */}
      {freshValue && qrDataUrl && (
        <div className="rounded-lg bg-white border-2 border-orange-300 p-4 text-center space-y-3">
          <p className="text-sm font-semibold text-orange-600">
            ⚠️ Bu QR sadece şimdi görünür — yazdırıp kaydet
          </p>
          <img src={qrDataUrl} alt="Kişisel QR" className="mx-auto w-48 h-48" />
          <div>
            <div className="text-lg font-bold">{user?.full_name}</div>
            <div className="text-xs text-muted">{org?.name}</div>
          </div>
          <div className="flex gap-2 justify-center">
            <button type="button" onClick={handlePrint} className="btn-primary text-sm">
              <Printer className="size-4" />
              Yazdır
            </button>
            <button
              type="button"
              onClick={() => {
                setFreshValue(null);
                setQrDataUrl(null);
              }}
              className="btn-outline text-sm"
            >
              Kapat
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => generateMut.mutate()}
        disabled={generateMut.isPending}
        className="btn-primary w-full sm:w-auto"
      >
        {generateMut.isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <RefreshCw className="size-4" />
        )}
        {active ? 'Yeni QR üret (eskisini iptal et)' : 'İlk QR\'ımı üret'}
      </button>

      <div ref={printRef} className="hidden" />
    </div>
  );
}

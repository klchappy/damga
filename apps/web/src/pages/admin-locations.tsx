import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  MapPin,
  Smartphone,
  QrCode,
  Loader2,
  ChevronDown,
  ChevronUp,
  Eye,
  Download,
  Printer,
  Copy,
  Trash2,
  X,
  Clock,
  Tag as TagIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, getErrorMessage } from '@/lib/api';

interface Location {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  latitude: number;
  longitude: number;
  geofence_radius_m: number;
  wifi_bssids: string[];
  nfc_tag_ids: string[];
  qr_codes: string[];
  is_active: boolean;
}

interface NfcTag {
  id: string;
  location_id: string;
  tag_id: string;
  label: string | null;
  payload: string;
  created_at: string;
  last_used_at: string | null;
  is_active: boolean;
}

interface QrCodeRow {
  id: string;
  location_id: string;
  label: string | null;
  payload: string;
  ttl_days: number;
  expires_at: string | null;
  created_at: string;
  last_used_at: string | null;
  is_active: boolean;
}

export function AdminLocationsPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const { data, isLoading } = useQuery<{ items: Location[] }>({
    queryKey: ['locations'],
    queryFn: async () => (await api.get('/locations')).data,
  });

  return (
    <div className="container mx-auto max-w-5xl px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl">📍 Lokasyonlar & NFC/QR</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="size-4" /> Yeni Lokasyon
        </button>
      </div>

      {showCreate && (
        <CreateLocationCard
          onClose={() => setShowCreate(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: ['locations'] })}
        />
      )}

      {isLoading ? (
        <div className="card text-center text-muted">
          <Loader2 className="size-6 animate-spin mx-auto" />
        </div>
      ) : (data?.items ?? []).length === 0 ? (
        <div className="card text-center text-muted">
          Henüz lokasyon yok. "Yeni Lokasyon" ile başla.
        </div>
      ) : (
        <div className="space-y-3">
          {data!.items.map((loc) => (
            <LocationCard key={loc.id} loc={loc} />
          ))}
        </div>
      )}
    </div>
  );
}

function LocationCard({ loc }: { loc: Location }) {
  const qc = useQueryClient();
  const [openSection, setOpenSection] = useState<'nfc' | 'qr' | null>(null);
  const [viewing, setViewing] = useState<
    { kind: 'nfc'; row: NfcTag } | { kind: 'qr'; row: QrCodeRow } | null
  >(null);

  const nfcQuery = useQuery<{ items: NfcTag[] }>({
    queryKey: ['locations', loc.id, 'nfc-tags'],
    queryFn: async () => (await api.get(`/locations/${loc.id}/nfc-tags`)).data,
    enabled: openSection === 'nfc',
  });

  const qrQuery = useQuery<{ items: QrCodeRow[] }>({
    queryKey: ['locations', loc.id, 'qr-codes'],
    queryFn: async () => (await api.get(`/locations/${loc.id}/qr-codes`)).data,
    enabled: openSection === 'qr',
  });

  const nfcCreateMut = useMutation({
    mutationFn: async () => {
      const label = window.prompt('NFC tag etiketi (örn: "Ana giriş"):');
      if (!label) throw new Error('İptal');
      const { data } = await api.post(`/locations/${loc.id}/nfc-tags`, { label });
      return data;
    },
    onSuccess: (d) => {
      toast.success('✅ NFC tag oluşturuldu');
      void qc.invalidateQueries({ queryKey: ['locations'] });
      void qc.invalidateQueries({ queryKey: ['locations', loc.id, 'nfc-tags'] });
      setOpenSection('nfc');
      // Doğrudan modal'ı aç ki kullanıcı payload'ı tag'a yazabilsin
      if (d?.nfc_tag) setViewing({ kind: 'nfc', row: d.nfc_tag });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const qrCreateMut = useMutation({
    mutationFn: async () => {
      const label = window.prompt('QR kod etiketi:');
      if (!label) throw new Error('İptal');
      const { data } = await api.post(`/locations/${loc.id}/qr-codes`, {
        label,
        ttl_days: 90,
      });
      return data;
    },
    onSuccess: (d) => {
      toast.success('✅ QR kod oluşturuldu — yazdırılmaya hazır');
      void qc.invalidateQueries({ queryKey: ['locations'] });
      void qc.invalidateQueries({ queryKey: ['locations', loc.id, 'qr-codes'] });
      setOpenSection('qr');
      if (d?.qr_code) setViewing({ kind: 'qr', row: d.qr_code });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const nfcDeleteMut = useMutation({
    mutationFn: async (id: string) =>
      api.delete(`/locations/${loc.id}/nfc-tags/${id}`),
    onSuccess: () => {
      toast.success('NFC tag pasifleştirildi');
      void qc.invalidateQueries({ queryKey: ['locations'] });
      void qc.invalidateQueries({ queryKey: ['locations', loc.id, 'nfc-tags'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const qrDeleteMut = useMutation({
    mutationFn: async (id: string) =>
      api.delete(`/locations/${loc.id}/qr-codes/${id}`),
    onSuccess: () => {
      toast.success('QR kod pasifleştirildi');
      void qc.invalidateQueries({ queryKey: ['locations'] });
      void qc.invalidateQueries({ queryKey: ['locations', loc.id, 'qr-codes'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="card space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-display text-xl">{loc.name}</h3>
          <div className="text-sm text-muted flex items-center gap-1">
            <MapPin className="size-3.5" />
            {loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)} ·{' '}
            {loc.geofence_radius_m}m
            {loc.city && ` · ${loc.city}`}
          </div>
        </div>
        <span
          className={`chip ${
            loc.is_active ? 'bg-success/10 text-success' : 'bg-muted/10 text-muted'
          }`}
        >
          {loc.is_active ? 'aktif' : 'pasif'}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
        <button
          type="button"
          onClick={() => setOpenSection(openSection === 'nfc' ? null : 'nfc')}
          className={`rounded-md p-3 text-left transition flex items-center justify-between gap-2 ${
            openSection === 'nfc' ? 'bg-orange-100 ring-2 ring-orange-300' : 'bg-orange-50 hover:bg-orange-100'
          }`}
        >
          <div>
            <div className="text-xs text-muted mb-0.5">NFC tag'ler</div>
            <div className="font-mono font-semibold">{loc.nfc_tag_ids.length}</div>
          </div>
          {openSection === 'nfc' ? (
            <ChevronUp className="size-4 text-orange-500" />
          ) : (
            <ChevronDown className="size-4 text-orange-500" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setOpenSection(openSection === 'qr' ? null : 'qr')}
          className={`rounded-md p-3 text-left transition flex items-center justify-between gap-2 ${
            openSection === 'qr' ? 'bg-orange-100 ring-2 ring-orange-300' : 'bg-orange-50 hover:bg-orange-100'
          }`}
        >
          <div>
            <div className="text-xs text-muted mb-0.5">QR kodlar</div>
            <div className="font-mono font-semibold">{loc.qr_codes.length}</div>
          </div>
          {openSection === 'qr' ? (
            <ChevronUp className="size-4 text-orange-500" />
          ) : (
            <ChevronDown className="size-4 text-orange-500" />
          )}
        </button>
        <div className="rounded-md bg-orange-50 p-3">
          <div className="text-xs text-muted mb-0.5">WiFi BSSID</div>
          <div className="font-mono font-semibold">{loc.wifi_bssids.length}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => nfcCreateMut.mutate()}
          disabled={nfcCreateMut.isPending}
          className="btn-outline text-sm"
        >
          {nfcCreateMut.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Smartphone className="size-4" />
          )}{' '}
          NFC Tag Oluştur
        </button>
        <button
          onClick={() => qrCreateMut.mutate()}
          disabled={qrCreateMut.isPending}
          className="btn-outline text-sm"
        >
          {qrCreateMut.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <QrCode className="size-4" />
          )}{' '}
          QR Kod Oluştur
        </button>
      </div>

      {openSection === 'nfc' && (
        <div className="rounded-md border border-orange-100 bg-orange-50/40 p-3 space-y-2">
          <div className="text-xs font-medium uppercase tracking-wider text-orange-600 flex items-center gap-1.5">
            <Smartphone className="size-3.5" /> NFC Tag Listesi
          </div>
          {nfcQuery.isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="size-4 animate-spin text-orange-500" />
            </div>
          ) : (nfcQuery.data?.items ?? []).length === 0 ? (
            <div className="text-sm text-muted py-2">
              Henüz NFC tag yok. "NFC Tag Oluştur" ile başla.
            </div>
          ) : (
            <div className="space-y-1.5">
              {nfcQuery.data!.items.map((t) => (
                <ListRow
                  key={t.id}
                  label={t.label ?? t.tag_id}
                  meta={t.tag_id}
                  createdAt={t.created_at}
                  isActive={t.is_active}
                  onView={() => setViewing({ kind: 'nfc', row: t })}
                  onDelete={() =>
                    window.confirm(
                      `"${t.label ?? t.tag_id}" tag'ı pasifleştirilecek. Devam edilsin mi?`,
                    ) && nfcDeleteMut.mutate(t.id)
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}

      {openSection === 'qr' && (
        <div className="rounded-md border border-orange-100 bg-orange-50/40 p-3 space-y-2">
          <div className="text-xs font-medium uppercase tracking-wider text-orange-600 flex items-center gap-1.5">
            <QrCode className="size-3.5" /> QR Kod Listesi
          </div>
          {qrQuery.isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="size-4 animate-spin text-orange-500" />
            </div>
          ) : (qrQuery.data?.items ?? []).length === 0 ? (
            <div className="text-sm text-muted py-2">
              Henüz QR kod yok. "QR Kod Oluştur" ile başla.
            </div>
          ) : (
            <div className="space-y-1.5">
              {qrQuery.data!.items.map((q) => {
                const expired = q.expires_at && new Date(q.expires_at) < new Date();
                return (
                  <ListRow
                    key={q.id}
                    label={q.label ?? `QR · ${q.ttl_days}gün`}
                    meta={
                      q.expires_at
                        ? `Geçerli: ${new Date(q.expires_at).toLocaleDateString('tr-TR')}${
                            expired ? ' (süresi dolmuş)' : ''
                          }`
                        : `${q.ttl_days} gün`
                    }
                    createdAt={q.created_at}
                    isActive={q.is_active && !expired}
                    onView={() => setViewing({ kind: 'qr', row: q })}
                    onDelete={() =>
                      window.confirm(
                        `"${q.label ?? 'QR kod'}" pasifleştirilecek. Devam edilsin mi?`,
                      ) && qrDeleteMut.mutate(q.id)
                    }
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {viewing?.kind === 'nfc' && (
        <NfcViewModal
          tag={viewing.row}
          locationName={loc.name}
          onClose={() => setViewing(null)}
        />
      )}
      {viewing?.kind === 'qr' && (
        <QrViewModal
          qr={viewing.row}
          locationName={loc.name}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

function ListRow({
  label,
  meta,
  createdAt,
  isActive,
  onView,
  onDelete,
}: {
  label: string;
  meta: string;
  createdAt: string;
  isActive: boolean;
  onView: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-md border bg-white px-3 py-2 ${
        isActive ? 'border-orange-100' : 'border-muted/20 opacity-60'
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <TagIcon className="size-3 text-orange-500 shrink-0" />
          <span className="text-sm font-medium text-ink truncate">{label}</span>
          {!isActive && (
            <span className="chip bg-muted/10 text-muted text-[10px] px-1.5 py-0">pasif</span>
          )}
        </div>
        <div className="text-[11px] text-muted flex items-center gap-1.5 mt-0.5">
          <Clock className="size-3" />
          {new Date(createdAt).toLocaleString('tr-TR')}
          <span className="opacity-60">·</span>
          <span className="truncate">{meta}</span>
        </div>
      </div>
      <div className="flex gap-1 shrink-0">
        <button
          onClick={onView}
          className="btn-ghost p-1.5"
          title="Görüntüle / İndir"
          type="button"
        >
          <Eye className="size-4" />
        </button>
        <button
          onClick={onDelete}
          className="btn-ghost p-1.5 text-danger hover:bg-danger/10"
          title="Pasifleştir"
          type="button"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </div>
  );
}

function NfcViewModal({
  tag,
  locationName,
  onClose,
}: {
  tag: NfcTag;
  locationName: string;
  onClose: () => void;
}) {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(tag.payload);
      toast.success('Payload kopyalandı');
    } catch {
      toast.error('Kopyalanamadı');
    }
  };

  const handleDownload = () => {
    const blob = new Blob([tag.payload], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `damga-nfc-${tag.tag_id}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-3 py-4 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white shadow-2xl p-5 space-y-4 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="inline-flex items-center gap-1.5 text-orange-600 text-xs font-medium uppercase tracking-wider">
              <Smartphone className="size-3.5" /> NFC Tag
            </div>
            <h2 className="font-display text-xl mt-1">{tag.label ?? tag.tag_id}</h2>
            <p className="text-xs text-muted mt-0.5">{locationName}</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5 -mt-1 -mr-1" aria-label="Kapat">
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-2 text-sm">
          <div className="rounded-md bg-orange-50 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-muted">Tag ID</div>
            <div className="font-mono">{tag.tag_id}</div>
          </div>
          <div className="rounded-md bg-orange-50 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-muted">Oluşturuldu</div>
            <div>{new Date(tag.created_at).toLocaleString('tr-TR')}</div>
          </div>
        </div>

        <div>
          <div className="text-xs font-medium text-ink mb-1">
            NFC Payload (NFC Tools ile tag'a yaz)
          </div>
          <pre className="overflow-x-auto rounded-md border border-orange-100 bg-orange-50/40 p-3 text-xs font-mono whitespace-pre-wrap break-all">
            {tag.payload}
          </pre>
        </div>

        <div className="flex gap-2">
          <button onClick={handleCopy} className="btn-outline flex-1 text-sm">
            <Copy className="size-4" /> Kopyala
          </button>
          <button onClick={handleDownload} className="btn-primary flex-1 text-sm">
            <Download className="size-4" /> İndir (.txt)
          </button>
        </div>

        <div className="rounded-md bg-warning/5 border border-warning/20 px-3 py-2 text-[11px] text-muted">
          💡 Bu payload NFC tag içine yazılır. Android'de <strong className="text-ink">NFC Tools</strong>{' '}
          uygulaması ile "Yaz → Eklemek için yeni metin" → yapıştır → tag'a tut. Çalışan tap'ladığında
          otomatik check-in olur.
        </div>
      </div>
    </div>
  );
}

function QrViewModal({
  qr,
  locationName,
  onClose,
}: {
  qr: QrCodeRow;
  locationName: string;
  onClose: () => void;
}) {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(
    qr.payload,
  )}&margin=2&ecc=H&color=FF6B35&bgcolor=FFF4E8`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(qr.payload);
      toast.success('Payload kopyalandı');
    } catch {
      toast.error('Kopyalanamadı');
    }
  };

  const handlePrint = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`
      <!doctype html><html><head><title>${qr.label ?? 'QR'} — ${locationName}</title>
      <style>
        body{font-family:system-ui,sans-serif;background:#FFF4E8;color:#1a0e08;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:32px}
        .card{background:#fff;border:2px solid #FF6B35;border-radius:24px;padding:32px;text-align:center;max-width:520px;box-shadow:0 8px 32px rgba(255,107,53,.18)}
        h1{font-size:24px;margin:0 0 4px}
        h2{font-size:16px;color:#FF6B35;margin:0 0 24px;font-weight:600}
        img{width:340px;height:340px;display:block;margin:0 auto 16px}
        .meta{font-size:12px;color:rgba(26,14,8,.6);margin-top:16px}
        .brand{margin-top:24px;font-size:11px;letter-spacing:0.2em;color:rgba(26,14,8,.55);text-transform:uppercase}
      </style>
      </head><body>
      <div class="card">
        <h1>${qr.label ?? 'Damga QR'}</h1>
        <h2>${locationName}</h2>
        <img src="${qrUrl}" alt="QR" />
        <div class="meta">Geçerlilik: ${qr.expires_at ? new Date(qr.expires_at).toLocaleDateString('tr-TR') : qr.ttl_days + ' gün'}</div>
        <div class="brand">DAMGA · TARA → DAMGA VUR</div>
      </div>
      <script>window.onload=()=>{setTimeout(()=>window.print(),300)}</script>
      </body></html>
    `);
    w.document.close();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-3 py-4 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl p-5 space-y-4 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="inline-flex items-center gap-1.5 text-orange-600 text-xs font-medium uppercase tracking-wider">
              <QrCode className="size-3.5" /> QR Kod
            </div>
            <h2 className="font-display text-xl mt-1">{qr.label ?? 'QR Kod'}</h2>
            <p className="text-xs text-muted mt-0.5">{locationName}</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5 -mt-1 -mr-1" aria-label="Kapat">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex items-center justify-center bg-cream rounded-xl p-3">
          <img
            src={qrUrl}
            alt="QR Kod"
            className="w-72 h-72 rounded-md"
            crossOrigin="anonymous"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md bg-orange-50 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-muted">TTL</div>
            <div>{qr.ttl_days} gün</div>
          </div>
          <div className="rounded-md bg-orange-50 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-muted">Geçerlilik</div>
            <div>
              {qr.expires_at ? new Date(qr.expires_at).toLocaleDateString('tr-TR') : '—'}
            </div>
          </div>
        </div>

        <details className="text-xs">
          <summary className="cursor-pointer text-muted hover:text-orange-600">
            Payload göster (gelişmiş)
          </summary>
          <pre className="mt-1.5 overflow-x-auto rounded-md border border-orange-100 bg-orange-50/40 p-2 font-mono text-[11px] whitespace-pre-wrap break-all">
            {qr.payload}
          </pre>
        </details>

        <div className="flex gap-2">
          <button onClick={handleCopy} className="btn-outline text-sm">
            <Copy className="size-4" /> Kopyala
          </button>
          <button onClick={handlePrint} className="btn-outline flex-1 text-sm">
            <Printer className="size-4" /> Yazdır
          </button>
          <a
            href={qrUrl}
            download={`damga-qr-${qr.id}.png`}
            className="btn-primary flex-1 inline-flex items-center justify-center text-sm"
          >
            <Download className="size-4" /> İndir
          </a>
        </div>

        <div className="rounded-md bg-warning/5 border border-warning/20 px-3 py-2 text-[11px] text-muted">
          💡 QR'ı yazdır ve duvara astır. Çalışan kamerasıyla taradığında check-in başlar.
        </div>
      </div>
    </div>
  );
}

function CreateLocationCard({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [city, setCity] = useState('İstanbul');
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [radius, setRadius] = useState(100);

  const useMyLocation = () => {
    navigator.geolocation.getCurrentPosition((p) => {
      setLat(p.coords.latitude.toString());
      setLon(p.coords.longitude.toString());
      toast.success('Konum dolduruldu');
    });
  };

  const submit = async () => {
    try {
      await api.post('/locations', {
        name,
        city,
        latitude: parseFloat(lat),
        longitude: parseFloat(lon),
        geofence_radius_m: radius,
        wifi_bssids: [],
        nfc_tag_ids: [],
        qr_codes: [],
      });
      toast.success('✅ Lokasyon eklendi');
      onCreated();
      onClose();
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };

  return (
    <div className="card space-y-3">
      <h3 className="font-display text-xl">Yeni Lokasyon</h3>
      <div>
        <label className="label">Ad</label>
        <input
          className="input mt-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Merkez Ofis"
        />
      </div>
      <div>
        <label className="label">Şehir</label>
        <input className="input mt-1" value={city} onChange={(e) => setCity(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Latitude</label>
          <input
            className="input mt-1"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            placeholder="41.0082"
          />
        </div>
        <div>
          <label className="label">Longitude</label>
          <input
            className="input mt-1"
            value={lon}
            onChange={(e) => setLon(e.target.value)}
            placeholder="28.9784"
          />
        </div>
      </div>
      <button type="button" onClick={useMyLocation} className="btn-outline text-sm">
        📍 Şu anki konumumu al
      </button>
      <div>
        <label className="label">Geofence yarıçapı (metre)</label>
        <input
          type="number"
          className="input mt-1"
          value={radius}
          onChange={(e) => setRadius(parseInt(e.target.value))}
        />
      </div>
      <div className="flex gap-2">
        <button onClick={submit} className="btn-primary">
          Kaydet
        </button>
        <button onClick={onClose} className="btn-outline">
          İptal
        </button>
      </div>
    </div>
  );
}

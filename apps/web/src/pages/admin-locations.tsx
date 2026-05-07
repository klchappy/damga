import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, MapPin, Smartphone, QrCode, Loader2 } from 'lucide-react';
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
          {data!.items.map((loc) => <LocationCard key={loc.id} loc={loc} />)}
        </div>
      )}
    </div>
  );
}

function LocationCard({ loc }: { loc: Location }) {
  const [createdNfc, setCreatedNfc] = useState<{ tag_id: string; payload: string } | null>(null);
  const [createdQr, setCreatedQr] = useState<{ payload: string } | null>(null);

  const nfcMut = useMutation({
    mutationFn: async () => {
      const label = prompt('NFC tag etiketi (örn: "Ana giriş"):');
      if (!label) throw new Error('İptal');
      const { data } = await api.post(`/locations/${loc.id}/nfc-tags`, { label });
      return data;
    },
    onSuccess: (d) => {
      setCreatedNfc({ tag_id: d.tag_id, payload: d.nfc_payload });
      toast.success('✅ NFC tag oluşturuldu — payload\'ı tag\'a yaz');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const qrMut = useMutation({
    mutationFn: async () => {
      const label = prompt('QR kod etiketi:');
      if (!label) throw new Error('İptal');
      const { data } = await api.post(`/locations/${loc.id}/qr-codes`, { label, ttl_days: 90 });
      return data;
    },
    onSuccess: (d) => {
      setCreatedQr({ payload: d.qr_payload });
      toast.success('✅ QR kod oluşturuldu — yazdırılmaya hazır');
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
            {loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)} · {loc.geofence_radius_m}m
            {loc.city && ` · ${loc.city}`}
          </div>
        </div>
        <span className={`chip ${loc.is_active ? 'bg-success/10 text-success' : 'bg-muted/10 text-muted'}`}>
          {loc.is_active ? 'aktif' : 'pasif'}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
        <div className="rounded-md bg-orange-50 p-3">
          <div className="text-xs text-muted mb-1">NFC tag'ler</div>
          <div className="font-mono">{loc.nfc_tag_ids.length}</div>
        </div>
        <div className="rounded-md bg-orange-50 p-3">
          <div className="text-xs text-muted mb-1">QR kodlar</div>
          <div className="font-mono">{loc.qr_codes.length}</div>
        </div>
        <div className="rounded-md bg-orange-50 p-3">
          <div className="text-xs text-muted mb-1">WiFi BSSID</div>
          <div className="font-mono">{loc.wifi_bssids.length}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => nfcMut.mutate()} disabled={nfcMut.isPending} className="btn-outline text-sm">
          <Smartphone className="size-4" /> NFC Tag Oluştur
        </button>
        <button onClick={() => qrMut.mutate()} disabled={qrMut.isPending} className="btn-outline text-sm">
          <QrCode className="size-4" /> QR Kod Oluştur
        </button>
      </div>

      {createdNfc && (
        <div className="rounded-md border border-success/30 bg-success/5 p-3 text-sm space-y-2">
          <div className="font-medium">📱 NFC Tag oluşturuldu</div>
          <div>
            <strong>Tag ID:</strong> <code className="font-mono">{createdNfc.tag_id}</code>
          </div>
          <div>
            <strong>NFC payload</strong> (NFC Tools uygulamasıyla tag'a yaz):
            <pre className="mt-1 overflow-x-auto rounded bg-white p-2 text-xs">{createdNfc.payload}</pre>
          </div>
          <button
            onClick={() => navigator.clipboard.writeText(createdNfc.payload)}
            className="btn-outline text-xs"
          >
            📋 Kopyala
          </button>
        </div>
      )}

      {createdQr && (
        <div className="rounded-md border border-success/30 bg-success/5 p-3 text-sm space-y-2">
          <div className="font-medium">📷 QR Kod oluşturuldu</div>
          <div>
            <strong>QR payload</strong>:
            <pre className="mt-1 overflow-x-auto rounded bg-white p-2 text-xs">{createdQr.payload}</pre>
          </div>
          <a
            href={`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(createdQr.payload)}`}
            target="_blank"
            rel="noreferrer"
            className="btn-primary text-xs"
          >
            🖼️ QR görselini aç
          </a>
        </div>
      )}
    </div>
  );
}

function CreateLocationCard({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
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
        <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Merkez Ofis" />
      </div>
      <div>
        <label className="label">Şehir</label>
        <input className="input mt-1" value={city} onChange={(e) => setCity(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Latitude</label>
          <input className="input mt-1" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="41.0082" />
        </div>
        <div>
          <label className="label">Longitude</label>
          <input className="input mt-1" value={lon} onChange={(e) => setLon(e.target.value)} placeholder="28.9784" />
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

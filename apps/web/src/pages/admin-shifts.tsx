import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Clock,
  Plus,
  Pencil,
  Trash2,
  X,
  Loader2,
  MapPin,
  Coffee,
  Save,
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';

interface ShiftTemplate {
  id: string;
  org_id: string;
  location_id: string | null;
  name: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  color: string;
  overtime_threshold_minutes: number;
  is_active: boolean;
  location_name: string | null;
}

interface Location {
  id: string;
  name: string;
}

const PALETTE = [
  '#f97316',
  '#0ea5e9',
  '#10b981',
  '#a855f7',
  '#ef4444',
  '#facc15',
  '#06b6d4',
  '#ec4899',
];

export function AdminShiftsPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<ShiftTemplate | null>(null);
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery<{ items: ShiftTemplate[] }>({
    queryKey: ['admin', 'shifts'],
    queryFn: async () => (await api.get('/shifts?all=1')).data,
  });

  const { data: locs } = useQuery<{ items: Location[] }>({
    queryKey: ['locations'],
    queryFn: async () => (await api.get('/locations')).data,
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => api.delete(`/shifts/${id}`),
    onSuccess: () => {
      toast.success('🗑️ Vardiya pasifleştirildi');
      void qc.invalidateQueries({ queryKey: ['admin', 'shifts'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-orange-500 text-white">
            <Clock className="size-6" />
          </div>
          <div>
            <h1 className="font-display text-3xl">Vardiya Şablonları</h1>
            <p className="text-sm text-muted">
              Sabah/akşam/gece vardiyaları tanımla. Manager bunları çalışanlara atar.
            </p>
          </div>
        </div>
        <button onClick={() => setCreating(true)} className="btn-primary">
          <Plus className="size-4" />
          Yeni Vardiya
        </button>
      </div>

      {isLoading ? (
        <div className="card flex justify-center py-12">
          <Loader2 className="size-5 animate-spin text-orange-500" />
        </div>
      ) : (data?.items ?? []).length === 0 ? (
        <div className="card text-center py-10 text-muted">
          Henüz vardiya şablonu yok. "Yeni Vardiya" ile başla.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {data!.items.map((s) => (
            <div
              key={s.id}
              className="card space-y-2 relative overflow-hidden"
              style={{ borderTop: `4px solid ${s.color}` }}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-display text-xl">{s.name}</h3>
                  <div className="flex items-center gap-2 text-sm text-muted mt-0.5">
                    <Clock className="size-3.5" />
                    {s.start_time} – {s.end_time}
                    {s.end_time <= s.start_time && (
                      <span className="text-[10px] bg-orange-100 text-orange-500 px-1.5 py-0.5 rounded">
                        gece
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-muted mt-1">
                    {s.location_name && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3" /> {s.location_name}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <Coffee className="size-3" /> {s.break_minutes}dk mola
                    </span>
                    <span className="inline-flex items-center gap-1">
                      ⏰ +{s.overtime_threshold_minutes}dk eşik
                    </span>
                  </div>
                </div>
                {!s.is_active && (
                  <span className="chip bg-muted/10 text-muted text-[10px]">pasif</span>
                )}
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setEditing(s)}
                  className="btn-outline flex-1 text-xs"
                >
                  <Pencil className="size-3.5" /> Düzenle
                </button>
                <button
                  onClick={() => {
                    if (confirm(`"${s.name}" vardiyasını pasifleştirmek istediğine emin misin?`)) {
                      delMut.mutate(s.id);
                    }
                  }}
                  disabled={delMut.isPending}
                  className="btn-outline border-danger/30 text-danger hover:bg-danger/5 text-xs"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(editing || creating) && (
        <ShiftFormModal
          shift={editing}
          locations={locs?.items ?? []}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSaved={() => {
            void qc.invalidateQueries({ queryKey: ['admin', 'shifts'] });
            setEditing(null);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}

function ShiftFormModal({
  shift,
  locations,
  onClose,
  onSaved,
}: {
  shift: ShiftTemplate | null;
  locations: Location[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: shift?.name ?? '',
    location_id: shift?.location_id ?? '',
    start_time: shift?.start_time ?? '09:00',
    end_time: shift?.end_time ?? '18:00',
    break_minutes: shift?.break_minutes ?? 60,
    color: shift?.color ?? '#f97316',
    overtime_threshold_minutes: shift?.overtime_threshold_minutes ?? 15,
  });

  const mut = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        location_id: form.location_id || null,
        start_time: form.start_time,
        end_time: form.end_time,
        break_minutes: Number(form.break_minutes),
        color: form.color,
        overtime_threshold_minutes: Number(form.overtime_threshold_minutes),
      };
      if (shift) return api.patch(`/shifts/${shift.id}`, payload);
      return api.post('/shifts', payload);
    },
    onSuccess: () => {
      toast.success(shift ? '✏️ Vardiya güncellendi' : '✅ Vardiya oluşturuldu');
      onSaved();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-3 py-4 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md card space-y-4 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h3 className="font-display text-xl">
            {shift ? 'Vardiyayı düzenle' : 'Yeni vardiya'}
          </h3>
          <button onClick={onClose} className="btn-ghost p-1.5">
            <X className="size-4" />
          </button>
        </div>

        <div>
          <label className="label">Vardiya adı</label>
          <input
            className="input mt-1"
            placeholder="Sabah Vardiyası"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>

        <div>
          <label className="label">Lokasyon (opsiyonel)</label>
          <select
            className="input mt-1"
            value={form.location_id}
            onChange={(e) => setForm({ ...form, location_id: e.target.value })}
          >
            <option value="">Tüm lokasyonlar</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Başlangıç</label>
            <input
              type="time"
              className="input mt-1"
              value={form.start_time}
              onChange={(e) => setForm({ ...form, start_time: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Bitiş</label>
            <input
              type="time"
              className="input mt-1"
              value={form.end_time}
              onChange={(e) => setForm({ ...form, end_time: e.target.value })}
            />
            {form.end_time <= form.start_time && (
              <p className="text-[10px] text-orange-600 mt-1">
                Gece vardiyası (ertesi gün biter)
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Mola (dk)</label>
            <input
              type="number"
              min={0}
              max={240}
              className="input mt-1"
              value={form.break_minutes}
              onChange={(e) =>
                setForm({ ...form, break_minutes: Number(e.target.value) })
              }
            />
          </div>
          <div>
            <label className="label">Fazla mesai eşiği (dk)</label>
            <input
              type="number"
              min={0}
              max={120}
              className="input mt-1"
              value={form.overtime_threshold_minutes}
              onChange={(e) =>
                setForm({
                  ...form,
                  overtime_threshold_minutes: Number(e.target.value),
                })
              }
            />
          </div>
        </div>

        <div>
          <label className="label">Renk</label>
          <div className="flex gap-2 mt-1 flex-wrap">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setForm({ ...form, color: c })}
                className={`size-8 rounded-full border-2 transition ${
                  form.color === c ? 'border-ink scale-110' : 'border-transparent'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="btn-outline flex-1" disabled={mut.isPending}>
            İptal
          </button>
          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || form.name.trim().length < 2}
            className="btn-primary flex-1"
          >
            {mut.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Kaydet
          </button>
        </div>
      </div>
    </div>
  );
}

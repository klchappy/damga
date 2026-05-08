import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2, Pencil, Save, X } from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';

interface Department {
  id: string;
  name: string;
  slug: string;
  color: string;
  is_default: boolean;
  created_at: string;
}

const DEFAULT_COLORS = [
  '#FF6B35', // damga orange
  '#10B981', // emerald
  '#3B82F6', // blue
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#F59E0B', // amber
  '#06B6D4', // cyan
  '#9CA3AF', // gray
];

export function AdminDepartmentsPage() {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ items: Department[] }>({
    queryKey: ['departments'],
    queryFn: async () => (await api.get('/departments')).data,
  });

  const createMut = useMutation({
    mutationFn: async (input: { name: string; color: string }) =>
      (await api.post('/departments', input)).data,
    onSuccess: () => {
      toast.success('✓ Departman eklendi');
      qc.invalidateQueries({ queryKey: ['departments'] });
      setAdding(false);
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, ...input }: { id: string; name: string; color: string }) =>
      (await api.patch(`/departments/${id}`, input)).data,
    onSuccess: () => {
      toast.success('✓ Güncellendi');
      qc.invalidateQueries({ queryKey: ['departments'] });
      setEditingId(null);
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/departments/${id}`)).data,
    onSuccess: () => {
      toast.success('Silindi (kullananlar Diğer\'e taşındı)');
      qc.invalidateQueries({ queryKey: ['departments'] });
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl">🏷️ Departmanlar</h1>
          <p className="text-sm text-muted">
            Şirketinin departman listesi. "Diğer" silinemez (fallback).
          </p>
        </div>
        {!adding && (
          <button onClick={() => setAdding(true)} className="btn-primary">
            <Plus className="size-4" /> Yeni Departman
          </button>
        )}
      </div>

      {adding && (
        <AddForm
          onCancel={() => setAdding(false)}
          onSubmit={(input) => createMut.mutate(input)}
          loading={createMut.isPending}
        />
      )}

      {isLoading ? (
        <div className="card text-center text-muted">Yükleniyor…</div>
      ) : (
        <div className="space-y-2">
          {(data?.items ?? []).map((d) =>
            editingId === d.id ? (
              <EditForm
                key={d.id}
                dept={d}
                onCancel={() => setEditingId(null)}
                onSubmit={(input) => updateMut.mutate({ id: d.id, ...input })}
                loading={updateMut.isPending}
              />
            ) : (
              <div key={d.id} className="card flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="h-10 w-10 rounded-md flex items-center justify-center font-display font-semibold text-white"
                    style={{ background: d.color }}
                  >
                    {d.name.charAt(0)}
                  </div>
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      {d.name}
                      {d.is_default && (
                        <span className="chip bg-orange-50 text-orange-600 text-[10px]">default</span>
                      )}
                    </div>
                    <div className="text-xs text-muted font-mono">{d.slug}</div>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setEditingId(d.id)} className="btn-ghost p-1.5">
                    <Pencil className="size-4" />
                  </button>
                  {d.slug !== 'diger' && (
                    <button
                      onClick={() =>
                        confirm(`${d.name} silinsin mi? Kullanan çalışanlar "Diğer"e taşınır.`) &&
                        deleteMut.mutate(d.id)
                      }
                      className="btn-ghost p-1.5"
                    >
                      <Trash2 className="size-4 text-danger" />
                    </button>
                  )}
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}

function AddForm({
  onCancel,
  onSubmit,
  loading,
}: {
  onCancel: () => void;
  onSubmit: (input: { name: string; color: string }) => void;
  loading: boolean;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(DEFAULT_COLORS[0]);

  return (
    <div className="card space-y-3">
      <h3 className="font-display text-lg">Yeni Departman</h3>
      <div>
        <label className="label">İsim</label>
        <input
          className="input mt-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Örn: Pazarlama, İK, Üretim"
        />
      </div>
      <div>
        <label className="label">Renk</label>
        <div className="flex gap-2 mt-1 flex-wrap">
          {DEFAULT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`h-8 w-8 rounded-md ${color === c ? 'ring-2 ring-offset-2 ring-orange-500' : ''}`}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onSubmit({ name, color: color! })}
          disabled={loading || !name.trim()}
          className="btn-primary"
        >
          <Save className="size-4" /> Ekle
        </button>
        <button onClick={onCancel} className="btn-outline">
          <X className="size-4" /> İptal
        </button>
      </div>
    </div>
  );
}

function EditForm({
  dept,
  onCancel,
  onSubmit,
  loading,
}: {
  dept: Department;
  onCancel: () => void;
  onSubmit: (input: { name: string; color: string }) => void;
  loading: boolean;
}) {
  const [name, setName] = useState(dept.name);
  const [color, setColor] = useState(dept.color);

  return (
    <div className="card space-y-3 border-orange-300">
      <div>
        <label className="label">İsim</label>
        <input
          className="input mt-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div>
        <label className="label">Renk</label>
        <div className="flex gap-2 mt-1 flex-wrap">
          {DEFAULT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`h-8 w-8 rounded-md ${color === c ? 'ring-2 ring-offset-2 ring-orange-500' : ''}`}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onSubmit({ name, color })}
          disabled={loading || !name.trim()}
          className="btn-primary"
        >
          <Save className="size-4" /> Kaydet
        </button>
        <button onClick={onCancel} className="btn-outline">
          <X className="size-4" /> İptal
        </button>
      </div>
    </div>
  );
}

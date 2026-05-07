import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Trash2, Plus, Copy } from 'lucide-react';
import { API_SCOPES } from '@damga/shared';
import { api, getErrorMessage } from '@/lib/api';

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  rate_limit_per_min: number;
  last_used_at: string | null;
  is_active: boolean;
  created_at: string;
}

export function AdminApiKeysPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);

  const { data } = useQuery<{ items: ApiKey[] }>({
    queryKey: ['admin', 'api-keys'],
    queryFn: async () => (await api.get('/api-keys')).data,
  });

  const createMut = useMutation({
    mutationFn: async (input: { name: string; scopes: string[] }) =>
      (await api.post('/api-keys', { ...input, rate_limit_per_min: 100 })).data,
    onSuccess: (d) => {
      setCreatedSecret(d.secret_key);
      setShowCreate(false);
      qc.invalidateQueries({ queryKey: ['admin', 'api-keys'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => api.delete(`/api-keys/${id}`),
    onSuccess: () => {
      toast.success('Silindi');
      qc.invalidateQueries({ queryKey: ['admin', 'api-keys'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl">🔑 API Anahtarları</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="size-4" /> Yeni Key
        </button>
      </div>

      {createdSecret && (
        <div className="card border-success/40 bg-success/5 space-y-2">
          <div className="font-medium">✅ API Key oluşturuldu — bir daha gösterilmeyecek</div>
          <div className="font-mono text-xs break-all bg-white p-2 rounded">{createdSecret}</div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                navigator.clipboard.writeText(createdSecret);
                toast.success('Kopyalandı');
              }}
              className="btn-outline text-xs"
            >
              <Copy className="size-3.5" /> Kopyala
            </button>
            <button onClick={() => setCreatedSecret(null)} className="btn-ghost text-xs">
              Kapat
            </button>
          </div>
        </div>
      )}

      {showCreate && (
        <CreateForm
          onCancel={() => setShowCreate(false)}
          onSubmit={(input) => createMut.mutate(input)}
          loading={createMut.isPending}
        />
      )}

      {(data?.items ?? []).length === 0 ? (
        <div className="card text-center text-muted">Henüz API key yok.</div>
      ) : (
        <div className="space-y-2">
          {data!.items.map((k) => (
            <div key={k.id} className="card flex items-center justify-between">
              <div>
                <div className="font-medium">{k.name}</div>
                <div className="text-xs text-muted font-mono">
                  {k.key_prefix} · {k.scopes.join(', ')}
                </div>
                <div className="text-xs text-muted">
                  Son kullanım: {k.last_used_at ? new Date(k.last_used_at).toLocaleString('tr-TR') : 'hiç'}
                </div>
              </div>
              <button
                onClick={() => confirm(`${k.name} silinsin mi?`) && deleteMut.mutate(k.id)}
                className="btn-ghost text-danger"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateForm({
  onCancel,
  onSubmit,
  loading,
}: {
  onCancel: () => void;
  onSubmit: (input: { name: string; scopes: string[] }) => void;
  loading: boolean;
}) {
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set(['events:read']));

  return (
    <div className="card space-y-3">
      <h3 className="font-display text-xl">Yeni API Key</h3>
      <div>
        <label className="label">İsim</label>
        <input
          className="input mt-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Bordro Entegrasyonu"
        />
      </div>
      <div>
        <label className="label">Yetkiler (scopes)</label>
        <div className="grid grid-cols-2 gap-1 mt-1">
          {API_SCOPES.map((s) => (
            <label key={s} className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={selected.has(s)}
                onChange={(e) => {
                  const next = new Set(selected);
                  if (e.target.checked) next.add(s);
                  else next.delete(s);
                  setSelected(next);
                }}
              />
              <span className="font-mono text-xs">{s}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onSubmit({ name, scopes: [...selected] })}
          disabled={loading || !name || selected.size === 0}
          className="btn-primary"
        >
          Oluştur
        </button>
        <button onClick={onCancel} className="btn-outline">
          İptal
        </button>
      </div>
    </div>
  );
}

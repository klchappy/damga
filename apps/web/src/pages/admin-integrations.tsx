import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Activity,
  CheckCircle2,
  Copy,
  Key,
  Mail,
  Plug,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2,
  Webhook,
  XCircle,
} from 'lucide-react';
import { API_SCOPES } from '@damga/shared';
import { api, getErrorMessage } from '@/lib/api';

const WEBHOOK_EVENTS = [
  'check_in.created',
  'check_out.created',
  'leave.created',
  'leave.approved',
  'leave.rejected',
  'mood.created',
  'announcement.published',
  'user.created',
  'user.deactivated',
  'event.disputed',
  'event.edited',
] as const;

interface IntegrationStatus {
  endpoints: {
    api_base_url: string;
    app_url: string;
    docs_url: string;
  };
  counts: {
    active_api_keys: number;
    active_webhooks: number;
  };
  services: Record<'database' | 'supabase' | 'resend' | 'redis' | 'web_push', boolean>;
  mail: {
    from: string;
    contact: string;
    support: string;
    kvkk: string;
  };
}

interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  rate_limit_per_min: number;
  last_used_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

interface WebhookRow {
  id: string;
  url: string;
  events: string[];
  is_active: boolean;
  failure_count: number;
  last_failure_at: string | null;
  last_failure_reason: string | null;
  created_at: string;
}

type ApiKeyDraft = {
  name: string;
  scopes: string[];
  rate_limit_per_min: number;
  is_active: boolean;
};

type WebhookDraft = {
  url: string;
  events: string[];
  is_active: boolean;
};

const defaultKeyDraft: ApiKeyDraft = {
  name: '',
  scopes: ['events:read'],
  rate_limit_per_min: 100,
  is_active: true,
};

const defaultWebhookDraft: WebhookDraft = {
  url: '',
  events: ['check_in.created'],
  is_active: true,
};

export function AdminIntegrationsPage() {
  const qc = useQueryClient();
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [createdWebhookSecret, setCreatedWebhookSecret] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<ApiKeyDraft>(defaultKeyDraft);
  const [newWebhook, setNewWebhook] = useState<WebhookDraft>(defaultWebhookDraft);
  const [editingKeyId, setEditingKeyId] = useState<string | null>(null);
  const [editingWebhookId, setEditingWebhookId] = useState<string | null>(null);
  const [keyDrafts, setKeyDrafts] = useState<Record<string, ApiKeyDraft>>({});
  const [webhookDrafts, setWebhookDrafts] = useState<Record<string, WebhookDraft>>({});

  const statusQuery = useQuery<IntegrationStatus>({
    queryKey: ['admin', 'integrations', 'status'],
    queryFn: async () => (await api.get('/integrations/status')).data,
  });

  const apiKeysQuery = useQuery<{ items: ApiKeyRow[] }>({
    queryKey: ['admin', 'api-keys'],
    queryFn: async () => (await api.get('/api-keys')).data,
  });

  const webhooksQuery = useQuery<{ items: WebhookRow[] }>({
    queryKey: ['admin', 'webhooks'],
    queryFn: async () => (await api.get('/webhooks')).data,
  });

  const createKey = useMutation({
    mutationFn: async (draft: ApiKeyDraft) =>
      (
        await api.post('/api-keys', {
          name: draft.name,
          scopes: draft.scopes,
          rate_limit_per_min: draft.rate_limit_per_min,
        })
      ).data,
    onSuccess: (data) => {
      setCreatedSecret(data.secret_key);
      setNewKey(defaultKeyDraft);
      invalidateAll(qc);
      toast.success('API key olusturuldu');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const updateKey = useMutation({
    mutationFn: async ({ id, draft }: { id: string; draft: ApiKeyDraft }) =>
      api.patch(`/api-keys/${id}`, draft),
    onSuccess: () => {
      setEditingKeyId(null);
      invalidateAll(qc);
      toast.success('API key guncellendi');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const deleteKey = useMutation({
    mutationFn: async (id: string) => api.delete(`/api-keys/${id}`),
    onSuccess: () => {
      invalidateAll(qc);
      toast.success('API key silindi');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const createWebhook = useMutation({
    mutationFn: async (draft: WebhookDraft) =>
      (
        await api.post('/webhooks', {
          url: draft.url,
          events: draft.events,
        })
      ).data,
    onSuccess: (data) => {
      setCreatedWebhookSecret(data.secret);
      setNewWebhook(defaultWebhookDraft);
      invalidateAll(qc);
      toast.success('Webhook olusturuldu');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const updateWebhook = useMutation({
    mutationFn: async ({ id, draft }: { id: string; draft: WebhookDraft }) =>
      api.patch(`/webhooks/${id}`, draft),
    onSuccess: () => {
      setEditingWebhookId(null);
      invalidateAll(qc);
      toast.success('Webhook guncellendi');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const deleteWebhook = useMutation({
    mutationFn: async (id: string) => api.delete(`/webhooks/${id}`),
    onSuccess: () => {
      invalidateAll(qc);
      toast.success('Webhook silindi');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const testWebhook = useMutation({
    mutationFn: async (id: string) => api.post(`/webhooks/${id}/test`),
    onSuccess: () => toast.success('Test webhook kuyruğa alindi'),
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const loading = statusQuery.isLoading || apiKeysQuery.isLoading || webhooksQuery.isLoading;
  const apiKeys = apiKeysQuery.data?.items ?? [];
  const webhooks = webhooksQuery.data?.items ?? [];

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6 space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-lg bg-orange-500 text-white">
            <Plug className="size-6" />
          </div>
          <div>
            <h1 className="font-display text-3xl">Entegrasyonlar</h1>
            <p className="text-sm text-muted">
              API anahtarlari, webhooklar ve servis durumlari tek ekranda.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => invalidateAll(qc)}
          className="btn-outline"
          disabled={loading}
        >
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          Yenile
        </button>
      </div>

      <StatusPanel status={statusQuery.data} />

      {createdSecret && (
        <SecretBox
          title="API key olusturuldu"
          value={createdSecret}
          onClose={() => setCreatedSecret(null)}
        />
      )}

      {createdWebhookSecret && (
        <SecretBox
          title="Webhook secret olusturuldu"
          value={createdWebhookSecret}
          onClose={() => setCreatedWebhookSecret(null)}
        />
      )}

      <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-4">
        <div className="card space-y-4">
          <SectionTitle icon={<Key className="size-5" />} title="API Key Yonetimi" />
          {apiKeys.length === 0 ? (
            <div className="rounded-md border border-dashed border-orange-200 p-4 text-sm text-muted">
              Henuz API key yok. Harici sistemleri baglamak icin sagdaki formdan olustur.
            </div>
          ) : (
            <div className="space-y-3">
              {apiKeys.map((row) => {
                const isEditing = editingKeyId === row.id;
                const draft = keyDrafts[row.id] ?? keyToDraft(row);
                return (
                  <div key={row.id} className="rounded-lg border border-orange-100 p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium">{row.name}</div>
                        <div className="font-mono text-xs text-muted break-all">
                          {row.key_prefix}... · {row.scopes.join(', ')}
                        </div>
                        <div className="mt-1 text-xs text-muted">
                          Son kullanim:{' '}
                          {row.last_used_at ? new Date(row.last_used_at).toLocaleString('tr-TR') : 'hic'}
                        </div>
                      </div>
                      <StatusBadge active={row.is_active} />
                    </div>

                    {isEditing && (
                      <ApiKeyForm draft={draft} onChange={(next) => setKeyDrafts({ ...keyDrafts, [row.id]: next })} />
                    )}

                    <div className="flex flex-wrap gap-2">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            className="btn-primary text-sm"
                            onClick={() => updateKey.mutate({ id: row.id, draft })}
                            disabled={updateKey.isPending || draft.name.trim().length < 2}
                          >
                            <Save className="size-4" />
                            Kaydet
                          </button>
                          <button
                            type="button"
                            className="btn-outline text-sm"
                            onClick={() => setEditingKeyId(null)}
                          >
                            Vazgec
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="btn-outline text-sm"
                          onClick={() => {
                            setKeyDrafts({ ...keyDrafts, [row.id]: keyToDraft(row) });
                            setEditingKeyId(row.id);
                          }}
                        >
                          Duzenle
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-ghost text-sm text-danger"
                        onClick={() => confirm(`${row.name} silinsin mi?`) && deleteKey.mutate(row.id)}
                        disabled={deleteKey.isPending}
                      >
                        <Trash2 className="size-4" />
                        Sil
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card space-y-4">
          <SectionTitle icon={<Plus className="size-5" />} title="Yeni API Key" />
          <ApiKeyForm draft={newKey} onChange={setNewKey} />
          <button
            type="button"
            className="btn-primary w-full"
            onClick={() => createKey.mutate(newKey)}
            disabled={createKey.isPending || newKey.name.trim().length < 2 || newKey.scopes.length === 0}
          >
            <Plus className="size-4" />
            Olustur
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-4">
        <div className="card space-y-4">
          <SectionTitle icon={<Webhook className="size-5" />} title="Webhook Yonetimi" />
          {webhooks.length === 0 ? (
            <div className="rounded-md border border-dashed border-orange-200 p-4 text-sm text-muted">
              Henuz webhook yok. Damga olaylarini baska sistemlere aktarmak icin endpoint ekle.
            </div>
          ) : (
            <div className="space-y-3">
              {webhooks.map((row) => {
                const isEditing = editingWebhookId === row.id;
                const draft = webhookDrafts[row.id] ?? webhookToDraft(row);
                return (
                  <div key={row.id} className="rounded-lg border border-orange-100 p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-mono text-xs break-all">{row.url}</div>
                        <div className="mt-1 text-xs text-muted">{row.events.join(', ')}</div>
                        {row.last_failure_reason && (
                          <div className="mt-1 text-xs text-danger break-words">
                            Son hata: {row.last_failure_reason}
                          </div>
                        )}
                      </div>
                      <StatusBadge active={row.is_active} />
                    </div>

                    {isEditing && (
                      <WebhookForm
                        draft={draft}
                        onChange={(next) =>
                          setWebhookDrafts({ ...webhookDrafts, [row.id]: next })
                        }
                      />
                    )}

                    <div className="flex flex-wrap gap-2">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            className="btn-primary text-sm"
                            onClick={() => updateWebhook.mutate({ id: row.id, draft })}
                            disabled={updateWebhook.isPending || !draft.url || draft.events.length === 0}
                          >
                            <Save className="size-4" />
                            Kaydet
                          </button>
                          <button
                            type="button"
                            className="btn-outline text-sm"
                            onClick={() => setEditingWebhookId(null)}
                          >
                            Vazgec
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="btn-outline text-sm"
                          onClick={() => {
                            setWebhookDrafts({ ...webhookDrafts, [row.id]: webhookToDraft(row) });
                            setEditingWebhookId(row.id);
                          }}
                        >
                          Duzenle
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-outline text-sm"
                        onClick={() => testWebhook.mutate(row.id)}
                        disabled={testWebhook.isPending}
                      >
                        <Send className="size-4" />
                        Test
                      </button>
                      <button
                        type="button"
                        className="btn-ghost text-sm text-danger"
                        onClick={() => confirm('Webhook silinsin mi?') && deleteWebhook.mutate(row.id)}
                        disabled={deleteWebhook.isPending}
                      >
                        <Trash2 className="size-4" />
                        Sil
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card space-y-4">
          <SectionTitle icon={<Plus className="size-5" />} title="Yeni Webhook" />
          <WebhookForm draft={newWebhook} onChange={setNewWebhook} />
          <button
            type="button"
            className="btn-primary w-full"
            onClick={() => createWebhook.mutate(newWebhook)}
            disabled={createWebhook.isPending || !newWebhook.url || newWebhook.events.length === 0}
          >
            <Plus className="size-4" />
            Olustur
          </button>
        </div>
      </section>
    </div>
  );
}

function StatusPanel({ status }: { status?: IntegrationStatus }) {
  const serviceRows = useMemo(
    () =>
      status
        ? [
            ['Database', status.services.database],
            ['Supabase', status.services.supabase],
            ['Resend', status.services.resend],
            ['Redis', status.services.redis],
            ['Web Push', status.services.web_push],
          ]
        : [],
    [status],
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      <div className="card space-y-3">
        <SectionTitle icon={<Activity className="size-5" />} title="Servis Durumu" />
        <div className="space-y-2">
          {serviceRows.map(([label, ok]) => (
            <div key={String(label)} className="flex items-center justify-between rounded-md bg-cream p-2 text-sm">
              <span>{label}</span>
              <span className={ok ? 'text-success' : 'text-warning'}>
                {ok ? 'hazir' : 'eksik'}
              </span>
            </div>
          ))}
          {!status && <div className="text-sm text-muted">Yukleniyor...</div>}
        </div>
      </div>

      <div className="card space-y-3">
        <SectionTitle icon={<Plug className="size-5" />} title="Endpointler" />
        <CopyLine label="API" value={status?.endpoints.api_base_url ?? '...'} />
        <CopyLine label="Uygulama" value={status?.endpoints.app_url ?? '...'} />
        <CopyLine label="Dokuman" value={status?.endpoints.docs_url ?? '...'} />
      </div>

      <div className="card space-y-3">
        <SectionTitle icon={<Mail className="size-5" />} title="Mail Adresleri" />
        <CopyLine label="Gonderen" value={status?.mail.from ?? '...'} />
        <CopyLine label="Iletisim" value={status?.mail.contact ?? '...'} />
        <CopyLine label="Destek" value={status?.mail.support ?? '...'} />
        <CopyLine label="KVKK" value={status?.mail.kvkk ?? '...'} />
      </div>
    </div>
  );
}

function ApiKeyForm({ draft, onChange }: { draft: ApiKeyDraft; onChange: (draft: ApiKeyDraft) => void }) {
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="label">Isim</span>
        <input
          className="input mt-1"
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          placeholder="Bordro entegrasyonu"
        />
      </label>
      <label className="block">
        <span className="label">Dakika limiti</span>
        <input
          className="input mt-1"
          type="number"
          min={1}
          max={10_000}
          value={draft.rate_limit_per_min}
          onChange={(e) =>
            onChange({ ...draft, rate_limit_per_min: Number(e.target.value) || 1 })
          }
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={draft.is_active}
          onChange={(e) => onChange({ ...draft, is_active: e.target.checked })}
        />
        Aktif
      </label>
      <CheckboxGrid
        items={[...API_SCOPES]}
        selected={draft.scopes}
        onChange={(scopes) => onChange({ ...draft, scopes })}
      />
    </div>
  );
}

function WebhookForm({ draft, onChange }: { draft: WebhookDraft; onChange: (draft: WebhookDraft) => void }) {
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="label">Endpoint URL</span>
        <input
          className="input mt-1"
          value={draft.url}
          onChange={(e) => onChange({ ...draft, url: e.target.value })}
          placeholder="https://example.com/damga/webhook"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={draft.is_active}
          onChange={(e) => onChange({ ...draft, is_active: e.target.checked })}
        />
        Aktif
      </label>
      <CheckboxGrid
        items={[...WEBHOOK_EVENTS]}
        selected={draft.events}
        onChange={(events) => onChange({ ...draft, events })}
      />
    </div>
  );
}

function CheckboxGrid({
  items,
  selected,
  onChange,
}: {
  items: string[];
  selected: string[];
  onChange: (items: string[]) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {items.map((item) => (
        <label key={item} className="flex items-center gap-2 rounded-md border border-orange-100 p-2 text-xs">
          <input
            type="checkbox"
            checked={selected.includes(item)}
            onChange={(e) => {
              const next = e.target.checked
                ? [...selected, item]
                : selected.filter((value) => value !== item);
              onChange([...new Set(next)]);
            }}
          />
          <span className="font-mono break-all">{item}</span>
        </label>
      ))}
    </div>
  );
}

function SecretBox({
  title,
  value,
  onClose,
}: {
  title: string;
  value: string;
  onClose: () => void;
}) {
  return (
    <div className="card border-success/40 bg-success/5 space-y-3">
      <div className="font-medium">{title} - bir daha gosterilmeyecek</div>
      <div className="rounded-md bg-white p-3 font-mono text-xs break-all">{value}</div>
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-outline text-sm"
          onClick={() => {
            void navigator.clipboard.writeText(value);
            toast.success('Kopyalandi');
          }}
        >
          <Copy className="size-4" />
          Kopyala
        </button>
        <button type="button" className="btn-ghost text-sm" onClick={onClose}>
          Kapat
        </button>
      </div>
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <h2 className="font-display text-xl flex items-center gap-2">
      <span className="text-orange-600">{icon}</span>
      {title}
    </h2>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${
        active ? 'bg-success/10 text-success' : 'bg-slate-100 text-muted'
      }`}
    >
      {active ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}
      {active ? 'Aktif' : 'Pasif'}
    </span>
  );
}

function CopyLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-cream p-2">
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-1 flex items-center gap-2">
        <div className="min-w-0 flex-1 font-mono text-xs break-all">{value}</div>
        <button
          type="button"
          className="shrink-0 rounded-md p-1.5 hover:bg-orange-100"
          onClick={() => {
            void navigator.clipboard.writeText(value);
            toast.success('Kopyalandi');
          }}
        >
          <Copy className="size-4" />
        </button>
      </div>
    </div>
  );
}

function keyToDraft(row: ApiKeyRow): ApiKeyDraft {
  return {
    name: row.name,
    scopes: row.scopes,
    rate_limit_per_min: row.rate_limit_per_min,
    is_active: row.is_active,
  };
}

function webhookToDraft(row: WebhookRow): WebhookDraft {
  return {
    url: row.url,
    events: row.events,
    is_active: row.is_active,
  };
}

function invalidateAll(qc: QueryClientLike) {
  void qc.invalidateQueries({ queryKey: ['admin', 'integrations'] });
  void qc.invalidateQueries({ queryKey: ['admin', 'api-keys'] });
  void qc.invalidateQueries({ queryKey: ['admin', 'webhooks'] });
}

type QueryClientLike = Pick<ReturnType<typeof useQueryClient>, 'invalidateQueries'>;

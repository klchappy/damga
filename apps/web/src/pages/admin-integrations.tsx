import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Activity,
  CheckCircle2,
  Copy,
  Edit3,
  Info,
  Key,
  Link as LinkIcon,
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

const API_SCOPE_INFO: Record<string, { label: string; desc: string }> = {
  'events:read': {
    label: 'Damga geçmişini okur',
    desc: 'Giriş, çıkış, mola ve doğrulama kayıtlarını dış sisteme verir.',
  },
  'events:write': {
    label: 'Damga kaydı oluşturur',
    desc: 'Yetkili sistemlerin DAMGA adına olay kaydı göndermesini sağlar.',
  },
  'leaves:read': {
    label: 'İzinleri okur',
    desc: 'İzin talepleri, tarihleri ve onay durumlarını dış sisteme verir.',
  },
  'leaves:write': {
    label: 'İzinleri yönetir',
    desc: 'Harici sistem üzerinden izin talebi oluşturma veya güncelleme izni verir.',
  },
  'users:read': {
    label: 'Kullanıcıları okur',
    desc: 'Çalışan, rol, departman ve temel profil bilgilerini dış sisteme verir.',
  },
  'users:write': {
    label: 'Kullanıcıları yönetir',
    desc: 'Harici sistemden çalışan bilgisi oluşturma veya güncelleme izni verir.',
  },
  'locations:read': {
    label: 'Lokasyonları okur',
    desc: 'Şube, konum ve doğrulama alanı bilgilerini dış sisteme verir.',
  },
  'locations:write': {
    label: 'Lokasyonları yönetir',
    desc: 'Harici sistemden şube veya lokasyon ayarı güncellemeye izin verir.',
  },
  'webhooks:manage': {
    label: 'Webhookları yönetir',
    desc: 'Dış sisteme olay bildirimi gönderen webhook ayarlarını yönetebilir.',
  },
  'reports:read': {
    label: 'Raporları okur',
    desc: 'Devam, performans ve operasyon raporlarını dış sisteme verir.',
  },
};

const WEBHOOK_EVENT_INFO: Record<string, { label: string; desc: string }> = {
  'check_in.created': { label: 'Giriş oluşturuldu', desc: 'Çalışan giriş yaptığında bildirim gönderir.' },
  'check_out.created': { label: 'Çıkış oluşturuldu', desc: 'Çalışan çıkış yaptığında bildirim gönderir.' },
  'leave.created': { label: 'İzin talebi', desc: 'Yeni izin talebi oluşturulduğunda bildirim gönderir.' },
  'leave.approved': { label: 'İzin onaylandı', desc: 'İzin onaylandığında dış sisteme bilgi verir.' },
  'leave.rejected': { label: 'İzin reddedildi', desc: 'İzin reddedildiğinde dış sisteme bilgi verir.' },
  'mood.created': { label: 'Mood kaydı', desc: 'Çalışan duygu durumu kaydı gönderdiğinde bildirim üretir.' },
  'announcement.published': { label: 'Duyuru yayınlandı', desc: 'Yeni duyuru yayınlandığında dış sistemi bilgilendirir.' },
  'user.created': { label: 'Kullanıcı oluşturuldu', desc: 'Yeni çalışan eklendiğinde bildirim gönderir.' },
  'user.deactivated': { label: 'Kullanıcı pasifleştirildi', desc: 'Çalışan pasife alındığında bildirim gönderir.' },
  'event.disputed': { label: 'Kayıt itirazlı', desc: 'Damga kaydı incelemeye düştüğünde bildirim gönderir.' },
  'event.edited': { label: 'Kayıt düzenlendi', desc: 'Damga kaydı değiştirildiğinde dış sistemi bilgilendirir.' },
};

const SERVICE_TYPE_INFO = {
  ai: {
    label: 'AI API',
    desc: 'OpenAI, Anthropic veya benzeri yapay zeka servis bağlantısı.',
    placeholders: { base_url: 'https://api.openai.com/v1', docs_url: 'https://platform.openai.com/docs' },
  },
  email: {
    label: 'E-posta servisi',
    desc: 'Resend, Sendgrid veya SMTP tabanlı mail servisi bağlantısı.',
    placeholders: { base_url: 'https://api.resend.com', docs_url: 'https://resend.com/docs' },
  },
  storage: {
    label: 'Dosya depolama',
    desc: 'S3, Supabase Storage veya benzeri dosya saklama servisi.',
    placeholders: { base_url: 'https://example.supabase.co/storage/v1', docs_url: 'https://supabase.com/docs' },
  },
  accounting: {
    label: 'Muhasebe',
    desc: 'Logo, Mikro, Paraşüt veya özel muhasebe entegrasyon bilgisi.',
    placeholders: { base_url: 'https://api.example.com', docs_url: 'https://docs.example.com' },
  },
  payroll: {
    label: 'Bordro',
    desc: 'Puantaj ve personel verisi aktarılacak bordro sistemi bağlantısı.',
    placeholders: { base_url: 'https://payroll.example.com/api', docs_url: 'https://payroll.example.com/docs' },
  },
  custom: {
    label: 'Özel servis',
    desc: 'Müşteriye veya kendi projene ait özel HTTP API bağlantısı.',
    placeholders: { base_url: 'https://api.example.com', docs_url: 'https://docs.example.com' },
  },
} as const;

type ServiceType = keyof typeof SERVICE_TYPE_INFO;

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

interface ExternalIntegrationRow {
  id: string;
  service_type: ServiceType;
  name: string;
  base_url: string | null;
  docs_url: string | null;
  config: Record<string, string | number | boolean | null>;
  secret_fields: string[];
  has_secrets: Record<string, boolean>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
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

type ExternalIntegrationDraft = {
  service_type: ServiceType;
  name: string;
  base_url: string;
  docs_url: string;
  config: {
    provider: string;
    model: string;
    auth_header: string;
    notes: string;
  };
  secrets: {
    api_key: string;
    client_secret: string;
  };
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

const defaultExternalDraft: ExternalIntegrationDraft = {
  service_type: 'ai',
  name: 'AI API',
  base_url: 'https://api.openai.com/v1',
  docs_url: 'https://platform.openai.com/docs',
  config: {
    provider: 'OpenAI',
    model: '',
    auth_header: 'Authorization: Bearer <API_KEY>',
    notes: '',
  },
  secrets: {
    api_key: '',
    client_secret: '',
  },
  is_active: true,
};

export function AdminIntegrationsPage() {
  const qc = useQueryClient();
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [createdWebhookSecret, setCreatedWebhookSecret] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<ApiKeyDraft>(defaultKeyDraft);
  const [newWebhook, setNewWebhook] = useState<WebhookDraft>(defaultWebhookDraft);
  const [newExternal, setNewExternal] = useState<ExternalIntegrationDraft>(defaultExternalDraft);
  const [editingKeyId, setEditingKeyId] = useState<string | null>(null);
  const [editingWebhookId, setEditingWebhookId] = useState<string | null>(null);
  const [editingExternalId, setEditingExternalId] = useState<string | null>(null);
  const [keyDrafts, setKeyDrafts] = useState<Record<string, ApiKeyDraft>>({});
  const [webhookDrafts, setWebhookDrafts] = useState<Record<string, WebhookDraft>>({});
  const [externalDrafts, setExternalDrafts] = useState<Record<string, ExternalIntegrationDraft>>({});

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

  const externalQuery = useQuery<{ items: ExternalIntegrationRow[] }>({
    queryKey: ['admin', 'external-integrations'],
    queryFn: async () => (await api.get('/integrations/external')).data,
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

  const createExternal = useMutation({
    mutationFn: async (draft: ExternalIntegrationDraft) =>
      api.post('/integrations/external', externalDraftPayload(draft, true)),
    onSuccess: () => {
      setNewExternal(defaultExternalDraft);
      invalidateAll(qc);
      toast.success('Dış servis bağlantısı eklendi');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const updateExternal = useMutation({
    mutationFn: async ({ id, draft }: { id: string; draft: ExternalIntegrationDraft }) =>
      api.patch(`/integrations/external/${id}`, externalDraftPayload(draft, false)),
    onSuccess: () => {
      setEditingExternalId(null);
      invalidateAll(qc);
      toast.success('Dış servis bağlantısı güncellendi');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const deleteExternal = useMutation({
    mutationFn: async (id: string) => api.delete(`/integrations/external/${id}`),
    onSuccess: () => {
      invalidateAll(qc);
      toast.success('Dış servis bağlantısı silindi');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const loading =
    statusQuery.isLoading ||
    apiKeysQuery.isLoading ||
    webhooksQuery.isLoading ||
    externalQuery.isLoading;
  const apiKeys = apiKeysQuery.data?.items ?? [];
  const webhooks = webhooksQuery.data?.items ?? [];
  const externalIntegrations = externalQuery.data?.items ?? [];

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

      <section className="grid grid-cols-1 lg:grid-cols-[420px_minmax(0,1fr)] gap-4 items-start">
        <div className="card space-y-3">
          <SectionTitle icon={<Plus className="size-5" />} title="Yeni Dış Servis" />
          <ExternalIntegrationForm draft={newExternal} onChange={setNewExternal} />
          <button
            type="button"
            className="btn-primary w-full"
            onClick={() => createExternal.mutate(newExternal)}
            disabled={createExternal.isPending || newExternal.name.trim().length < 2}
          >
            <Plus className="size-4" />
            Bağlantıyı Kaydet
          </button>
        </div>

        <div className="card space-y-3">
          <SectionTitle icon={<LinkIcon className="size-5" />} title="Dış Servis Bağlantıları" />
          <p className="text-xs text-muted">
            AI API gibi DAMGA'nın kullanacağı dış servis bilgilerini buradan yönet. Secret
            değerler kaydedildikten sonra tekrar gösterilmez; değiştirmek için yeni değer girilir.
          </p>
          {externalIntegrations.length === 0 ? (
            <div className="rounded-md border border-dashed border-orange-200 p-3 text-sm text-muted">
              Henüz dış servis bağlantısı yok. Soldaki formdan AI API veya özel servis ekleyebilirsin.
            </div>
          ) : (
            <div className="space-y-3">
              {externalIntegrations.map((row) => {
                const isEditing = editingExternalId === row.id;
                const draft = externalDrafts[row.id] ?? externalToDraft(row);
                return (
                  <div key={row.id} className="rounded-lg border border-orange-100 p-3 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="font-medium">{row.name}</div>
                          <span className="chip bg-orange-50 text-orange-700 text-[10px]">
                            {SERVICE_TYPE_INFO[row.service_type]?.label ?? row.service_type}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-muted">
                          {SERVICE_TYPE_INFO[row.service_type]?.desc}
                        </div>
                        {row.base_url && <div className="mt-1 font-mono text-xs break-all">{row.base_url}</div>}
                        {row.secret_fields.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {row.secret_fields.map((field) => (
                              <span key={field} className="chip bg-success/10 text-success text-[10px]">
                                {field} kayıtlı
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <StatusBadge active={row.is_active} />
                    </div>

                    {isEditing && (
                      <ExternalIntegrationForm
                        draft={draft}
                        onChange={(next) =>
                          setExternalDrafts({ ...externalDrafts, [row.id]: next })
                        }
                        editMode
                      />
                    )}

                    <div className="flex flex-wrap gap-2">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            className="btn-primary text-sm"
                            onClick={() => updateExternal.mutate({ id: row.id, draft })}
                            disabled={updateExternal.isPending || draft.name.trim().length < 2}
                          >
                            <Save className="size-4" />
                            Kaydet
                          </button>
                          <button
                            type="button"
                            className="btn-outline text-sm"
                            onClick={() => setEditingExternalId(null)}
                          >
                            Vazgeç
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="btn-outline text-sm"
                          onClick={() => {
                            setExternalDrafts({ ...externalDrafts, [row.id]: externalToDraft(row) });
                            setEditingExternalId(row.id);
                          }}
                        >
                          <Edit3 className="size-4" />
                          Düzenle
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-ghost text-sm text-danger"
                        onClick={() => confirm(`${row.name} silinsin mi?`) && deleteExternal.mutate(row.id)}
                        disabled={deleteExternal.isPending}
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

      </section>

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

      <section className="grid grid-cols-1 lg:grid-cols-[420px_minmax(0,1fr)] gap-4 items-start">
        <div className="card space-y-3">
          <SectionTitle icon={<Plus className="size-5" />} title="Yeni API Key" />
          <ApiKeyForm draft={newKey} onChange={setNewKey} />
          <button
            type="button"
            className="btn-primary w-full"
            onClick={() => createKey.mutate(newKey)}
            disabled={createKey.isPending || newKey.name.trim().length < 2 || newKey.scopes.length === 0}
          >
            <Plus className="size-4" />
            Oluştur
          </button>
        </div>

        <div className="card space-y-3">
          <SectionTitle icon={<Key className="size-5" />} title="API Key Yonetimi" />
          {apiKeys.length === 0 ? (
            <div className="rounded-md border border-dashed border-orange-200 p-3 text-sm text-muted">
              Henüz API key yok. Harici sistemleri bağlamak için soldaki formdan oluştur.
            </div>
          ) : (
            <div className="space-y-3">
              {apiKeys.map((row) => {
                const isEditing = editingKeyId === row.id;
                const draft = keyDrafts[row.id] ?? keyToDraft(row);
                return (
                  <div key={row.id} className="rounded-lg border border-orange-100 p-3 space-y-3">
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

      </section>

      <section className="grid grid-cols-1 lg:grid-cols-[420px_minmax(0,1fr)] gap-4 items-start">
        <div className="card space-y-3">
          <SectionTitle icon={<Plus className="size-5" />} title="Yeni Webhook" />
          <WebhookForm draft={newWebhook} onChange={setNewWebhook} />
          <button
            type="button"
            className="btn-primary w-full"
            onClick={() => createWebhook.mutate(newWebhook)}
            disabled={createWebhook.isPending || !newWebhook.url || newWebhook.events.length === 0}
          >
            <Plus className="size-4" />
            Oluştur
          </button>
        </div>

        <div className="card space-y-3">
          <SectionTitle icon={<Webhook className="size-5" />} title="Webhook Yonetimi" />
          {webhooks.length === 0 ? (
            <div className="rounded-md border border-dashed border-orange-200 p-3 text-sm text-muted">
              Henüz webhook yok. Damga olaylarını başka sistemlere aktarmak için soldan endpoint ekle.
            </div>
          ) : (
            <div className="space-y-3">
              {webhooks.map((row) => {
                const isEditing = editingWebhookId === row.id;
                const draft = webhookDrafts[row.id] ?? webhookToDraft(row);
                return (
                  <div key={row.id} className="rounded-lg border border-orange-100 p-3 space-y-3">
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
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_120px] gap-2">
        <label className="block">
          <span className="label">İsim</span>
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
      </div>
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
        info={API_SCOPE_INFO}
        compact
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
        info={WEBHOOK_EVENT_INFO}
        compact
      />
    </div>
  );
}

function ExternalIntegrationForm({
  draft,
  onChange,
  editMode,
}: {
  draft: ExternalIntegrationDraft;
  onChange: (draft: ExternalIntegrationDraft) => void;
  editMode?: boolean;
}) {
  const preset = SERVICE_TYPE_INFO[draft.service_type];

  const changeType = (serviceType: ServiceType) => {
    const nextPreset = SERVICE_TYPE_INFO[serviceType];
    onChange({
      ...draft,
      service_type: serviceType,
      name: draft.name || nextPreset.label,
      base_url: nextPreset.placeholders.base_url,
      docs_url: nextPreset.placeholders.docs_url,
      config: {
        ...draft.config,
        provider: serviceType === 'ai' ? draft.config.provider || 'OpenAI' : draft.config.provider,
      },
    });
  };

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="block">
          <span className="label">Servis tipi</span>
          <select
            className="input mt-1"
            value={draft.service_type}
            onChange={(event) => changeType(event.target.value as ServiceType)}
          >
            {Object.entries(SERVICE_TYPE_INFO).map(([key, item]) => (
              <option key={key} value={key}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Bağlantı adı</span>
          <input
            className="input mt-1"
            value={draft.name}
            onChange={(event) => onChange({ ...draft, name: event.target.value })}
            placeholder={preset.label}
          />
        </label>
      </div>

      <InfoLine>{preset.desc}</InfoLine>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="block">
          <span className="label">API base URL</span>
          <input
            className="input mt-1"
            value={draft.base_url}
            onChange={(event) => onChange({ ...draft, base_url: event.target.value })}
            placeholder={preset.placeholders.base_url}
          />
          <p className="mt-1 text-[11px] text-muted">
            İsteklerin gönderileceği ana API adresi.
          </p>
        </label>
        <label className="block">
          <span className="label">Doküman / yönetim linki</span>
          <input
            className="input mt-1"
            value={draft.docs_url}
            onChange={(event) => onChange({ ...draft, docs_url: event.target.value })}
            placeholder={preset.placeholders.docs_url}
          />
          <p className="mt-1 text-[11px] text-muted">
            Sonradan kontrol etmek için servis dokümanı veya panel adresi.
          </p>
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="block">
          <span className="label">Provider</span>
          <input
            className="input mt-1"
            value={draft.config.provider}
            onChange={(event) =>
              onChange({ ...draft, config: { ...draft.config, provider: event.target.value } })
            }
            placeholder="OpenAI"
          />
        </label>
        <label className="block">
          <span className="label">Model / servis adı</span>
          <input
            className="input mt-1"
            value={draft.config.model}
            onChange={(event) =>
              onChange({ ...draft, config: { ...draft.config, model: event.target.value } })
            }
            placeholder="gpt-4.1-mini"
          />
        </label>
      </div>

      <label className="block">
        <span className="label">Auth header formatı</span>
        <input
          className="input mt-1"
          value={draft.config.auth_header}
          onChange={(event) =>
            onChange({ ...draft, config: { ...draft.config, auth_header: event.target.value } })
          }
          placeholder="Authorization: Bearer <API_KEY>"
        />
        <p className="mt-1 text-[11px] text-muted">
          DAMGA'nın bu servise bağlanırken anahtarı hangi header formatıyla kullanacağını açıklar.
        </p>
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="block">
          <span className="label">API key / token</span>
          <input
            className="input mt-1"
            type="password"
            value={draft.secrets.api_key}
            onChange={(event) =>
              onChange({ ...draft, secrets: { ...draft.secrets, api_key: event.target.value } })
            }
            placeholder={editMode ? 'Değiştirmek için yeni değer gir' : 'sk-...'}
          />
        </label>
        <label className="block">
          <span className="label">Client secret</span>
          <input
            className="input mt-1"
            type="password"
            value={draft.secrets.client_secret}
            onChange={(event) =>
              onChange({
                ...draft,
                secrets: { ...draft.secrets, client_secret: event.target.value },
              })
            }
            placeholder={editMode ? 'Opsiyonel yeni değer' : 'Opsiyonel'}
          />
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_80px] gap-2 items-end">
        <label className="block">
          <span className="label">Not</span>
          <textarea
            className="input mt-1 resize-none"
            rows={2}
            value={draft.config.notes}
            onChange={(event) =>
              onChange({ ...draft, config: { ...draft.config, notes: event.target.value } })
            }
            placeholder="Bu bağlantı hangi akışta kullanılacak?"
          />
        </label>
        <label className="flex h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.is_active}
            onChange={(event) => onChange({ ...draft, is_active: event.target.checked })}
          />
          Aktif
        </label>
      </div>
    </div>
  );
}

function CheckboxGrid({
  items,
  selected,
  onChange,
  info,
  compact,
}: {
  items: string[];
  selected: string[];
  onChange: (items: string[]) => void;
  info?: Record<string, { label: string; desc: string }>;
  compact?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {items.map((item) => (
        <label key={item} className="flex items-start gap-2 rounded-md border border-orange-100 p-2 text-xs">
          <input
            className="mt-0.5"
            type="checkbox"
            checked={selected.includes(item)}
            onChange={(e) => {
              const next = e.target.checked
                ? [...selected, item]
                : selected.filter((value) => value !== item);
              onChange([...new Set(next)]);
            }}
          />
          <span className="min-w-0">
            <span className="block font-medium text-ink">
              {info?.[item]?.label ?? item}
            </span>
            <span className="mt-0.5 block font-mono text-[10px] text-muted break-all">
              {item}
            </span>
            {info?.[item]?.desc && !compact && (
              <span className="mt-1 block text-[11px] leading-snug text-muted">
                {info[item].desc}
              </span>
            )}
            {info?.[item]?.desc && compact && (
              <span className="mt-0.5 block truncate text-[11px] text-muted" title={info[item].desc}>
                {info[item].desc}
              </span>
            )}
          </span>
        </label>
      ))}
    </div>
  );
}

function InfoLine({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-md border border-orange-100 bg-orange-50/60 p-2 text-xs text-muted">
      <Info className="mt-0.5 size-3.5 shrink-0 text-orange-600" />
      <span>{children}</span>
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

function externalToDraft(row: ExternalIntegrationRow): ExternalIntegrationDraft {
  return {
    service_type: row.service_type,
    name: row.name,
    base_url: row.base_url ?? '',
    docs_url: row.docs_url ?? '',
    config: {
      provider: String(row.config.provider ?? ''),
      model: String(row.config.model ?? ''),
      auth_header: String(row.config.auth_header ?? 'Authorization: Bearer <API_KEY>'),
      notes: String(row.config.notes ?? ''),
    },
    secrets: {
      api_key: '',
      client_secret: '',
    },
    is_active: row.is_active,
  };
}

function externalDraftPayload(draft: ExternalIntegrationDraft, includeEmptySecrets: boolean) {
  const secrets = Object.fromEntries(
    Object.entries(draft.secrets).filter(([, value]) =>
      includeEmptySecrets ? value.trim().length > 0 : value.trim().length > 0,
    ),
  );

  return {
    service_type: draft.service_type,
    name: draft.name.trim(),
    base_url: draft.base_url.trim() || null,
    docs_url: draft.docs_url.trim() || null,
    config: {
      provider: draft.config.provider.trim(),
      model: draft.config.model.trim(),
      auth_header: draft.config.auth_header.trim(),
      notes: draft.config.notes.trim(),
    },
    secrets,
    is_active: draft.is_active,
  };
}

function invalidateAll(qc: QueryClientLike) {
  void qc.invalidateQueries({ queryKey: ['admin', 'integrations'] });
  void qc.invalidateQueries({ queryKey: ['admin', 'api-keys'] });
  void qc.invalidateQueries({ queryKey: ['admin', 'webhooks'] });
  void qc.invalidateQueries({ queryKey: ['admin', 'external-integrations'] });
}

type QueryClientLike = Pick<ReturnType<typeof useQueryClient>, 'invalidateQueries'>;

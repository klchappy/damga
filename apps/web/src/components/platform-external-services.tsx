/**
 * Platform admin paneli > Dış Servisler sekmesi.
 *
 * Platform sahibinin (Kaan) kullandığı dış servisleri (Hetzner, Cloudflare,
 * Supabase, Resend, GitHub, Bitwarden vb.) merkezi yönetir.
 *
 * Hassas key/şifreler BURADA YOK — sadece referans bilgi (panel URL, hesap, plan, not).
 * Gerçek sırlar Bitwarden vault'unda; `bitwarden_note_name` ile yönlendirme yapılır.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Activity,
  AlertTriangle,
  Bell,
  Cloud,
  Container,
  CreditCard,
  Database,
  ExternalLink,
  GitBranch,
  KeyRound,
  Loader2,
  Mail,
  MoreVertical,
  Pencil,
  Plus,
  Server,
  Shield,
  Trash2,
  X,
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

interface PlatformExternalService {
  id: string;
  name: string;
  category: string;
  dashboard_url: string;
  account_identifier: string | null;
  plan: string | null;
  status: 'active' | 'setup_pending' | 'inactive' | 'deprecated';
  notes: string | null;
  bitwarden_note_name: string | null;
  icon: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

const SERVICE_CATEGORIES = [
  'infra',
  'database',
  'email',
  'auth',
  'push',
  'repo',
  'payment',
  'monitoring',
  'security',
  'dns',
  'other',
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  infra: 'Altyapı',
  database: 'Veritabanı',
  email: 'E-posta',
  auth: 'Kimlik',
  push: 'Bildirim',
  repo: 'Repository',
  payment: 'Ödeme',
  monitoring: 'İzleme',
  security: 'Güvenlik',
  dns: 'DNS / CDN',
  other: 'Diğer',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Aktif',
  setup_pending: 'Kurulum',
  inactive: 'Pasif',
  deprecated: 'Eskimiş',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  setup_pending: 'bg-amber-100 text-amber-700',
  inactive: 'bg-stone-200 text-stone-700',
  deprecated: 'bg-rose-100 text-rose-700',
};

const CATEGORY_COLORS: Record<string, string> = {
  infra: 'bg-blue-100 text-blue-700',
  database: 'bg-orange-100 text-orange-500',
  email: 'bg-rose-100 text-rose-700',
  auth: 'bg-amber-100 text-amber-700',
  push: 'bg-cyan-100 text-cyan-700',
  repo: 'bg-stone-200 text-stone-700',
  payment: 'bg-emerald-100 text-emerald-700',
  monitoring: 'bg-indigo-100 text-indigo-700',
  security: 'bg-red-100 text-red-700',
  dns: 'bg-sky-100 text-sky-700',
  other: 'bg-orange-100 text-orange-700',
};

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Server,
  Container,
  Cloud,
  Database,
  GitBranch,
  Mail,
  KeyRound,
  Bell,
  Shield,
  CreditCard,
  AlertTriangle,
  Activity,
};

function ServiceIcon({ name, className }: { name: string | null; className?: string }) {
  const Icon = (name && ICON_MAP[name]) || Server;
  return <Icon className={className} />;
}

interface ServiceFormDraft {
  name: string;
  category: typeof SERVICE_CATEGORIES[number];
  dashboard_url: string;
  account_identifier: string;
  plan: string;
  status: 'active' | 'setup_pending' | 'inactive' | 'deprecated';
  notes: string;
  bitwarden_note_name: string;
  icon: string;
  display_order: number;
}

const EMPTY_DRAFT: ServiceFormDraft = {
  name: '',
  category: 'infra',
  dashboard_url: '',
  account_identifier: '',
  plan: '',
  status: 'active',
  notes: '',
  bitwarden_note_name: 'Damga Sistem Envanteri',
  icon: 'Server',
  display_order: 0,
};

export function PlatformExternalServices({ enabled = true }: { enabled?: boolean }) {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ServiceFormDraft>(EMPTY_DRAFT);

  const { data, isLoading } = useQuery<{ items: PlatformExternalService[] }>({
    queryKey: ['platform-services'],
    queryFn: async () => (await api.get('/platform/services')).data,
    enabled,
  });

  const services = data?.items ?? [];
  const [activeCategory, setActiveCategory] = useState<'all' | string>('all');

  // Kategori bazında sayım (filter chip'lerde göstermek için)
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of services) {
      counts[s.category] = (counts[s.category] ?? 0) + 1;
    }
    return counts;
  }, [services]);

  // Aktif kategori filtresi + display_order'a göre sıralama
  const filteredServices = useMemo(() => {
    const list =
      activeCategory === 'all'
        ? services
        : services.filter((s) => s.category === activeCategory);
    return [...list].sort((a, b) => {
      // Önce kategori (display_order grubunda kalsın), sonra display_order, sonra ad
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      if (a.display_order !== b.display_order) return a.display_order - b.display_order;
      return a.name.localeCompare(b.name);
    });
  }, [services, activeCategory]);

  const createMutation = useMutation({
    mutationFn: async (input: ServiceFormDraft) =>
      api.post('/platform/services', normalizeDraft(input)),
    onSuccess: async () => {
      toast.success('Servis eklendi');
      await queryClient.invalidateQueries({ queryKey: ['platform-services'] });
      closeModal();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: ServiceFormDraft }) =>
      api.patch(`/platform/services/${id}`, normalizeDraft(input)),
    onSuccess: async () => {
      toast.success('Servis güncellendi');
      await queryClient.invalidateQueries({ queryKey: ['platform-services'] });
      closeModal();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/platform/services/${id}`),
    onSuccess: async () => {
      toast.success('Servis silindi');
      await queryClient.invalidateQueries({ queryKey: ['platform-services'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  function openCreate() {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setModalOpen(true);
  }

  function openEdit(s: PlatformExternalService) {
    setEditingId(s.id);
    setDraft({
      name: s.name,
      category: (SERVICE_CATEGORIES as readonly string[]).includes(s.category)
        ? (s.category as ServiceFormDraft['category'])
        : 'other',
      dashboard_url: s.dashboard_url,
      account_identifier: s.account_identifier ?? '',
      plan: s.plan ?? '',
      status: s.status,
      notes: s.notes ?? '',
      bitwarden_note_name: s.bitwarden_note_name ?? '',
      icon: s.icon ?? 'Server',
      display_order: s.display_order,
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editingId) {
      updateMutation.mutate({ id: editingId, input: draft });
    } else {
      createMutation.mutate(draft);
    }
  }

  function handleDelete(s: PlatformExternalService) {
    if (
      window.confirm(
        `"${s.name}" servisini silmek istediğine emin misin? Bu işlem geri alınamaz.`,
      )
    ) {
      deleteMutation.mutate(s.id);
    }
  }

  if (!enabled) return null;

  return (
    <section className="card">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <h2 className="font-display flex items-center gap-2 text-lg">
            <Cloud className="size-5 text-orange-600" />
            Dış Servisler
            <span className="ml-1 chip bg-orange-50 text-orange-700 text-[10px] border border-orange-100">
              {services.length}
            </span>
          </h2>
          <p className="mt-1 text-xs text-muted">
            Damga'nın kullandığı 3. taraf hizmetler. Hassas key'ler Bitwarden'da;
            burada sadece panel + hesap + plan + not.
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary text-xs whitespace-nowrap">
          <Plus className="size-3.5" />
          Yeni Servis
        </button>
      </div>

      {/* Category filter chips */}
      {services.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveCategory('all')}
            className={cn(
              'rounded-full px-3 py-1 text-[11px] font-medium transition',
              activeCategory === 'all'
                ? 'bg-orange-500 text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200',
            )}
          >
            Hepsi · {services.length}
          </button>
          {SERVICE_CATEGORIES.filter((c) => (categoryCounts[c] ?? 0) > 0).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={cn(
                'rounded-full px-3 py-1 text-[11px] font-medium transition',
                activeCategory === cat
                  ? 'bg-orange-500 text-white'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200',
              )}
            >
              {CATEGORY_LABELS[cat] ?? cat} · {categoryCounts[cat]}
            </button>
          ))}
        </div>
      )}

      {/* Services grid — tek tutarlı responsive grid */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="size-6 animate-spin text-orange-600" />
        </div>
      ) : services.length === 0 ? (
        <div className="rounded-xl border border-dashed border-orange-200 bg-orange-50/40 p-8 text-center">
          <Cloud className="mx-auto size-8 text-orange-300 mb-2" />
          <p className="text-sm text-muted">Henüz dış servis kaydı yok.</p>
          <button onClick={openCreate} className="btn-primary text-xs mt-3">
            <Plus className="size-3.5" />
            İlk servisini ekle
          </button>
        </div>
      ) : filteredServices.length === 0 ? (
        <p className="text-center text-sm text-muted py-8">
          Bu kategoride servis yok.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredServices.map((s) => (
            <ServiceCard
              key={s.id}
              service={s}
              onEdit={() => openEdit(s)}
              onDelete={() => handleDelete(s)}
            />
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={handleSubmit}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg">
                {editingId ? 'Servisi Düzenle' : 'Yeni Servis Ekle'}
              </h3>
              <button
                type="button"
                onClick={closeModal}
                className="btn-ghost p-1.5 text-muted"
                aria-label="Kapat"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label">Ad *</label>
                <input
                  className="input mt-1"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Örn: Hetzner Cloud"
                  required
                />
              </div>

              <div>
                <label className="label">Kategori *</label>
                <select
                  className="input mt-1"
                  value={draft.category}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      category: e.target.value as ServiceFormDraft['category'],
                    })
                  }
                >
                  {SERVICE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Durum</label>
                <select
                  className="input mt-1"
                  value={draft.status}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      status: e.target.value as ServiceFormDraft['status'],
                    })
                  }
                >
                  {Object.entries(STATUS_LABELS).map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="label">Panel / Dashboard URL *</label>
                <input
                  type="url"
                  className="input mt-1"
                  value={draft.dashboard_url}
                  onChange={(e) => setDraft({ ...draft, dashboard_url: e.target.value })}
                  placeholder="https://console.hetzner.cloud"
                  required
                />
              </div>

              <div>
                <label className="label">Hesap (email / kullanıcı)</label>
                <input
                  className="input mt-1"
                  value={draft.account_identifier}
                  onChange={(e) =>
                    setDraft({ ...draft, account_identifier: e.target.value })
                  }
                  placeholder="kaanklc498@gmail.com"
                />
              </div>

              <div>
                <label className="label">Plan</label>
                <input
                  className="input mt-1"
                  value={draft.plan}
                  onChange={(e) => setDraft({ ...draft, plan: e.target.value })}
                  placeholder="Free · CX22 €4/ay"
                />
              </div>

              <div>
                <label className="label">Bitwarden Note (referans)</label>
                <input
                  className="input mt-1"
                  value={draft.bitwarden_note_name}
                  onChange={(e) =>
                    setDraft({ ...draft, bitwarden_note_name: e.target.value })
                  }
                  placeholder="Damga Sistem Envanteri"
                />
              </div>

              <div>
                <label className="label">Icon</label>
                <select
                  className="input mt-1"
                  value={draft.icon}
                  onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
                >
                  {Object.keys(ICON_MAP).map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="label">Notlar (markdown)</label>
                <textarea
                  className="input mt-1"
                  rows={4}
                  value={draft.notes}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                  placeholder="Region: EU, Pro'ya yükseltilecek..."
                />
              </div>

              <div>
                <label className="label">Sıra (display_order)</label>
                <input
                  type="number"
                  className="input mt-1"
                  value={draft.display_order}
                  onChange={(e) =>
                    setDraft({ ...draft, display_order: Number(e.target.value) || 0 })
                  }
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={closeModal} className="btn-ghost text-sm">
                İptal
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="btn-primary text-sm"
              >
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="size-3.5 animate-spin" />
                )}
                {editingId ? 'Güncelle' : 'Ekle'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

function ServiceCard({
  service,
  onEdit,
  onDelete,
}: {
  service: PlatformExternalService;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const categoryLabel = CATEGORY_LABELS[service.category] ?? service.category;
  const categoryColor = CATEGORY_COLORS[service.category] ?? 'bg-stone-100 text-stone-700';

  return (
    <div
      className={cn(
        'group relative rounded-xl border bg-white transition flex flex-col',
        service.status === 'active'
          ? 'border-zinc-200 hover:border-orange-300 hover:shadow-sm'
          : 'border-zinc-200 opacity-60',
      )}
    >
      {/* Status dot top-right (her zaman tutarlı pozisyon) */}
      <span
        className={cn(
          'absolute top-2.5 right-2.5 size-2 rounded-full',
          service.status === 'active'
            ? 'bg-emerald-500'
            : service.status === 'setup_pending'
              ? 'bg-amber-500'
              : service.status === 'deprecated'
                ? 'bg-rose-500'
                : 'bg-zinc-300',
        )}
        title={STATUS_LABELS[service.status]}
      />

      <div className="p-3 flex items-start gap-2.5 flex-1 min-w-0">
        {/* Icon — daha küçük (40 → 32), full orange instead of gradient */}
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-orange-500 text-white">
          <ServiceIcon name={service.icon} className="size-4" />
        </div>

        <div className="flex-1 min-w-0">
          {/* Title + category chip aynı satırda, sağda kebab menu var */}
          <div className="flex items-center gap-1.5 pr-5">
            <h3 className="truncate font-display text-sm font-semibold">{service.name}</h3>
            <span
              className={cn(
                'rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide shrink-0',
                categoryColor,
              )}
            >
              {categoryLabel}
            </span>
          </div>

          {/* Plan + hesap */}
          <div className="mt-0.5 space-y-0">
            {service.plan && (
              <p className="truncate text-[11px] text-muted">{service.plan}</p>
            )}
            {service.account_identifier && (
              <p className="truncate font-mono text-[10px] text-zinc-500">
                {service.account_identifier}
              </p>
            )}
          </div>

          {/* Not — max 2 satır */}
          {service.notes && (
            <p className="mt-1.5 line-clamp-2 text-[11px] text-zinc-600 leading-snug">
              {service.notes}
            </p>
          )}
        </div>

        {/* Kebab menu — sağ üstte, status dot'tan ayrı */}
        <div className="relative shrink-0 -mr-1 -mt-1">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="p-1 rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700"
            aria-label="Menü"
          >
            <MoreVertical className="size-4" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-7 z-20 w-36 rounded-md border border-zinc-200 bg-white py-1 shadow-lg">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onEdit();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-orange-50"
                >
                  <Pencil className="size-3.5" />
                  Düzenle
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="size-3.5" />
                  Sil
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Actions footer — kompakt, kart alt çizgisi */}
      <div className="flex items-center gap-0 border-t border-zinc-100">
        <a
          href={service.dashboard_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-medium text-orange-600 hover:bg-orange-50 transition"
        >
          <ExternalLink className="size-3" />
          Panel
        </a>
        {service.bitwarden_note_name && (
          <>
            <span className="w-px h-5 bg-zinc-200" />
            <a
              href="https://vault.bitwarden.com"
              target="_blank"
              rel="noopener noreferrer"
              title={`Bitwarden: ${service.bitwarden_note_name}`}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50 transition"
            >
              <KeyRound className="size-3" />
              Sırlar
            </a>
          </>
        )}
      </div>
    </div>
  );
}

function normalizeDraft(d: ServiceFormDraft) {
  return {
    name: d.name.trim(),
    category: d.category,
    dashboard_url: d.dashboard_url.trim(),
    account_identifier: d.account_identifier.trim() || null,
    plan: d.plan.trim() || null,
    status: d.status,
    notes: d.notes.trim() || null,
    bitwarden_note_name: d.bitwarden_note_name.trim() || null,
    icon: d.icon.trim() || null,
    display_order: d.display_order,
  };
}

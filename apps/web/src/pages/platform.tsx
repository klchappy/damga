import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Activity,
  AlertCircle,
  Building2,
  CheckCircle2,
  Clock3,
  Globe,
  LifeBuoy,
  Loader2,
  MapPin,
  Shield,
  UserCog,
  Users,
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

interface PlatformOrg {
  id: string;
  name: string;
  slug: string | null;
  plan: string;
  org_type: string;
  created_at: string;
  user_count: number;
  pending_user_count: number;
  owner_count: number;
  admin_count: number;
  manager_count: number;
  owner_emails: string;
  location_count: number;
  department_count: number;
  check_in_count: number;
  last_activity: string | null;
}

interface PlatformUser {
  id: string;
  email: string;
  phone: string | null;
  full_name: string;
  role: 'owner' | 'admin' | 'manager' | 'employee';
  is_active: boolean;
  is_pending: boolean;
  created_at: string;
  last_login_at: string | null;
  last_activity: string | null;
}

interface SupportTicket {
  id: string;
  org_id: string | null;
  org_name: string | null;
  requester_email: string;
  requester_name: string | null;
  subject: string;
  message: string;
  category: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'waiting' | 'resolved' | 'closed';
  assigned_to_email: string | null;
  platform_notes: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

interface PlatformStats {
  summary: {
    org_count: number;
    total_users: number;
    total_locations: number;
    total_departments: number;
    total_check_ins: number;
    check_ins_24h: number;
    support_active: number;
    support_24h: number;
  };
  plan_breakdown: Array<{ plan: string; count: number }>;
}

interface PlatformMe {
  is_platform_admin: boolean;
  admin: { id: string; email: string; full_name: string | null } | null;
}

const PLAN_COLOR: Record<string, string> = {
  free: 'bg-stone-100 text-stone-700',
  starter: 'bg-blue-100 text-blue-700',
  pro: 'bg-purple-100 text-purple-700',
  business: 'bg-emerald-100 text-emerald-700',
  enterprise: 'bg-amber-100 text-amber-700',
};

const ROLE_LABEL: Record<PlatformUser['role'], string> = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Yönetici',
  employee: 'Çalışan',
};

const STATUS_LABEL: Record<SupportTicket['status'], string> = {
  open: 'Açık',
  in_progress: 'İşlemde',
  waiting: 'Beklemede',
  resolved: 'Çözüldü',
  closed: 'Kapalı',
};

const PRIORITY_LABEL: Record<SupportTicket['priority'], string> = {
  low: 'Düşük',
  normal: 'Normal',
  high: 'Yüksek',
  urgent: 'Acil',
};

export function PlatformPage() {
  const queryClient = useQueryClient();
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  const { data: me, isLoading: meLoading } = useQuery<PlatformMe>({
    queryKey: ['platform-me'],
    queryFn: async () => (await api.get('/platform/me')).data,
  });

  const isPlatformAdmin = me?.is_platform_admin === true;

  const { data: stats } = useQuery<PlatformStats>({
    queryKey: ['platform-stats'],
    queryFn: async () => (await api.get('/platform/stats')).data,
    enabled: isPlatformAdmin,
  });

  const { data: orgsData } = useQuery<{ items: PlatformOrg[] }>({
    queryKey: ['platform-orgs'],
    queryFn: async () => (await api.get('/platform/orgs')).data,
    enabled: isPlatformAdmin,
  });

  const orgs = orgsData?.items ?? [];
  const selectedOrg = useMemo(
    () => orgs.find((org) => org.id === selectedOrgId) ?? orgs[0] ?? null,
    [orgs, selectedOrgId],
  );
  const effectiveOrgId = selectedOrg?.id ?? null;

  const { data: usersData, isLoading: usersLoading } = useQuery<{ items: PlatformUser[] }>({
    queryKey: ['platform-org-users', effectiveOrgId],
    queryFn: async () => (await api.get(`/platform/orgs/${effectiveOrgId}/users`)).data,
    enabled: isPlatformAdmin && !!effectiveOrgId,
  });

  const { data: ticketsData } = useQuery<{ items: SupportTicket[] }>({
    queryKey: ['platform-support-tickets'],
    queryFn: async () => (await api.get('/platform/support-tickets?status=active')).data,
    enabled: isPlatformAdmin,
  });

  const updateTicketMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: SupportTicket['status'] }) =>
      (await api.patch(`/platform/support-tickets/${id}`, { status })).data,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['platform-support-tickets'] }),
        queryClient.invalidateQueries({ queryKey: ['platform-stats'] }),
      ]);
      toast.success('Destek talebi güncellendi');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  if (meLoading) {
    return (
      <div className="container mx-auto max-w-6xl px-4 py-12 text-center">
        <Loader2 className="size-8 animate-spin text-orange-600 mx-auto" />
      </div>
    );
  }

  if (!isPlatformAdmin) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-12 text-center">
        <div className="card">
          <Shield className="size-12 text-danger mx-auto mb-2" />
          <h1 className="font-display text-xl mb-1">Erişim Yok</h1>
          <p className="text-sm text-muted">
            Bu sayfa Damga platform sahibi içindir. Şirket yöneticileri kendi ayarlarını kullanır.
          </p>
        </div>
      </div>
    );
  }

  const summary = stats?.summary;
  const tickets = ticketsData?.items ?? [];
  const accessUsers = usersData?.items ?? [];

  return (
    <div className="container mx-auto max-w-7xl px-4 py-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-orange-700 text-white">
            <Globe className="size-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl">Platform Paneli</h1>
            <p className="text-xs text-muted">
              Şirket erişimleri, kullanıcı rolleri ve destek kuyruğu · {me.admin?.email}
            </p>
          </div>
        </div>
        <div className="rounded-lg border border-orange-100 bg-orange-50 px-3 py-2 text-xs text-orange-800">
          Ana admin görünümü · org verisi salt okunur, destek talepleri yönetilebilir
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard icon={<Building2 className="size-4" />} label="Şirket" value={summary.org_count} color="orange" />
          <StatCard
            icon={<Users className="size-4" />}
            label="Kullanıcı"
            value={summary.total_users}
            sub={`${summary.total_departments} departman`}
            color="blue"
          />
          <StatCard icon={<MapPin className="size-4" />} label="Lokasyon" value={summary.total_locations} color="purple" />
          <StatCard
            icon={<Activity className="size-4" />}
            label="Damga"
            value={summary.total_check_ins}
            sub={`24s: ${summary.check_ins_24h}`}
            color="emerald"
          />
          <StatCard
            icon={<LifeBuoy className="size-4" />}
            label="Açık Destek"
            value={summary.support_active}
            sub={`24s: ${summary.support_24h}`}
            color="rose"
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <section className="card">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-display text-lg flex items-center gap-2">
              <LifeBuoy className="size-5 text-orange-600" />
              Destek Talepleri
            </h2>
            <span className="text-xs text-muted">{tickets.length} aktif kayıt</span>
          </div>

          <div className="space-y-2">
            {tickets.map((ticket) => (
              <div key={ticket.id} className="rounded-lg border border-orange-100 bg-white p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-sm font-semibold">{ticket.subject}</h3>
                      <Badge tone={ticket.status === 'open' ? 'orange' : 'blue'}>
                        {STATUS_LABEL[ticket.status]}
                      </Badge>
                      <Badge tone={ticket.priority === 'urgent' || ticket.priority === 'high' ? 'red' : 'stone'}>
                        {PRIORITY_LABEL[ticket.priority]}
                      </Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted">{ticket.message}</p>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
                      <span>{ticket.org_name ?? 'Org yok'}</span>
                      <span>{ticket.requester_name || ticket.requester_email}</span>
                      <span>{formatDate(ticket.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {ticket.status === 'open' && (
                      <button
                        type="button"
                        className="btn-secondary px-2 py-1 text-xs"
                        onClick={() =>
                          updateTicketMutation.mutate({ id: ticket.id, status: 'in_progress' })
                        }
                      >
                        İşleme Al
                      </button>
                    )}
                    {ticket.status !== 'resolved' && ticket.status !== 'closed' && (
                      <button
                        type="button"
                        className="btn-primary px-2 py-1 text-xs"
                        onClick={() => updateTicketMutation.mutate({ id: ticket.id, status: 'resolved' })}
                      >
                        Çözüldü
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {tickets.length === 0 && (
              <EmptyState
                icon={<CheckCircle2 className="size-5" />}
                title="Açık destek talebi yok"
                text="Yeni talepler burada şirket, kullanıcı ve öncelik bilgisiyle görünecek."
              />
            )}
          </div>
        </section>

        <section className="card">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg flex items-center gap-2">
                <UserCog className="size-5 text-orange-600" />
                Kullanıcı Erişimleri
              </h2>
              <p className="text-xs text-muted">
                {selectedOrg ? selectedOrg.name : 'Şirket seçilmedi'}
              </p>
            </div>
            {selectedOrg && (
              <Badge tone={selectedOrg.pending_user_count > 0 ? 'orange' : 'green'}>
                {selectedOrg.pending_user_count} bekleyen
              </Badge>
            )}
          </div>

          {usersLoading ? (
            <div className="py-8 text-center text-muted">
              <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
              Kullanıcılar yükleniyor
            </div>
          ) : (
            <div className="space-y-2">
              {accessUsers.map((user) => (
                <div
                  key={user.id}
                  className={cn(
                    'flex items-center justify-between gap-3 rounded-lg border px-3 py-2',
                    user.is_active ? 'border-orange-100 bg-white' : 'border-stone-200 bg-stone-50',
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{user.full_name}</span>
                      <Badge tone={roleTone(user.role)}>{ROLE_LABEL[user.role]}</Badge>
                    </div>
                    <p className="truncate text-[11px] text-muted">{user.email}</p>
                  </div>
                  <div className="text-right text-[11px] text-muted">
                    <div className={user.is_active ? 'text-emerald-700' : 'text-stone-500'}>
                      {user.is_active ? 'Aktif' : 'Pasif'}
                    </div>
                    <div>{user.last_activity ? formatDate(user.last_activity) : 'Aktivite yok'}</div>
                  </div>
                </div>
              ))}
              {accessUsers.length === 0 && (
                <EmptyState
                  icon={<AlertCircle className="size-5" />}
                  title="Kullanıcı bulunamadı"
                  text="Şirket satırına tıklayarak erişim listesini değiştirebilirsin."
                />
              )}
            </div>
          )}
        </section>
      </div>

      <section className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg flex items-center gap-2">
            <Building2 className="size-5 text-orange-600" />
            Şirketler ve Yetki Dağılımı ({orgs.length})
          </h2>
          <p className="text-xs text-muted">Satıra tıklayınca sağdaki erişim paneli güncellenir.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-orange-100 text-xs text-muted">
              <tr>
                <th className="py-2 text-left">Şirket</th>
                <th className="py-2 text-left">Plan</th>
                <th className="py-2 text-left">Yetki</th>
                <th className="py-2 text-right">Kullanıcı</th>
                <th className="py-2 text-right">Lokasyon</th>
                <th className="py-2 text-right">Damga</th>
                <th className="py-2 text-left">Son Aktivite</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-orange-50">
              {orgs.map((org) => (
                <tr
                  key={org.id}
                  className={cn(
                    'cursor-pointer transition hover:bg-orange-50/60',
                    effectiveOrgId === org.id && 'bg-orange-50',
                  )}
                  onClick={() => setSelectedOrgId(org.id)}
                >
                  <td className="py-2 pr-3">
                    <div className="font-medium">{org.name}</div>
                    <div className="text-[10px] text-muted">{org.slug ?? org.id.slice(0, 8)}</div>
                  </td>
                  <td className="py-2">
                    <span
                      className={cn(
                        'rounded px-2 py-0.5 text-xs',
                        PLAN_COLOR[org.plan] ?? 'bg-stone-100 text-stone-700',
                      )}
                    >
                      {org.plan}
                    </span>
                  </td>
                  <td className="py-2 text-xs">
                    <div className="font-medium">
                      O:{org.owner_count} A:{org.admin_count} Y:{org.manager_count}
                    </div>
                    <div className="max-w-56 truncate text-[10px] text-muted">
                      {org.owner_emails || 'Owner atanmadı'}
                    </div>
                  </td>
                  <td className="text-right tabular-nums">
                    {org.user_count}
                    {org.pending_user_count > 0 && (
                      <span className="ml-1 text-[10px] text-orange-700">+{org.pending_user_count}</span>
                    )}
                  </td>
                  <td className="text-right tabular-nums">{org.location_count}</td>
                  <td className="text-right tabular-nums">{org.check_in_count}</td>
                  <td className="py-2 text-xs text-muted">
                    {org.last_activity ? formatDate(org.last_activity) : '-'}
                  </td>
                </tr>
              ))}
              {orgs.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-xs text-muted">
                    Henüz organizasyon yok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {stats?.plan_breakdown && stats.plan_breakdown.length > 0 && (
        <section className="card">
          <h2 className="font-display mb-3 flex items-center gap-2 text-lg">
            <Clock3 className="size-5 text-orange-600" />
            Plan Dağılımı
          </h2>
          <div className="grid gap-2 md:grid-cols-2">
            {stats.plan_breakdown.map((item) => {
              const total = stats.plan_breakdown.reduce((sum, row) => sum + row.count, 0);
              const pct = total > 0 ? (item.count / total) * 100 : 0;
              return (
                <div key={item.plan} className="rounded-lg border border-orange-100 p-3">
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium">{item.plan}</span>
                    <span className="tabular-nums text-muted">
                      {item.count} ({pct.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-orange-50">
                    <div
                      className="h-full bg-gradient-to-r from-orange-400 to-orange-600"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub?: string;
  color: 'orange' | 'blue' | 'purple' | 'emerald' | 'rose';
}) {
  const gradients = {
    orange: 'from-orange-500 to-orange-700',
    blue: 'from-blue-500 to-blue-700',
    purple: 'from-purple-500 to-purple-700',
    emerald: 'from-emerald-500 to-emerald-700',
    rose: 'from-rose-500 to-rose-700',
  } as const;
  const textColors = {
    orange: 'text-orange-700',
    blue: 'text-blue-700',
    purple: 'text-purple-700',
    emerald: 'text-emerald-700',
    rose: 'text-rose-700',
  } as const;

  return (
    <div className="card">
      <div className="mb-1 flex items-start justify-between gap-2">
        <span className="text-xs text-muted">{label}</span>
        <div
          className={cn(
            'flex size-7 items-center justify-center rounded-md bg-gradient-to-br text-white',
            gradients[color],
          )}
        >
          {icon}
        </div>
      </div>
      <div className={cn('font-display text-2xl font-bold tabular-nums', textColors[color])}>
        {value.toLocaleString('tr-TR')}
      </div>
      {sub && <p className="mt-0.5 text-[11px] text-muted">{sub}</p>}
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: string }) {
  const tones: Record<string, string> = {
    orange: 'bg-orange-100 text-orange-800',
    blue: 'bg-blue-100 text-blue-800',
    green: 'bg-emerald-100 text-emerald-800',
    red: 'bg-rose-100 text-rose-800',
    stone: 'bg-stone-100 text-stone-700',
    purple: 'bg-purple-100 text-purple-800',
  };
  return (
    <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium', tones[tone])}>
      {children}
    </span>
  );
}

function EmptyState({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-orange-200 bg-orange-50/50 px-3 py-5 text-center">
      <div className="mx-auto mb-2 flex size-9 items-center justify-center rounded-full bg-white text-orange-600">
        {icon}
      </div>
      <div className="text-sm font-medium">{title}</div>
      <p className="mt-1 text-xs text-muted">{text}</p>
    </div>
  );
}

function roleTone(role: PlatformUser['role']): string {
  if (role === 'owner') return 'purple';
  if (role === 'admin') return 'orange';
  if (role === 'manager') return 'blue';
  return 'stone';
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('tr-TR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

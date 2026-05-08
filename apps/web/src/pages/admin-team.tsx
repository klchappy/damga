import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Pencil, KeyRound, UserCheck, UserX, UserPlus, Loader2, X } from 'lucide-react';
import { useAuthStore } from '@/hooks/use-auth';
import { api, getErrorMessage } from '@/lib/api';
import { ShareLinkModal } from '@/components/share-link-modal';

interface User {
  id: string;
  full_name: string;
  email: string;
  role: 'employee' | 'manager' | 'admin' | 'owner';
  department: string | null;
  title: string | null;
  hired_at: string | null;
  is_active: boolean;
  current_streak: number;
  level: number;
  annual_leave_quota_days: number;
}

interface Department {
  id: string;
  name: string;
  slug: string;
  color: string;
  is_default: boolean;
}

const ROLE_TR: Record<User['role'], string> = {
  employee: 'Çalışan',
  manager: 'Yönetici',
  admin: 'Admin',
  owner: 'Şirket Sahibi',
};

const ROLE_BADGE: Record<User['role'], string> = {
  employee: 'bg-slate-100 text-slate-700',
  manager: 'bg-blue-100 text-blue-700',
  admin: 'bg-purple-100 text-purple-700',
  owner: 'bg-orange-500 text-white',
};

export function AdminTeamPage() {
  const me = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<User | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: usersData, isLoading } = useQuery<{ items: User[] }>({
    queryKey: ['admin', 'users'],
    queryFn: async () => (await api.get('/users')).data,
  });

  const { data: deptsData } = useQuery<{ items: Department[] }>({
    queryKey: ['departments'],
    queryFn: async () => (await api.get('/departments')).data,
  });

  const resetPwMut = useMutation({
    mutationFn: async (id: string) => (await api.post(`/users/${id}/password-reset`)).data,
    onSuccess: (d) => toast.success(`📧 Şifre sıfırlama maili: ${d.sent_to}`),
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const toggleActiveMut = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) =>
      (await api.patch(`/users/${id}`, { is_active })).data,
    onSuccess: () => {
      toast.success('Durum güncellendi');
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl">👥 Ekip Yönetimi</h1>
          <p className="text-sm text-muted">
            Çalışan ekle, düzenle, departman ata, izin kotası belirle, şifre sıfırla.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="btn-primary text-sm"
        >
          <UserPlus className="size-4" />
          Yeni Çalışan Ekle
        </button>
      </div>

      {isLoading ? (
        <div className="card text-center text-muted">Yükleniyor…</div>
      ) : (usersData?.items ?? []).length === 0 ? (
        <div className="card text-center text-muted">Henüz çalışan yok.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-2 px-2">Çalışan</th>
                <th className="py-2 px-2">Rol</th>
                <th className="py-2 px-2">Departman</th>
                <th className="py-2 px-2 text-right">Yıllık İzin</th>
                <th className="py-2 px-2 text-right">L / Streak</th>
                <th className="py-2 px-2 text-right">Aksiyon</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-orange-100">
              {usersData!.items.map((u) => {
                const dept = deptsData?.items.find((d) => d.name === u.department);
                return (
                  <tr key={u.id} className={u.is_active ? '' : 'opacity-50'}>
                    <td className="py-2 px-2">
                      <div className="font-medium">{u.full_name}</div>
                      <div className="text-xs text-muted">{u.email}</div>
                    </td>
                    <td className="py-2 px-2">
                      <span className={`chip ${ROLE_BADGE[u.role]}`}>{ROLE_TR[u.role]}</span>
                    </td>
                    <td className="py-2 px-2">
                      {dept ? (
                        <span
                          className="chip"
                          style={{ background: dept.color + '22', color: dept.color }}
                        >
                          {dept.name}
                        </span>
                      ) : (
                        <span className="text-muted text-xs">{u.department ?? '—'}</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right">{u.annual_leave_quota_days} gün</td>
                    <td className="py-2 px-2 text-right text-xs text-muted">
                      L{u.level} · {u.current_streak}🔥
                    </td>
                    <td className="py-2 px-2 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => setEditing(u)}
                          title="Düzenle"
                          className="btn-ghost p-1.5"
                        >
                          <Pencil className="size-4" />
                        </button>
                        <button
                          onClick={() =>
                            confirm(`${u.email} için şifre sıfırlama maili gönderilsin mi?`) &&
                            resetPwMut.mutate(u.id)
                          }
                          title="Şifre sıfırla"
                          className="btn-ghost p-1.5"
                          disabled={resetPwMut.isPending}
                        >
                          <KeyRound className="size-4" />
                        </button>
                        {u.id !== me?.id && (
                          <button
                            onClick={() =>
                              toggleActiveMut.mutate({ id: u.id, is_active: !u.is_active })
                            }
                            title={u.is_active ? 'Pasifleştir' : 'Aktifleştir'}
                            className="btn-ghost p-1.5"
                          >
                            {u.is_active ? (
                              <UserX className="size-4 text-danger" />
                            ) : (
                              <UserCheck className="size-4 text-success" />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <EditUserModal
          user={editing}
          departments={deptsData?.items ?? []}
          isOwner={me?.role === 'owner'}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['admin', 'users'] });
            setEditing(null);
          }}
        />
      )}

      {creating && (
        <CreateUserModal
          departments={deptsData?.items ?? []}
          isOwner={me?.role === 'owner'}
          onClose={() => setCreating(false)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ['admin', 'users'] });
          }}
        />
      )}
    </div>
  );
}

function CreateUserModal({
  departments,
  isOwner,
  onClose,
  onCreated,
}: {
  departments: Department[];
  isOwner: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    role: 'employee' as User['role'],
    department: departments[0]?.name ?? 'Diğer',
    title: '',
    hired_at: '',
    annual_leave_quota_days: 14,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [shareData, setShareData] = useState<{
    name: string;
    email: string;
    link: string | null;
    error: string | null;
  } | null>(null);

  const validate = () => {
    const e: Record<string, string> = {};
    if (form.full_name.trim().length < 2) e.full_name = 'Ad soyad gerekli (en az 2 karakter)';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Geçerli e-posta gir';
    if (form.annual_leave_quota_days < 0 || form.annual_leave_quota_days > 60)
      e.annual_leave_quota_days = '0-60 arası';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const mut = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        full_name: form.full_name.trim(),
        email: form.email.trim().toLowerCase(),
        role: form.role,
        department: form.department,
        annual_leave_quota_days: form.annual_leave_quota_days,
      };
      if (form.title.trim()) payload.title = form.title.trim();
      if (form.hired_at) payload.hired_at = form.hired_at;
      const r = await api.post('/users', payload);
      return r.data as {
        user: User;
        password_reset_link: string | null;
        password_reset_error: string | null;
      };
    },
    onSuccess: (data) => {
      toast.success(`✅ ${data.user.full_name} eklendi`);
      onCreated();
      // Form modal'ı kapatma — yerine paylaşım modal'ı göster
      setShareData({
        name: data.user.full_name,
        email: data.user.email,
        link: data.password_reset_link,
        error: data.password_reset_error,
      });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  if (shareData) {
    return (
      <ShareLinkModal
        title="Çalışan eklendi"
        description="Şifre belirleme linkini kullanıcıya ulaştır — dilediğin kanaldan (WhatsApp, kurumsal mail, fiziksel teslim). Mail göndermeden link'i paylaşabilirsin."
        recipientName={shareData.name}
        recipientEmail={shareData.email}
        link={shareData.link}
        error={shareData.error}
        onClose={() => {
          setShareData(null);
          onClose();
        }}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="inline-flex items-center gap-1.5 text-orange-600 text-xs font-medium uppercase tracking-wider">
              <UserPlus className="size-3.5" /> Yeni Çalışan
            </div>
            <h3 className="font-display text-xl mt-1">Şirketine yeni biri ekle</h3>
            <p className="text-xs text-muted mt-1">
              Hesap oluşturulur ve <strong className="text-ink">şifre belirleme link'i</strong>{' '}
              ekrana gelir — WhatsApp/kurumsal mail/fiziksel teslim ile manuel paylaşırsın
              (Supabase mail rate-limit'inden bağımsız).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost p-1.5 -mt-1 -mr-1"
            disabled={mut.isPending}
            aria-label="Kapat"
          >
            <X className="size-4" />
          </button>
        </div>

        <div>
          <label className="label">Ad Soyad *</label>
          <input
            className="input mt-1"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            placeholder="Ayşe Yılmaz"
            autoFocus
          />
          {errors.full_name && (
            <p className="mt-1 text-xs text-danger">{errors.full_name}</p>
          )}
        </div>

        <div>
          <label className="label">Kurumsal E-posta *</label>
          <input
            type="email"
            className="input mt-1"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="ayse@sirket.com"
          />
          {errors.email && <p className="mt-1 text-xs text-danger">{errors.email}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Rol</label>
            <select
              className="input mt-1"
              value={form.role}
              onChange={(e) =>
                setForm({ ...form, role: e.target.value as User['role'] })
              }
            >
              <option value="employee">Çalışan</option>
              <option value="manager">Yönetici</option>
              <option value="admin">Admin</option>
              {isOwner && <option value="owner">Şirket Sahibi</option>}
            </select>
          </div>
          <div>
            <label className="label">Departman</label>
            <select
              className="input mt-1"
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
            >
              {departments.length === 0 ? (
                <>
                  <option value="Satış">Satış</option>
                  <option value="Sevk">Sevk</option>
                  <option value="Muhasebe">Muhasebe</option>
                  <option value="Diğer">Diğer</option>
                </>
              ) : (
                departments.map((d) => (
                  <option key={d.id} value={d.name}>
                    {d.name}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        <div>
          <label className="label">Pozisyon (opsiyonel)</label>
          <input
            className="input mt-1"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Yazılım Geliştirici"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">İşe Giriş</label>
            <input
              type="date"
              className="input mt-1"
              value={form.hired_at}
              onChange={(e) => setForm({ ...form, hired_at: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Yıllık İzin</label>
            <input
              type="number"
              min={0}
              max={60}
              className="input mt-1"
              value={form.annual_leave_quota_days}
              onChange={(e) =>
                setForm({
                  ...form,
                  annual_leave_quota_days: Number(e.target.value),
                })
              }
            />
            {errors.annual_leave_quota_days && (
              <p className="mt-1 text-xs text-danger">{errors.annual_leave_quota_days}</p>
            )}
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={mut.isPending}
            className="btn-outline flex-1"
          >
            İptal
          </button>
          <button
            type="button"
            onClick={() => {
              if (!validate()) return;
              mut.mutate();
            }}
            disabled={mut.isPending}
            className="btn-primary flex-1"
          >
            {mut.isPending && <Loader2 className="size-4 animate-spin" />}
            Ekle ve Şifre Linkini Göster
          </button>
        </div>
      </div>
    </div>
  );
}

function EditUserModal({
  user,
  departments,
  isOwner,
  onClose,
  onSaved,
}: {
  user: User;
  departments: Department[];
  isOwner: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    full_name: user.full_name,
    role: user.role,
    department: user.department ?? 'Diğer',
    title: user.title ?? '',
    hired_at: user.hired_at ?? '',
    annual_leave_quota_days: user.annual_leave_quota_days,
    is_active: user.is_active,
  });

  const mut = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = { ...form };
      if (!payload.title) payload.title = null;
      if (!payload.hired_at) payload.hired_at = null;
      return (await api.patch(`/users/${user.id}`, payload)).data;
    },
    onSuccess: () => {
      toast.success('✓ Güncellendi');
      onSaved();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className="font-display text-xl">Çalışanı düzenle</h3>
          <p className="text-xs text-muted">{user.email}</p>
        </div>

        <div>
          <label className="label">Ad Soyad</label>
          <input
            className="input mt-1"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          />
        </div>

        <div>
          <label className="label">Rol</label>
          <select
            className="input mt-1"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as User['role'] })}
          >
            <option value="employee">Çalışan</option>
            <option value="manager">Yönetici</option>
            <option value="admin">Admin</option>
            {isOwner && <option value="owner">Şirket Sahibi</option>}
          </select>
        </div>

        <div>
          <label className="label">Departman</label>
          <select
            className="input mt-1"
            value={form.department}
            onChange={(e) => setForm({ ...form, department: e.target.value })}
          >
            {departments.map((d) => (
              <option key={d.id} value={d.name}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Pozisyon (ünvan)</label>
          <input
            className="input mt-1"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Yazılım Geliştirici"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">İşe Giriş</label>
            <input
              type="date"
              className="input mt-1"
              value={form.hired_at}
              onChange={(e) => setForm({ ...form, hired_at: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Yıllık İzin (gün)</label>
            <input
              type="number"
              min={0}
              max={365}
              className="input mt-1"
              value={form.annual_leave_quota_days}
              onChange={(e) =>
                setForm({ ...form, annual_leave_quota_days: Number(e.target.value) })
              }
            />
          </div>
        </div>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
          />
          <span className="text-sm">Aktif (kapatınca giriş yapamaz)</span>
        </label>

        <div className="flex gap-2 pt-3">
          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending}
            className="btn-primary flex-1"
          >
            Kaydet
          </button>
          <button onClick={onClose} className="btn-outline">
            İptal
          </button>
        </div>
      </div>
    </div>
  );
}

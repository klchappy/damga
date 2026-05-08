import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Loader2,
  Mail,
  UserPlus,
  Clock,
  CheckCircle2,
  Users as UsersIcon,
  Building2,
} from 'lucide-react';
import { useAuthStore } from '@/hooks/use-auth';
import { api, getErrorMessage } from '@/lib/api';

interface PendingUser {
  id: string;
  email: string;
  full_name: string;
  department: string | null;
  created_at: string;
}

interface Department {
  id: string;
  name: string;
  slug: string;
  is_default: boolean;
}

/**
 * Admin/owner: kendi şirketine kayıt olmuş ama atanmamış (org_id=null +
 * is_pending=true) kullanıcıları yönetir.
 *
 * Backend güvenliği: assign endpoint sadece authOrgId == body.org_id'e izin verir.
 * Yani aynı listeyi farklı şirketler görse bile sadece KENDI org'larına ekleyebilirler.
 */
export function AdminPendingUsersPage() {
  const me = useAuthStore((s) => s.user);
  const myOrgId = me?.org_id ?? null;
  const qc = useQueryClient();

  const { data: pendingData, isLoading } = useQuery<{ items: PendingUser[] }>({
    queryKey: ['admin', 'pending-users'],
    queryFn: async () => (await api.get('/admin/pending-users')).data,
  });

  const { data: deptsData } = useQuery<{ items: Department[] }>({
    queryKey: ['admin', 'departments'],
    queryFn: async () => (await api.get('/departments')).data,
  });

  const items = pendingData?.items ?? [];
  const departments = deptsData?.items ?? [];

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-orange-500 text-white">
          <UsersIcon className="size-6" />
        </div>
        <div>
          <h1 className="font-display text-3xl">Bekleyen Kullanıcılar</h1>
          <p className="text-sm text-muted">
            Kayıt olmuş ama henüz bir şirkete atanmamış kullanıcılar. Onları kendi şirketine
            ekle.
          </p>
        </div>
      </div>

      <div className="rounded-md border border-orange-100 bg-orange-50/40 p-3 text-sm flex items-start gap-2">
        <Building2 className="size-5 text-orange-500 mt-0.5 shrink-0" />
        <div>
          <strong className="text-ink">Bilgi:</strong> Bu listede gördüğün her kullanıcı
          kendisi self-signup yaptı. "Şirketime ekle" dediğinde{' '}
          <strong className="text-ink">{me?.org_id ? me.full_name : ''}</strong> 'ın bağlı
          olduğu şirkete atanır — başka bir org seçemezsin.
        </div>
      </div>

      {isLoading ? (
        <div className="card flex items-center justify-center py-12 text-muted">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="card text-center py-12">
          <CheckCircle2 className="size-10 mx-auto text-success/60" />
          <p className="mt-3 text-sm text-muted">Şu an bekleyen kullanıcı yok.</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((u) => (
            <PendingUserCard
              key={u.id}
              user={u}
              departments={departments}
              myOrgId={myOrgId}
              onAssigned={() => {
                void qc.invalidateQueries({ queryKey: ['admin', 'pending-users'] });
                void qc.invalidateQueries({ queryKey: ['admin', 'users'] });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PendingUserCard({
  user,
  departments,
  myOrgId,
  onAssigned,
}: {
  user: PendingUser;
  departments: Department[];
  myOrgId: string | null;
  onAssigned: () => void;
}) {
  const [role, setRole] = useState<'employee' | 'manager' | 'admin'>('employee');
  const [department, setDepartment] = useState<string>('Diğer');

  const assignMut = useMutation({
    mutationFn: async () => {
      if (!myOrgId) throw new Error('Org bilgin yok');
      const r = await api.post(`/admin/pending-users/${user.id}/assign`, {
        org_id: myOrgId,
        role,
        department,
      });
      return r.data;
    },
    onSuccess: () => {
      toast.success(`✅ ${user.full_name} şirketine eklendi`);
      onAssigned();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <div className="card space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-lg leading-tight">{user.full_name}</h3>
          <a
            href={`mailto:${user.email}`}
            className="text-xs text-muted hover:text-orange-600 inline-flex items-center gap-1"
          >
            <Mail className="size-3" /> {user.email}
          </a>
        </div>
        <span className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded-full bg-warning/10 text-warning border border-warning/30">
          <Clock className="size-3" /> Bekliyor
        </span>
      </div>

      <div className="text-xs text-muted">
        Kayıt: {new Date(user.created_at).toLocaleString('tr-TR')}
      </div>

      <hr className="border-orange-100" />

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label text-xs">Rol</label>
          <select
            value={role}
            onChange={(e) =>
              setRole(e.target.value as 'employee' | 'manager' | 'admin')
            }
            className="input mt-1 text-sm"
            disabled={assignMut.isPending}
          >
            <option value="employee">Çalışan</option>
            <option value="manager">Yönetici</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div>
          <label className="label text-xs">Departman</label>
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="input mt-1 text-sm"
            disabled={assignMut.isPending}
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

      <button
        onClick={() => assignMut.mutate()}
        disabled={assignMut.isPending || !myOrgId}
        className="btn-primary w-full text-sm"
      >
        {assignMut.isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <UserPlus className="size-4" />
        )}
        Şirketime Ekle
      </button>
    </div>
  );
}

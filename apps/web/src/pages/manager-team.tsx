import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createUserSchema, type CreateUserInput } from '@damga/shared';
import { toast } from 'sonner';
import { Plus, UserCog } from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';

interface User {
  id: string;
  full_name: string;
  email: string;
  role: string;
  department: string | null;
  title: string | null;
  is_active: boolean;
  current_streak: number;
  level: number;
}

export function ManagerTeamPage() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);

  const { data } = useQuery<{ items: User[] }>({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/users')).data,
  });

  return (
    <div className="container mx-auto max-w-5xl px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl">👥 Ekip</h1>
        <button onClick={() => setShowAdd(true)} className="btn-primary">
          <Plus className="size-4" /> Yeni Çalışan
        </button>
      </div>

      {showAdd && (
        <AddUser
          onClose={() => setShowAdd(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: ['users'] })}
        />
      )}

      <div className="card">
        {(data?.items ?? []).length === 0 ? (
          <p className="text-sm text-muted">Henüz çalışan yok.</p>
        ) : (
          <ul className="divide-y divide-orange-100">
            {data!.items.map((u) => (
              <li key={u.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-orange-100 font-display font-semibold">
                    {u.full_name.charAt(0)}
                  </div>
                  <div>
                    <div className="font-medium flex items-center gap-1">
                      {u.full_name}
                      {!u.is_active && <span className="chip bg-muted/10 text-muted">pasif</span>}
                    </div>
                    <div className="text-xs text-muted">
                      {u.email} · {u.role}
                      {u.department && ` · ${u.department}`}
                    </div>
                  </div>
                </div>
                <div className="text-right text-xs text-muted">
                  L{u.level} · seri {u.current_streak}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AddUser({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      email: '',
      full_name: '',
      role: 'employee',
      annual_leave_quota_days: 14,
    },
  });

  const mut = useMutation({
    mutationFn: async (data: CreateUserInput) => (await api.post('/users', data)).data,
    onSuccess: () => {
      toast.success('✅ Çalışan eklendi');
      onCreated();
      onClose();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <form onSubmit={handleSubmit((d) => mut.mutate(d))} className="card space-y-3">
      <h3 className="font-display text-xl">Yeni Çalışan</h3>
      <div>
        <label className="label">Ad Soyad</label>
        <input className="input mt-1" {...register('full_name')} />
        {errors.full_name && <p className="text-xs text-danger">{errors.full_name.message}</p>}
      </div>
      <div>
        <label className="label">E-posta</label>
        <input className="input mt-1" type="email" {...register('email')} />
        {errors.email && <p className="text-xs text-danger">{errors.email.message}</p>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Rol</label>
          <select className="input mt-1" {...register('role')}>
            <option value="employee">Çalışan</option>
            <option value="manager">Yönetici</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div>
          <label className="label">Departman</label>
          <input className="input mt-1" {...register('department')} placeholder="Yazılım" />
        </div>
      </div>
      <div className="flex gap-2">
        <button disabled={mut.isPending} className="btn-primary">
          <UserCog className="size-4" /> Ekle
        </button>
        <button type="button" onClick={onClose} className="btn-outline">
          İptal
        </button>
      </div>
    </form>
  );
}

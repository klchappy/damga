import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createLeaveSchema, type CreateLeaveInput } from '@damga/shared';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';

interface Leave {
  id: string;
  type: string;
  start_date: string;
  end_date: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reason?: string | null;
  business_days?: string | null;
  rejection_reason?: string | null;
}

export function LeavesMinePage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const { data } = useQuery<{ items: Leave[] }>({
    queryKey: ['leaves', 'me'],
    queryFn: async () => (await api.get('/leaves')).data,
  });

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl">📅 İzinlerim</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="size-4" /> Yeni İzin
        </button>
      </div>

      {showCreate && (
        <CreateLeave
          onClose={() => setShowCreate(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: ['leaves', 'me'] })}
        />
      )}

      {(data?.items ?? []).length === 0 ? (
        <div className="card text-center text-muted">Henüz izin talebi yok.</div>
      ) : (
        <div className="space-y-2">
          {data!.items.map((l) => (
            <div key={l.id} className="card flex items-center justify-between">
              <div>
                <div className="font-medium">
                  {l.type} · {l.start_date} → {l.end_date}{' '}
                  {l.business_days && <span className="text-xs text-muted">({l.business_days} iş günü)</span>}
                </div>
                {l.reason && <div className="text-sm text-muted">{l.reason}</div>}
                {l.rejection_reason && (
                  <div className="text-sm text-danger mt-1">Red: {l.rejection_reason}</div>
                )}
              </div>
              <span
                className={`chip ${
                  l.status === 'approved'
                    ? 'bg-success/10 text-success'
                    : l.status === 'rejected'
                      ? 'bg-danger/10 text-danger'
                      : l.status === 'cancelled'
                        ? 'bg-muted/10 text-muted'
                        : 'bg-warning/10 text-warning'
                }`}
              >
                {l.status === 'pending' ? 'beklemede' : l.status === 'approved' ? 'onaylı' : l.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateLeave({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateLeaveInput>({
    resolver: zodResolver(createLeaveSchema),
    defaultValues: { type: 'annual', start_date: '', end_date: '', half_day: false, reason: '' },
  });
  const mut = useMutation({
    mutationFn: async (data: CreateLeaveInput) => (await api.post('/leaves', data)).data,
    onSuccess: () => {
      toast.success('✅ İzin talebi gönderildi');
      onCreated();
      onClose();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <form onSubmit={handleSubmit((d) => mut.mutate(d))} className="card space-y-3">
      <h3 className="font-display text-xl">Yeni izin talebi</h3>
      <div>
        <label className="label">Tip</label>
        <select className="input mt-1" {...register('type')}>
          <option value="annual">Yıllık</option>
          <option value="sick">Hastalık</option>
          <option value="unpaid">Ücretsiz</option>
          <option value="maternity">Doğum</option>
          <option value="paternity">Babalık</option>
          <option value="compassionate">Mazeret</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Başlangıç</label>
          <input type="date" className="input mt-1" {...register('start_date')} />
          {errors.start_date && (
            <p className="text-xs text-danger">{errors.start_date.message}</p>
          )}
        </div>
        <div>
          <label className="label">Bitiş</label>
          <input type="date" className="input mt-1" {...register('end_date')} />
          {errors.end_date && <p className="text-xs text-danger">{errors.end_date.message}</p>}
        </div>
      </div>
      <div>
        <label className="label">Açıklama (opsiyonel)</label>
        <textarea className="input mt-1" rows={3} {...register('reason')} />
      </div>
      <div className="flex gap-2">
        <button disabled={mut.isPending} className="btn-primary">
          Gönder
        </button>
        <button type="button" onClick={onClose} className="btn-outline">
          İptal
        </button>
      </div>
    </form>
  );
}

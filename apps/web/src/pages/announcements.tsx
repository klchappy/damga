import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  Pin,
  Plus,
  X,
  Loader2,
  Megaphone,
  Sparkles,
  AlertTriangle,
  Siren,
  Info,
} from 'lucide-react';
import {
  createAnnouncementSchema,
  type CreateAnnouncementInput,
} from '@damga/shared';

type AnnouncementCategory = 'info' | 'celebration' | 'warning' | 'urgent';
import { api, getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/hooks/use-auth';
import { formatDateTimeTr } from '@/lib/utils';

interface Announcement {
  id: string;
  category: 'info' | 'celebration' | 'warning' | 'urgent';
  title: string;
  body: string;
  pinned: boolean;
  created_at: string;
  creator_name?: string;
  is_read: boolean;
}

const CATEGORY_STYLE: Record<string, string> = {
  info: 'bg-orange-50 border-orange-100',
  celebration: 'bg-success/5 border-success/30',
  warning: 'bg-warning/5 border-warning/30',
  urgent: 'bg-danger/5 border-danger/30',
};
const CATEGORY_EMOJI: Record<string, string> = {
  info: 'ℹ️',
  celebration: '🎉',
  warning: '⚠️',
  urgent: '🚨',
};

const CATEGORY_OPTIONS: Array<{
  value: AnnouncementCategory;
  label: string;
  icon: React.ReactNode;
  hint: string;
}> = [
  {
    value: 'info',
    label: 'Bilgi',
    icon: <Info className="size-4" />,
    hint: 'Genel bilgilendirme',
  },
  {
    value: 'celebration',
    label: 'Kutlama',
    icon: <Sparkles className="size-4" />,
    hint: 'Doğum günü, başarı',
  },
  {
    value: 'warning',
    label: 'Uyarı',
    icon: <AlertTriangle className="size-4" />,
    hint: 'Dikkat edilmesi gereken',
  },
  {
    value: 'urgent',
    label: 'Acil',
    icon: <Siren className="size-4" />,
    hint: 'Anında aksiyon gerektiren',
  },
];

export function AnnouncementsPage() {
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const canCreate = !!me && ['manager', 'admin', 'owner'].includes(me.role);
  const [showCreate, setShowCreate] = useState(false);

  const { data } = useQuery<{ items: Announcement[] }>({
    queryKey: ['announcements'],
    queryFn: async () => (await api.get('/announcements')).data,
  });

  const readMut = useMutation({
    mutationFn: async (id: string) => api.post(`/announcements/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements'] }),
  });

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-3xl flex items-center gap-2">
          <Megaphone className="size-7 text-orange-500" /> Duyurular
        </h1>
        {canCreate && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="btn-primary text-sm"
          >
            <Plus className="size-4" />
            Yeni Duyuru
          </button>
        )}
      </div>

      {(data?.items ?? []).length === 0 ? (
        <div className="card text-center text-muted py-10">
          <Megaphone className="size-10 mx-auto opacity-40 mb-2" />
          <p>Henüz duyuru yok.</p>
          {canCreate && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="mt-3 text-sm text-orange-600 underline-offset-4 hover:underline"
            >
              İlk duyuruyu sen yayınla →
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {data!.items.map((a) => (
            <div
              key={a.id}
              className={`rounded-lg border p-4 space-y-2 cursor-pointer ${
                CATEGORY_STYLE[a.category] ?? CATEGORY_STYLE.info
              } ${a.is_read ? 'opacity-70' : ''}`}
              onClick={() => !a.is_read && readMut.mutate(a.id)}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-display text-lg flex items-center gap-1.5">
                  {a.pinned && <Pin className="size-4 text-orange-600" />}
                  <span>{CATEGORY_EMOJI[a.category]}</span>
                  <span>{a.title}</span>
                </h3>
                {!a.is_read && <span className="chip bg-orange-500 text-white">Yeni</span>}
              </div>
              <p className="text-sm whitespace-pre-wrap">{a.body}</p>
              <div className="text-xs text-muted">
                {a.creator_name && `${a.creator_name} · `}
                {formatDateTimeTr(a.created_at)}
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && canCreate && (
        <CreateAnnouncementModal onClose={() => setShowCreate(false)} />
      )}
    </div>
  );
}

function CreateAnnouncementModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateAnnouncementInput>({
    resolver: zodResolver(createAnnouncementSchema),
    defaultValues: {
      category: 'info',
      title: '',
      body: '',
      target_user_ids: [],
      pinned: false,
    },
  });
  const category = watch('category');
  const pinned = watch('pinned');

  const createMut = useMutation({
    mutationFn: async (input: CreateAnnouncementInput) => {
      const r = await api.post('/announcements', input);
      return r.data;
    },
    onSuccess: () => {
      toast.success('📣 Duyuru yayınlandı');
      void qc.invalidateQueries({ queryKey: ['announcements'] });
      onClose();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const onSubmit = (data: CreateAnnouncementInput) => {
    createMut.mutate(data);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-3 py-4 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl card space-y-4 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl">Yeni Duyuru</h2>
            <p className="text-sm text-muted">Tüm şirkete duyuru gönder.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost p-1.5"
            disabled={isSubmitting || createMut.isPending}
          >
            <X className="size-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="label">Kategori</label>
            <div className="mt-1 grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CATEGORY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setValue('category', opt.value, { shouldDirty: true })}
                  className={`text-left rounded-lg border-2 p-2.5 transition ${
                    category === opt.value
                      ? 'border-orange-400 bg-orange-50/60'
                      : 'border-orange-100 bg-white hover:border-orange-200'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-sm font-medium text-ink">
                    {opt.icon}
                    <span>{opt.label}</span>
                  </div>
                  <div className="text-[11px] text-muted mt-0.5">{opt.hint}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Başlık</label>
            <input
              className="input mt-1"
              placeholder="Örn: Pazartesi tüm departman 09:30 toplantı"
              maxLength={150}
              {...register('title')}
            />
            {errors.title && <p className="mt-1 text-xs text-danger">{errors.title.message}</p>}
          </div>

          <div>
            <label className="label">İçerik</label>
            <textarea
              rows={5}
              className="input mt-1 resize-none"
              placeholder="Detayları yaz — emoji kullanabilirsin 🎉"
              maxLength={2000}
              {...register('body')}
            />
            {errors.body && <p className="mt-1 text-xs text-danger">{errors.body.message}</p>}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={pinned}
              onChange={(e) => setValue('pinned', e.target.checked, { shouldDirty: true })}
            />
            <Pin className="size-4 text-orange-500" />
            <span>En üste sabitle</span>
          </label>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={createMut.isPending}
              className="btn-outline flex-1"
            >
              İptal
            </button>
            <button type="submit" disabled={createMut.isPending} className="btn-primary flex-1">
              {createMut.isPending && <Loader2 className="size-4 animate-spin" />}
              Yayınla
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

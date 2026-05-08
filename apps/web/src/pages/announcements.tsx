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
  Pencil,
  Trash2,
  MessageSquare,
  Send,
  EyeOff,
} from 'lucide-react';
import {
  createAnnouncementSchema,
  updateAnnouncementSchema,
  type CreateAnnouncementInput,
  type UpdateAnnouncementInput,
} from '@damga/shared';
import { api, getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/hooks/use-auth';
import { formatDateTimeTr } from '@/lib/utils';

type AnnouncementCategory = 'info' | 'celebration' | 'warning' | 'urgent';

interface Announcement {
  id: string;
  category: AnnouncementCategory;
  title: string;
  body: string;
  pinned: boolean;
  created_at: string;
  expires_at?: string | null;
  creator_name?: string;
  is_read: boolean;
}

interface CommentRow {
  id: string;
  comment: string;
  created_at: string;
  user_name: string | null;
  department: string | null;
  user_id: string;
  is_self: boolean;
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
  { value: 'info', label: 'Bilgi', icon: <Info className="size-4" />, hint: 'Genel bilgilendirme' },
  { value: 'celebration', label: 'Kutlama', icon: <Sparkles className="size-4" />, hint: 'Doğum günü, başarı' },
  { value: 'warning', label: 'Uyarı', icon: <AlertTriangle className="size-4" />, hint: 'Dikkat gereken' },
  { value: 'urgent', label: 'Acil', icon: <Siren className="size-4" />, hint: 'Anında aksiyon' },
];

export function AnnouncementsPage() {
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const isAdminOrOwner = !!me && ['admin', 'owner'].includes(me.role);
  const isManagerOrAbove = !!me && ['manager', 'admin', 'owner'].includes(me.role);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);

  const { data } = useQuery<{ items: Announcement[] }>({
    queryKey: ['announcements'],
    queryFn: async () => (await api.get('/announcements')).data,
  });

  const readMut = useMutation({
    mutationFn: async (id: string) => api.post(`/announcements/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements'] }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => api.delete(`/announcements/${id}`),
    onSuccess: () => {
      toast.success('Duyuru silindi');
      void qc.invalidateQueries({ queryKey: ['announcements'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-3xl flex items-center gap-2">
          <Megaphone className="size-7 text-orange-500" /> Duyurular
        </h1>
        {isAdminOrOwner && (
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
          {isAdminOrOwner && (
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
            <AnnouncementCard
              key={a.id}
              ann={a}
              isAdminOrOwner={isAdminOrOwner}
              isManagerOrAbove={isManagerOrAbove}
              onMarkRead={() => readMut.mutate(a.id)}
              onEdit={() => setEditing(a)}
              onDelete={() => {
                if (window.confirm(`"${a.title}" duyurusu silinecek. Onaylıyor musun?`)) {
                  deleteMut.mutate(a.id);
                }
              }}
            />
          ))}
        </div>
      )}

      {showCreate && isAdminOrOwner && (
        <CreateAnnouncementModal onClose={() => setShowCreate(false)} />
      )}
      {editing && isAdminOrOwner && (
        <EditAnnouncementModal
          ann={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function AnnouncementCard({
  ann,
  isAdminOrOwner,
  isManagerOrAbove,
  onMarkRead,
  onEdit,
  onDelete,
}: {
  ann: Announcement;
  isAdminOrOwner: boolean;
  isManagerOrAbove: boolean;
  onMarkRead: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [showComments, setShowComments] = useState(false);

  return (
    <div
      className={`rounded-lg border p-4 space-y-3 ${
        CATEGORY_STYLE[ann.category] ?? CATEGORY_STYLE.info
      } ${ann.is_read ? 'opacity-80' : ''}`}
    >
      <div
        className="space-y-2 cursor-pointer"
        onClick={() => !ann.is_read && onMarkRead()}
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-lg flex items-center gap-1.5 flex-wrap">
            {ann.pinned && <Pin className="size-4 text-orange-600" />}
            <span>{CATEGORY_EMOJI[ann.category]}</span>
            <span>{ann.title}</span>
          </h3>
          <div className="flex items-center gap-1.5 shrink-0">
            {!ann.is_read && (
              <span className="chip bg-orange-500 text-white text-[10px]">Yeni</span>
            )}
            {isAdminOrOwner && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit();
                  }}
                  className="btn-ghost p-1.5"
                  title="Düzenle"
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                  className="btn-ghost p-1.5 text-danger hover:bg-danger/10"
                  title="Sil"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
        <p className="text-sm whitespace-pre-wrap">{ann.body}</p>
        <div className="text-xs text-muted">
          {ann.creator_name && `${ann.creator_name} · `}
          {formatDateTimeTr(ann.created_at)}
        </div>
      </div>

      <div className="border-t border-orange-100 pt-2.5">
        <button
          type="button"
          onClick={() => setShowComments((s) => !s)}
          className="text-xs text-muted hover:text-orange-600 inline-flex items-center gap-1.5"
        >
          <MessageSquare className="size-3.5" />
          {showComments ? 'Yorumları gizle' : 'Yorum yaz / yorumları gör'}
          {isManagerOrAbove && (
            <span className="chip bg-orange-100 text-orange-600 text-[9px] ml-1">
              tüm yorumları görürsün
            </span>
          )}
        </button>
        {showComments && (
          <CommentsBlock announcementId={ann.id} isManagerOrAbove={isManagerOrAbove} />
        )}
      </div>
    </div>
  );
}

function CommentsBlock({
  announcementId,
  isManagerOrAbove,
}: {
  announcementId: string;
  isManagerOrAbove: boolean;
}) {
  const qc = useQueryClient();
  const [comment, setComment] = useState('');

  const { data, isLoading } = useQuery<{ items: CommentRow[]; scope: 'all' | 'self' }>({
    queryKey: ['announcement-comments', announcementId],
    queryFn: async () =>
      (await api.get(`/announcements/${announcementId}/comments`)).data,
  });

  const addMut = useMutation({
    mutationFn: async () => {
      const r = await api.post(`/announcements/${announcementId}/comments`, {
        comment: comment.trim(),
      });
      return r.data;
    },
    onSuccess: () => {
      toast.success('Yorum eklendi');
      setComment('');
      void qc.invalidateQueries({ queryKey: ['announcement-comments', announcementId] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) =>
      api.delete(`/announcements/${announcementId}/comments/${id}`),
    onSuccess: () => {
      toast.success('Yorum silindi');
      void qc.invalidateQueries({ queryKey: ['announcement-comments', announcementId] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="mt-3 space-y-2.5">
      <div className="rounded-md bg-white/70 border border-orange-100 p-2 space-y-1.5">
        <textarea
          rows={2}
          maxLength={1000}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={
            isManagerOrAbove
              ? 'Yorum yaz... (yöneticisin, tüm yorumları görürsün)'
              : 'Yorum yaz... (sadece sen ve yöneticilerin görür)'
          }
          className="w-full text-sm resize-none border-0 outline-0 bg-transparent placeholder:text-muted/70"
        />
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted">{comment.length}/1000</span>
          <button
            type="button"
            onClick={() => addMut.mutate()}
            disabled={comment.trim().length < 1 || addMut.isPending}
            className="btn-primary text-xs py-1 px-2.5"
          >
            {addMut.isPending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Send className="size-3" />
            )}
            Gönder
          </button>
        </div>
      </div>

      {!isManagerOrAbove && (
        <div className="rounded-md bg-orange-50/60 border border-orange-100 px-2.5 py-1.5 text-[11px] text-muted flex items-start gap-1.5">
          <EyeOff className="size-3 text-orange-500 shrink-0 mt-0.5" />
          <span>
            Yorumların sadece sen ve şirket <strong className="text-ink">admin/yöneticileri</strong>{' '}
            tarafından görülür. Diğer çalışanlar göremez.
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-2">
          <Loader2 className="size-4 animate-spin text-orange-400" />
        </div>
      ) : (data?.items ?? []).length === 0 ? (
        <div className="text-center text-xs text-muted py-2">Henüz yorum yok.</div>
      ) : (
        <div className="space-y-1.5">
          {data!.items.map((c) => (
            <div
              key={c.id}
              className={`rounded-md border px-2.5 py-1.5 text-sm ${
                c.is_self
                  ? 'bg-orange-50 border-orange-200'
                  : 'bg-white border-orange-100'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-[11px] text-muted">
                  <strong className="text-ink">{c.user_name ?? '—'}</strong>
                  {c.department && <> · {c.department}</>}
                  <> · {formatDateTimeTr(c.created_at)}</>
                  {c.is_self && (
                    <span className="chip bg-orange-500 text-white text-[9px] ml-1.5 px-1.5 py-0">
                      sen
                    </span>
                  )}
                </div>
                {(c.is_self || isManagerOrAbove) && (
                  <button
                    type="button"
                    onClick={() => deleteMut.mutate(c.id)}
                    className="btn-ghost p-0.5 text-muted hover:text-danger"
                    title="Sil"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
              <p className="mt-0.5 text-ink whitespace-pre-wrap">{c.comment}</p>
            </div>
          ))}
        </div>
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

        <form onSubmit={handleSubmit((d) => createMut.mutate(d))} className="space-y-4">
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
              placeholder="Pazartesi 09:30 toplantı"
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
            <Pin className="size-4 text-orange-500" /> En üste sabitle
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

function EditAnnouncementModal({
  ann,
  onClose,
}: {
  ann: Announcement;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<UpdateAnnouncementInput>({
    resolver: zodResolver(updateAnnouncementSchema),
    defaultValues: {
      category: ann.category,
      title: ann.title,
      body: ann.body,
      pinned: ann.pinned,
    },
  });
  const category = watch('category');
  const pinned = watch('pinned');

  const updateMut = useMutation({
    mutationFn: async (input: UpdateAnnouncementInput) => {
      const r = await api.patch(`/announcements/${ann.id}`, input);
      return r.data;
    },
    onSuccess: () => {
      toast.success('Duyuru güncellendi');
      void qc.invalidateQueries({ queryKey: ['announcements'] });
      onClose();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

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
            <div className="inline-flex items-center gap-1.5 text-orange-600 text-xs font-medium uppercase tracking-wider">
              <Pencil className="size-3.5" /> Düzenle
            </div>
            <h2 className="font-display text-xl mt-1">{ann.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost p-1.5"
            aria-label="Kapat"
          >
            <X className="size-5" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit((d) => updateMut.mutate(d))}
          className="space-y-4"
        >
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
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Başlık</label>
            <input className="input mt-1" maxLength={150} {...register('title')} />
            {errors.title && <p className="mt-1 text-xs text-danger">{errors.title.message}</p>}
          </div>
          <div>
            <label className="label">İçerik</label>
            <textarea
              rows={5}
              className="input mt-1 resize-none"
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
            <Pin className="size-4 text-orange-500" /> En üste sabitle
          </label>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={updateMut.isPending}
              className="btn-outline flex-1"
            >
              İptal
            </button>
            <button type="submit" disabled={updateMut.isPending} className="btn-primary flex-1">
              {updateMut.isPending && <Loader2 className="size-4 animate-spin" />}
              Kaydet
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pin } from 'lucide-react';
import { api } from '@/lib/api';
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

export function AnnouncementsPage() {
  const qc = useQueryClient();
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
      <h1 className="text-3xl">📢 Duyurular</h1>
      {(data?.items ?? []).length === 0 ? (
        <div className="card text-center text-muted">Henüz duyuru yok.</div>
      ) : (
        <div className="space-y-3">
          {data!.items.map((a) => (
            <div
              key={a.id}
              className={`rounded-lg border p-4 space-y-2 ${CATEGORY_STYLE[a.category] ?? CATEGORY_STYLE.info} ${
                a.is_read ? 'opacity-70' : ''
              }`}
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
    </div>
  );
}

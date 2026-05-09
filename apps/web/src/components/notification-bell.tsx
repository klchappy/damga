import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bell, Check } from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { sendBrowserNotification, getNotificationPermission } from '@/lib/notifications';
import { formatDateTimeTr } from '@/lib/utils';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  url: string | null;
  is_read: boolean;
  created_at: string;
  metadata: Record<string, unknown>;
}

interface NotifResponse {
  items: NotificationItem[];
  unread_count: number;
}

const SEEN_TS_KEY = 'damga-notif-last-seen-ts';
function getLastSeenTs(): number {
  try {
    const v = localStorage.getItem(SEEN_TS_KEY);
    return v ? parseInt(v, 10) : 0;
  } catch {
    return 0;
  }
}
function setLastSeenTs(ts: number) {
  try {
    localStorage.setItem(SEEN_TS_KEY, String(ts));
  } catch {
    /* noop */
  }
}

export function NotificationBell() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery<NotifResponse>({
    queryKey: ['me', 'notifications'],
    queryFn: async () => (await api.get('/me/notifications?limit=20')).data,
    refetchInterval: 30_000, // her 30sn poll
    staleTime: 10_000,
  });

  // Browser notification trigger: created_at lastSeenTs'den büyük olan unread'ler
  useEffect(() => {
    if (!data?.items || data.items.length === 0) return;
    if (getNotificationPermission() !== 'granted') return;

    const lastSeen = getLastSeenTs();
    const fresh = data.items
      .filter((n) => !n.is_read && new Date(n.created_at).getTime() > lastSeen)
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    if (fresh.length === 0) return;

    // İlk yüklemede: sadece son seen ts'i güncelle, spam yapma
    if (lastSeen === 0) {
      setLastSeenTs(new Date(fresh[0]!.created_at).getTime());
      return;
    }

    // Sayfa odakta ve aktifse browser notif gerek yok (bell badge zaten görünür)
    if (document.hasFocus() && !document.hidden) {
      setLastSeenTs(new Date(fresh[0]!.created_at).getTime());
      return;
    }

    // En yeni unread'i göster
    const top = fresh[0]!;
    sendBrowserNotification({
      title: top.title,
      body: top.body ?? undefined,
      tag: `damga-notif-${top.id}`,
      url: top.url ?? undefined,
      autoClose: 8000,
    });
    setLastSeenTs(new Date(top.created_at).getTime());
  }, [data]);

  // Dropdown dış tıklama
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const markReadMut = useMutation({
    mutationFn: async (id: string) => api.post(`/me/notifications/${id}/read`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['me', 'notifications'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const markAllMut = useMutation({
    mutationFn: async () => api.post('/me/notifications/mark-all-read'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['me', 'notifications'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const unread = data?.unread_count ?? 0;
  const items = data?.items ?? [];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="btn-ghost p-2 relative"
        title="Bildirimler"
        aria-label="Bildirimler"
      >
        <Bell className="size-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[10px] font-semibold animate-pulse">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-[320px] sm:w-[360px] max-w-[calc(100vw-1rem)] bg-white border border-orange-100 rounded-xl shadow-xl z-50 max-h-[480px] flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b border-orange-100">
            <div className="font-display text-sm">Bildirimler</div>
            {unread > 0 && (
              <button
                onClick={() => markAllMut.mutate()}
                disabled={markAllMut.isPending}
                className="text-[11px] text-orange-600 hover:underline disabled:opacity-50"
              >
                Hepsini okundu işaretle
              </button>
            )}
          </div>

          <div className="overflow-y-auto flex-1">
            {items.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted">
                <Bell className="size-6 text-muted mx-auto mb-2 opacity-50" />
                Bildirim yok.
              </div>
            ) : (
              <ul className="divide-y divide-orange-50">
                {items.map((n) => (
                  <li
                    key={n.id}
                    className={`px-3 py-2.5 hover:bg-orange-50/40 cursor-pointer transition ${
                      !n.is_read ? 'bg-orange-50/60' : ''
                    }`}
                    onClick={() => {
                      if (!n.is_read) markReadMut.mutate(n.id);
                      if (n.url) {
                        navigate(n.url);
                        setOpen(false);
                      }
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div
                          className={`text-sm leading-tight ${
                            !n.is_read ? 'font-semibold' : ''
                          }`}
                        >
                          {n.title}
                        </div>
                        {n.body && (
                          <div className="text-xs text-muted mt-0.5 line-clamp-2">
                            {n.body}
                          </div>
                        )}
                        <div className="text-[10px] text-muted mt-1">
                          {formatDateTimeTr(n.created_at)}
                        </div>
                      </div>
                      {!n.is_read && (
                        <span className="size-2 rounded-full bg-orange-500 mt-1.5 shrink-0" />
                      )}
                      {n.is_read && (
                        <Check className="size-3 text-success mt-1 shrink-0 opacity-60" />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

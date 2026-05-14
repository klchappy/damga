import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bell, Check } from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { sendBrowserNotification, getNotificationPermission } from '@/lib/notifications';
import { formatDateTimeTr } from '@/lib/utils';
import { useAuthStore } from '@/hooks/use-auth';

/**
 * Kısa bir "ding" sesi çal — yöneticiye yeni damga event'i geldi.
 * Web Audio API kullanılır (mp3 dosyasına gerek yok, bundle bedavaya gelir).
 * Kullanıcı sayfada etkileşim yapmadıysa AudioContext başlatılamaz; sessizce ignore.
 */
function playDing(): void {
  try {
    const Ctx = (window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!Ctx) return;
    const ctx = new Ctx();
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.18); // E5
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
    setTimeout(() => ctx.close().catch(() => {}), 500);
  } catch {
    /* noop — bazı tarayıcılar kullanıcı interaction olmadan AudioContext açmaz */
  }
}

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
  const user = useAuthStore((s) => s.user);
  const isManager = user && ['owner', 'admin', 'manager'].includes(user.role);

  const { data } = useQuery<NotifResponse>({
    queryKey: ['me', 'notifications'],
    queryFn: async () => (await api.get('/me/notifications?limit=20')).data,
    // Yöneticiler: 10sn (canlı damga akışı izlenecek) — çalışanlar: 30sn
    refetchInterval: isManager ? 10_000 : 30_000,
    staleTime: 5_000,
  });

  // Notification trigger: created_at lastSeenTs'den büyük olan unread'ler
  // - Sayfa görünürse: in-page toast (sonner) — admin/manager için stamp event'leri net görünsün
  // - Sayfa arka planda + browser permission var: OS notification
  useEffect(() => {
    if (!data?.items || data.items.length === 0) return;

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

    const top = fresh[0]!;
    const isStampEvent =
      top.type === 'stamp_check_in' || top.type === 'stamp_check_out';

    // Sayfa odakta + görünür: in-page toast göster (özellikle stamp event'leri için)
    if (document.hasFocus() && !document.hidden) {
      if (isStampEvent) {
        // Yöneticiye damga atan kişi bildirimi — full context'le toast
        const isCheckIn = top.type === 'stamp_check_in';
        // Damga sesi (yönetici için)
        playDing();
        toast(top.title, {
          description: top.body ?? undefined,
          duration: 6000,
          icon: isCheckIn ? '🟢' : '🔴',
          action: top.url
            ? {
                label: 'Detay',
                onClick: () => navigate(top.url ?? '/admin/live-feed'),
              }
            : undefined,
        });
        // Tüm yeni stamp event'leri için "fresh" listesinden sonrakileri de göster (max 3)
        for (const f of fresh.slice(1, 3)) {
          if (f.type === 'stamp_check_in' || f.type === 'stamp_check_out') {
            toast(f.title, {
              description: f.body ?? undefined,
              duration: 5000,
              icon: f.type === 'stamp_check_in' ? '🟢' : '🔴',
            });
          }
        }
      } else {
        // Diğer notif türleri için kısa info toast
        toast.info(top.title, {
          description: top.body ?? undefined,
          duration: 4000,
        });
      }
      setLastSeenTs(new Date(top.created_at).getTime());
      return;
    }

    // Sayfa arka planda: browser notification (OS-level)
    if (getNotificationPermission() === 'granted') {
      sendBrowserNotification({
        title: top.title,
        body: top.body ?? undefined,
        tag: `damga-notif-${top.id}`,
        url: top.url ?? undefined,
        autoClose: 8000,
      });
    }
    setLastSeenTs(new Date(top.created_at).getTime());
  }, [data, navigate]);

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

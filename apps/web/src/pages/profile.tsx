import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuthStore } from '@/hooks/use-auth';
import { api, getErrorMessage } from '@/lib/api';
import { MOOD_EMOJIS } from '@damga/shared';

export function ProfilePage() {
  const user = useAuthStore((s) => s.user);

  const moodMut = useMutation({
    mutationFn: async (emoji: string) => (await api.post('/moods', { emoji })).data,
    onSuccess: () => toast.success('🎉 Mood kaydedildi'),
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  if (!user) return null;

  const xpToNext = Math.pow(user.level, 2) * 100 - user.total_xp;
  const xpProgress = Math.max(
    0,
    Math.min(100, ((user.total_xp - Math.pow(user.level - 1, 2) * 100) /
      (Math.pow(user.level, 2) * 100 - Math.pow(user.level - 1, 2) * 100)) * 100),
  );

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6 space-y-6">
      <div className="card flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500 text-white font-display font-bold text-2xl">
          {user.full_name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl">{user.full_name}</h1>
          <p className="text-sm text-muted">{user.email}</p>
          <p className="text-xs text-muted mt-0.5">
            {user.role} {user.department && `· ${user.department}`}
          </p>
        </div>
      </div>

      {/* Gamification */}
      <div className="card">
        <h2 className="text-xl mb-3">🎯 Seviye & XP</h2>
        <div className="flex items-center justify-between mb-2">
          <span className="font-display text-3xl">L{user.level}</span>
          <span className="text-sm text-muted">
            {user.total_xp} XP · sonraki seviye için {xpToNext > 0 ? xpToNext : 0}
          </span>
        </div>
        <div className="h-2 rounded-full bg-orange-100 overflow-hidden">
          <div
            className="h-full bg-orange-500 transition-all"
            style={{ width: `${xpProgress}%` }}
          />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-md bg-orange-50 p-3">
            <div className="text-2xl font-display font-semibold">{user.current_streak}</div>
            <div className="text-xs text-muted">Mevcut seri</div>
          </div>
          <div className="rounded-md bg-orange-50 p-3">
            <div className="text-2xl font-display font-semibold">{user.longest_streak}</div>
            <div className="text-xs text-muted">En uzun seri</div>
          </div>
          <div className="rounded-md bg-orange-50 p-3">
            <div className="text-2xl font-display font-semibold">{user.shields}</div>
            <div className="text-xs text-muted">Shield 🛡️</div>
          </div>
        </div>
      </div>

      {/* Mood */}
      <div className="card">
        <h2 className="text-xl mb-2">😊 Bugünkü mood'un</h2>
        <p className="text-sm text-muted mb-3">
          Bir emoji seç. Yöneticin sadece günün ortalama "ekip mood"unu görür.
        </p>
        <div className="flex gap-3">
          {MOOD_EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => moodMut.mutate(e)}
              disabled={moodMut.isPending}
              className="text-4xl rounded-md border border-orange-100 bg-cream p-3 hover:border-orange-400 hover:bg-orange-50 transition disabled:opacity-50"
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      {/* İzin durumu */}
      <div className="card">
        <h2 className="text-xl mb-3">📅 İzin bakiyem</h2>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-md bg-orange-50 p-3 text-center">
            <div className="text-2xl font-display font-semibold">
              {user.annual_leave_quota_days}
            </div>
            <div className="text-xs text-muted">Yıllık kota</div>
          </div>
          <div className="rounded-md bg-warning/10 p-3 text-center">
            <div className="text-2xl font-display font-semibold text-warning">
              {user.annual_leave_used_days}
            </div>
            <div className="text-xs text-muted">Kullanılan</div>
          </div>
          <div className="rounded-md bg-success/10 p-3 text-center">
            <div className="text-2xl font-display font-semibold text-success">
              {user.annual_leave_quota_days - user.annual_leave_used_days}
            </div>
            <div className="text-xs text-muted">Kalan</div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  KeyRound,
  Pencil,
  X,
  Loader2,
  Eye,
  EyeOff,
  Save,
  Mail,
  Building2,
  CheckCircle2,
  Trophy,
  Crown,
  Medal,
  Award,
} from 'lucide-react';
import { useAuthStore, updatePassword, type AuthUser } from '@/hooks/use-auth';
import { api, getErrorMessage } from '@/lib/api';
import { MOOD_EMOJIS } from '@damga/shared';
import { AccountDeletionPanel } from '@/components/account-deletion';

export function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [editing, setEditing] = useState(false);
  const [changingPw, setChangingPw] = useState(false);

  const moodMut = useMutation({
    mutationFn: async (emoji: string) => (await api.post('/moods', { emoji })).data,
    onSuccess: () => toast.success('🎉 Mood kaydedildi'),
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const { data: lb } = useQuery<{
    me_rank: number | null;
    me_xp: number | null;
    items: Array<{ user_id: string; period_xp: number }>;
  }>({
    queryKey: ['leaderboard', 'weekly', 'profile'],
    queryFn: async () => (await api.get('/leaderboard?period=weekly')).data,
    staleTime: 60_000,
  });

  const { data: lbMonth } = useQuery<{
    me_rank: number | null;
    me_xp: number | null;
  }>({
    queryKey: ['leaderboard', 'monthly', 'profile'],
    queryFn: async () => (await api.get('/leaderboard?period=monthly')).data,
    staleTime: 60_000,
  });

  const { data: lbAll } = useQuery<{
    me_rank: number | null;
    me_xp: number | null;
  }>({
    queryKey: ['leaderboard', 'all', 'profile'],
    queryFn: async () => (await api.get('/leaderboard?period=all')).data,
    staleTime: 120_000,
  });

  if (!user) return null;

  const xpToNext = Math.pow(user.level, 2) * 100 - user.total_xp;
  const xpProgress = Math.max(
    0,
    Math.min(
      100,
      ((user.total_xp - Math.pow(user.level - 1, 2) * 100) /
        (Math.pow(user.level, 2) * 100 - Math.pow(user.level - 1, 2) * 100)) *
        100,
    ),
  );

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6 space-y-6">
      {/* Header card */}
      <div className="card flex items-start gap-4 flex-wrap">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500 text-white font-display font-bold text-2xl shrink-0 overflow-hidden">
          {user.avatar_url ? (
            <img src={user.avatar_url} alt={user.full_name} className="size-full object-cover" />
          ) : (
            user.full_name.charAt(0).toUpperCase()
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl">{user.full_name}</h1>
          {user.title && <p className="text-sm text-muted">{user.title}</p>}
          <p className="text-xs text-muted mt-1 flex items-center gap-1.5">
            <Mail className="size-3" />
            {user.email}
          </p>
          <p className="text-xs text-muted mt-0.5 flex items-center gap-1.5">
            <Building2 className="size-3" />
            {user.role}
            {user.department && ` · ${user.department}`}
          </p>
        </div>
        <div className="flex gap-1.5 sm:flex-col flex-wrap">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="btn-outline text-xs"
          >
            <Pencil className="size-3.5" />
            Profilimi düzenle
          </button>
          <button
            type="button"
            onClick={() => setChangingPw(true)}
            className="btn-outline text-xs"
          >
            <KeyRound className="size-3.5" />
            Şifremi değiştir
          </button>
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

        {/* 3 sıralama: haftalık + aylık + tüm zamanlar */}
        <Link
          to="/gamification?tab=ranks"
          className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-orange-100 bg-gradient-to-br from-orange-50 via-white to-cream p-3 hover:border-orange-300 transition"
        >
          <RankCell label="Bu hafta" rank={lb?.me_rank ?? null} xp={lb?.me_xp ?? 0} />
          <RankCell
            label="Bu ay"
            rank={lbMonth?.me_rank ?? null}
            xp={lbMonth?.me_xp ?? 0}
            divider
          />
          <RankCell
            label="Tüm zamanlar"
            rank={lbAll?.me_rank ?? null}
            xp={lbAll?.me_xp ?? 0}
            divider
          />
        </Link>
        <p className="text-[10px] text-muted text-center mt-1.5">
          🏆 Sıralamayı görmek için tıkla · Geç gelirsen XP düşer (-5/-10)
        </p>
      </div>

      {/* Mood */}
      <div className="card">
        <h2 className="text-xl mb-2">😊 Bugünkü mood'un</h2>
        <p className="text-sm text-muted mb-3">
          Bir emoji seç. Yöneticin sadece günün ortalama "ekip mood"unu görür.
        </p>
        <div className="flex gap-3 flex-wrap">
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

      {editing && (
        <EditProfileModal
          user={user}
          onClose={() => setEditing(false)}
          onSaved={(u) => {
            setUser(u);
            setEditing(false);
          }}
        />
      )}
      {changingPw && <ChangePasswordModal onClose={() => setChangingPw(false)} />}

      {/* KVKK md.11 — Self-serve hesap silme */}
      <section className="mt-6">
        <h2 className="font-display text-lg mb-2">Hesap yönetimi</h2>
        <AccountDeletionPanel />
      </section>
    </div>
  );
}

function RankCell({
  label,
  rank,
  xp,
  divider,
}: {
  label: string;
  rank: number | null;
  xp: number;
  divider?: boolean;
}) {
  const Icon =
    rank === 1 ? Crown : rank === 2 ? Medal : rank === 3 ? Award : Trophy;
  const ringClass =
    rank === 1
      ? 'bg-yellow-400 text-white'
      : rank === 2
        ? 'bg-zinc-300 text-white'
        : rank === 3
          ? 'bg-orange-300 text-white'
          : 'bg-orange-100 text-orange-600';
  return (
    <div className={`text-center ${divider ? 'border-l border-orange-100' : ''}`}>
      <div className="flex justify-center mb-1">
        <span
          className={`flex size-7 items-center justify-center rounded-full ${ringClass}`}
        >
          <Icon className="size-4" />
        </span>
      </div>
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className="font-display text-base leading-tight">
        {rank ? `#${rank}` : '—'}
      </div>
      <div className="text-[10px] text-muted">{xp} XP</div>
    </div>
  );
}

function EditProfileModal({
  user,
  onClose,
  onSaved,
}: {
  user: AuthUser;
  onClose: () => void;
  onSaved: (u: AuthUser) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    full_name: user.full_name,
    title: user.title ?? '',
    avatar_url: user.avatar_url ?? '',
    username: user.username ?? '',
    phone: user.phone ?? '',
  });

  const mut = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {};
      if (form.full_name.trim() !== user.full_name) payload.full_name = form.full_name.trim();
      if (form.title.trim() !== (user.title ?? '')) payload.title = form.title.trim() || null;
      if (form.avatar_url.trim() !== (user.avatar_url ?? ''))
        payload.avatar_url = form.avatar_url.trim() || null;
      if (form.username.trim().toLowerCase() !== (user.username ?? '').toLowerCase())
        payload.username = form.username.trim().toLowerCase() || null;
      if (form.phone.trim() !== (user.phone ?? ''))
        payload.phone = form.phone.trim() || null;
      const r = await api.patch('/users/me', payload);
      return r.data.user as AuthUser & {
        // ek alanlar (department/role gibi) auth user response'undan farklı olabilir
      };
    },
    onSuccess: (u) => {
      toast.success('Profil güncellendi');
      // /auth/me şeklini AuthUser ile birebir uyumlu olduğu için cast ediyoruz
      onSaved({ ...user, ...(u as unknown as AuthUser) });
      void qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-3 py-4 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md card space-y-4 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 text-orange-600 text-xs font-medium uppercase tracking-wider">
              <Pencil className="size-3.5" /> Profilim
            </div>
            <h3 className="font-display text-xl mt-1">Profilimi düzenle</h3>
            <p className="text-xs text-muted mt-0.5">
              E-posta, rol ve departman değişimi için yöneticine ulaş.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={mut.isPending}
            className="btn-ghost p-1.5 -mt-1 -mr-1"
            aria-label="Kapat"
          >
            <X className="size-4" />
          </button>
        </div>

        <div>
          <label className="label">Ad Soyad</label>
          <input
            className="input mt-1"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            disabled={mut.isPending}
          />
        </div>
        <div>
          <label className="label">Pozisyon (ünvan)</label>
          <input
            className="input mt-1"
            placeholder="Yazılım Geliştirici"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            disabled={mut.isPending}
          />
        </div>
        <div>
          <label className="label">Avatar URL (opsiyonel)</label>
          <input
            type="url"
            className="input mt-1"
            placeholder="https://..."
            value={form.avatar_url}
            onChange={(e) => setForm({ ...form, avatar_url: e.target.value })}
            disabled={mut.isPending}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Kullanıcı adı</label>
            <input
              className="input mt-1"
              placeholder="kaank"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              disabled={mut.isPending}
            />
            <p className="mt-1 text-[10px] text-muted">Email yerine sign-in'de kullanılır</p>
          </div>
          <div>
            <label className="label">Telefon</label>
            <input
              type="tel"
              className="input mt-1"
              placeholder="+905xxxxxxxxx"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              disabled={mut.isPending}
            />
            <p className="mt-1 text-[10px] text-muted">SMS/WhatsApp ile şifre için</p>
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
            onClick={() => mut.mutate()}
            disabled={mut.isPending}
            className="btn-primary flex-1"
          >
            {mut.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Kaydet
          </button>
        </div>
      </div>
    </div>
  );
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [reveal, setReveal] = useState(false);
  const [done, setDone] = useState(false);

  const mut = useMutation({
    mutationFn: async () => {
      if (pw.length < 8) throw new Error('Şifre en az 8 karakter olmalı');
      if (pw !== confirm) throw new Error('Şifreler eşleşmiyor');
      await updatePassword(pw);
    },
    onSuccess: () => {
      toast.success('🔑 Şifren güncellendi');
      setDone(true);
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-3 py-4 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md card space-y-4 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 text-orange-600 text-xs font-medium uppercase tracking-wider">
              <KeyRound className="size-3.5" /> Şifre
            </div>
            <h3 className="font-display text-xl mt-1">Şifremi değiştir</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={mut.isPending}
            className="btn-ghost p-1.5 -mt-1 -mr-1"
            aria-label="Kapat"
          >
            <X className="size-4" />
          </button>
        </div>

        {done ? (
          <div className="space-y-3">
            <div className="rounded-md bg-success/10 border border-success/30 px-3 py-3 text-sm flex items-start gap-2">
              <CheckCircle2 className="size-5 text-success shrink-0" />
              <div>
                <strong className="text-ink">Şifren güncellendi.</strong>
                <p className="text-muted mt-0.5">
                  Bir sonraki girişte yeni şifrenle giriş yap. Mevcut oturumunla devam edebilirsin.
                </p>
              </div>
            </div>
            <button type="button" onClick={onClose} className="btn-primary w-full">
              Tamam
            </button>
          </div>
        ) : (
          <>
            <div>
              <label className="label">Yeni şifre</label>
              <div className="mt-1 relative">
                <input
                  type={reveal ? 'text' : 'password'}
                  className="input pr-10 font-mono"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  placeholder="En az 8 karakter"
                  autoFocus
                  disabled={mut.isPending}
                />
                <button
                  type="button"
                  onClick={() => setReveal((r) => !r)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 btn-ghost p-1 text-muted"
                  tabIndex={-1}
                >
                  {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {pw.length > 0 && pw.length < 8 && (
                <p className="mt-1 text-xs text-danger">En az 8 karakter olmalı</p>
              )}
            </div>
            <div>
              <label className="label">Yeni şifreyi tekrar</label>
              <input
                type={reveal ? 'text' : 'password'}
                className="input mt-1 font-mono"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={mut.isPending}
              />
              {confirm.length > 0 && confirm !== pw && (
                <p className="mt-1 text-xs text-danger">Şifreler eşleşmiyor</p>
              )}
            </div>

            <div className="rounded-md bg-warning/5 border border-warning/20 px-3 py-2 text-[11px] text-muted">
              💡 Güvenli bir şifre seç: en az 8 karakter, harf + rakam karışımı.
              Tek seferlik kullanıma uygun değildir; kimseyle paylaşma.
            </div>

            <div className="flex gap-2 pt-1">
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
                onClick={() => mut.mutate()}
                disabled={mut.isPending || pw.length < 8 || pw !== confirm}
                className="btn-primary flex-1"
              >
                {mut.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <KeyRound className="size-4" />
                )}
                Şifreyi değiştir
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

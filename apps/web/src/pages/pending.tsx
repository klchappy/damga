import { Clock, Mail, LogOut, RefreshCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { signOut, useAuthStore } from '@/hooks/use-auth';

/**
 * Pending sayfası — kullanıcı kayıt oldu ama henüz bir org'a atanmadı.
 * Yöneticisi /admin/pending-users üzerinden onu bir şirkete atayana kadar
 * bu ekran görünür.
 */
export function PendingPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    useAuthStore.getState().setUser(null);
    useAuthStore.getState().setSession(null);
    navigate('/auth/sign-in', { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-cream">
      <div className="w-full max-w-md card space-y-5 text-center">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-warning/10 text-warning mx-auto relative">
          <Clock className="size-8" />
          <span className="absolute -top-1 -right-1 inline-block h-3 w-3 rounded-full bg-warning animate-pulse" />
        </div>

        <div>
          <h1 className="font-display text-2xl">Yönetici onayı bekleniyor</h1>
          <p className="mt-2 text-sm text-muted">
            Merhaba <strong className="text-ink">{user?.full_name?.split(' ')[0] ?? ''}</strong>,
            hesabın oluşturuldu ancak henüz bir şirkete atanmadın.
          </p>
        </div>

        <div className="rounded-md bg-orange-50/60 border border-orange-100 p-3 text-left text-sm space-y-2">
          <div className="flex items-start gap-2">
            <Mail className="size-4 text-orange-500 mt-0.5 shrink-0" />
            <span className="text-ink">{user?.email}</span>
          </div>
          <p className="text-xs text-muted leading-relaxed">
            Yöneticin Damga panelinden seni bir şirkete + departmana atayınca buradan otomatik
            uygulamaya geçeceksin. <strong>Mail davet linki gerekmez.</strong>
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => window.location.reload()}
            className="btn-outline flex-1 text-sm"
          >
            <RefreshCcw className="size-4" />
            Yenile
          </button>
          <button onClick={handleSignOut} className="btn-outline flex-1 text-sm">
            <LogOut className="size-4" />
            Çıkış Yap
          </button>
        </div>
      </div>
    </div>
  );
}

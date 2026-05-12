import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LogOut, Menu as MenuIcon } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  useAuthStore,
  signOut,
  DEFAULT_EMPLOYEE_PAGES,
  type EmployeePageKey,
} from '@/hooks/use-auth';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { MoodPromptAuto } from '@/components/mood-prompt';
import { NotificationPermissionGate } from '@/components/notification-permission';
import { NotificationBell } from '@/components/notification-bell';

export function AppLayout() {
  const user = useAuthStore((s) => s.user);
  const org = useAuthStore((s) => s.org);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const isManager = user && ['manager', 'admin', 'owner'].includes(user.role);
  const isAdmin = user && ['admin', 'owner'].includes(user.role);

  const { data: platformMe } = useQuery<{ is_platform_admin: boolean }>({
    queryKey: ['platform-me'],
    queryFn: async () => (await api.get('/platform/me')).data,
    enabled: !!user,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const isPlatformAdmin = platformMe?.is_platform_admin === true;

  const visibleSet = useMemo(() => {
    if (!user) return new Set<EmployeePageKey>();
    if (user.role !== 'employee') {
      return new Set<EmployeePageKey>([
        'home',
        'history',
        'leaves',
        'menu',
        'announcements',
        'profile',
        'mood',
        'status',
      ]);
    }
    const cfg = org?.settings?.employee_visible_pages;
    return new Set<EmployeePageKey>(cfg && cfg.length > 0 ? cfg : DEFAULT_EMPLOYEE_PAGES);
  }, [user, org]);

  const can = (key: EmployeePageKey) => visibleSet.has(key);
  const canRecords = !!user;

  const handleLogout = async () => {
    await signOut();
    useAuthStore.getState().setUser(null);
    useAuthStore.getState().setOrg(null);
    useAuthStore.getState().setSession(null);
    navigate('/auth/sign-in', { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 border-b border-orange-100 bg-cream/85 backdrop-blur">
        <div className="container mx-auto max-w-6xl flex items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-orange-500 text-white font-display font-bold">
              D
            </div>
            <span className="font-display text-lg font-semibold">Damga</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1 flex-wrap">
            {can('home') && <NavItem to="/">Bugün</NavItem>}
            {canRecords && <NavItem to="/me/records">Kayıtlarım</NavItem>}
            {can('menu') && <NavItem to="/menu">Menü</NavItem>}
            {can('announcements') && <NavItem to="/announcements">Duyuru</NavItem>}
            {isManager && <NavItem to="/manager/workforce">Ekip & Performans</NavItem>}
            {(can('profile') || isAdmin || isPlatformAdmin) && <NavItem to="/settings">Ayarlar</NavItem>}
          </nav>

          <div className="flex items-center gap-2">
            {user && (
              <div className="hidden sm:flex flex-col items-end text-right">
                <span className="text-sm font-medium">{user.full_name}</span>
                <span className="text-xs text-muted">
                  {user.role} · L{user.level} · XP {user.total_xp}
                </span>
              </div>
            )}
            <NotificationBell />
            <button onClick={handleLogout} className="btn-ghost p-2" title="Çıkış">
              <LogOut className="size-4" />
            </button>
            <button className="md:hidden btn-ghost p-2" onClick={() => setOpen((o) => !o)}>
              <MenuIcon className="size-5" />
            </button>
          </div>
        </div>
        {open && (
          <nav className="md:hidden border-t border-orange-100 px-4 py-2 flex flex-col gap-1">
            {can('home') && (
              <NavItem to="/" onClick={() => setOpen(false)}>
                Bugün
              </NavItem>
            )}
            {canRecords && (
              <NavItem to="/me/records" onClick={() => setOpen(false)}>
                Kayıtlarım
              </NavItem>
            )}
            {can('menu') && (
              <NavItem to="/menu" onClick={() => setOpen(false)}>
                Menü
              </NavItem>
            )}
            {can('announcements') && (
              <NavItem to="/announcements" onClick={() => setOpen(false)}>
                Duyurular
              </NavItem>
            )}
            {isManager && (
              <NavItem to="/manager/workforce" onClick={() => setOpen(false)}>
                Ekip & Performans
              </NavItem>
            )}
            {(can('profile') || isAdmin || isPlatformAdmin) && (
              <NavItem to="/settings" onClick={() => setOpen(false)}>
                Ayarlar
              </NavItem>
            )}
          </nav>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <MoodPromptAuto />
      <NotificationPermissionGate />

      <footer className="border-t border-orange-100 bg-cream py-4 text-center text-xs text-muted">
        Damga v0.1.0 ·{' '}
        <Link to="/legal/kvkk" className="hover:text-orange-600 underline">
          KVKK
        </Link>{' '}
        ·{' '}
        <Link to="/legal/terms" className="hover:text-orange-600 underline">
          Kullanım Şartları
        </Link>{' '}
        ·{' '}
        <Link to="/legal/privacy" className="hover:text-orange-600 underline">
          Gizlilik
        </Link>{' '}
        ·{' '}
        <Link to="/legal/cookies" className="hover:text-orange-600 underline">
          Çerezler
        </Link>
      </footer>
    </div>
  );
}

function NavItem({
  to,
  children,
  onClick,
}: {
  to: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      end={to === '/'}
      className={({ isActive }) =>
        cn(
          'rounded-md px-3 py-1.5 text-sm font-medium transition',
          isActive ? 'bg-orange-500 text-white' : 'text-muted hover:bg-orange-50 hover:text-ink',
        )
      }
    >
      {children}
    </NavLink>
  );
}

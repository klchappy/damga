import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LogOut, Menu as MenuIcon } from 'lucide-react';
import { useState } from 'react';
import { useAuthStore, signOut } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

export function AppLayout() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const isManager = user && ['manager', 'admin', 'owner'].includes(user.role);
  const isAdmin = user && ['admin', 'owner'].includes(user.role);

  const handleLogout = async () => {
    await signOut();
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
            <NavItem to="/">Bugün</NavItem>
            <NavItem to="/history">Geçmiş</NavItem>
            <NavItem to="/leaves">İzin</NavItem>
            <NavItem to="/menu">Menü</NavItem>
            <NavItem to="/announcements">Duyuru</NavItem>
            {isManager && <NavItem to="/manager">Ekip</NavItem>}
            {isManager && <NavItem to="/manager/reports">Rapor</NavItem>}
            {isAdmin && <NavItem to="/admin">Admin</NavItem>}
            {isAdmin && <NavItem to="/admin/locations">Lokasyon</NavItem>}
            {isAdmin && <NavItem to="/admin/api-keys">API</NavItem>}
            <NavItem to="/profile">Profil</NavItem>
          </nav>

          <div className="flex items-center gap-3">
            {user && (
              <div className="hidden sm:flex flex-col items-end text-right">
                <span className="text-sm font-medium">{user.full_name}</span>
                <span className="text-xs text-muted">
                  {user.role} · L{user.level} · 🪙 {user.total_xp}
                </span>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="btn-ghost p-2"
              title="Çıkış"
            >
              <LogOut className="size-4" />
            </button>
            <button
              className="md:hidden btn-ghost p-2"
              onClick={() => setOpen((o) => !o)}
            >
              <MenuIcon className="size-5" />
            </button>
          </div>
        </div>
        {open && (
          <nav className="md:hidden border-t border-orange-100 px-4 py-2 flex flex-col gap-1">
            <NavItem to="/" onClick={() => setOpen(false)}>
              Bugün
            </NavItem>
            <NavItem to="/history" onClick={() => setOpen(false)}>
              Geçmişim
            </NavItem>
            <NavItem to="/leaves" onClick={() => setOpen(false)}>
              İzinlerim
            </NavItem>
            {isManager && (
              <NavItem to="/manager" onClick={() => setOpen(false)}>
                Ekip
              </NavItem>
            )}
            {isAdmin && (
              <NavItem to="/admin/locations" onClick={() => setOpen(false)}>
                Lokasyonlar
              </NavItem>
            )}
          </nav>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-orange-100 bg-cream py-4 text-center text-xs text-muted">
        Damga v0.1.0 · <Link to="/legal/kvkk" className="hover:text-orange-600 underline">KVKK</Link>{' '}
        · <Link to="/legal/terms" className="hover:text-orange-600 underline">Kullanım Şartları</Link>
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

import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  CalendarDays,
  Home,
  LifeBuoy,
  LogOut,
  Megaphone,
  Menu as MenuIcon,
  Utensils,
} from "lucide-react";
import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useAuthStore,
  signOut,
  DEFAULT_EMPLOYEE_PAGES,
  type EmployeePageKey,
} from "@/hooks/use-auth";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { NotificationPermissionGate } from "@/components/notification-permission";
import { NotificationBell } from "@/components/notification-bell";
import { useMobileDevice } from "@/hooks/use-mobile-device";

export function AppLayout({ children }: { children?: React.ReactNode } = {}) {
  const user = useAuthStore((s) => s.user);
  const org = useAuthStore((s) => s.org);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const isMobileDevice = useMobileDevice();

  const isManager = user && ["manager", "admin", "owner"].includes(user.role);
  const isAdmin = user && ["admin", "owner"].includes(user.role);

  const { data: platformMe } = useQuery<{ is_platform_admin: boolean }>({
    queryKey: ["platform-me"],
    queryFn: async () => (await api.get("/platform/me")).data,
    enabled: !!user,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const isPlatformAdmin = platformMe?.is_platform_admin === true;

  const visibleSet = useMemo(() => {
    if (!user) return new Set<EmployeePageKey>();
    if (user.role !== "employee") {
      return new Set<EmployeePageKey>([
        "home",
        "history",
        "leaves",
        "menu",
        "announcements",
        "profile",
        "mood",
        "status",
      ]);
    }
    const cfg = org?.settings?.employee_visible_pages;
    return new Set<EmployeePageKey>(
      cfg && cfg.length > 0 ? cfg : DEFAULT_EMPLOYEE_PAGES,
    );
  }, [user, org]);

  const can = (key: EmployeePageKey) => visibleSet.has(key);
  const canRecords = !!user;
  const showMobileShell = isMobileDevice;
  const queryClient = useQueryClient();

  const handleLogout = async () => {
    await signOut();
    useAuthStore.getState().setUser(null);
    useAuthStore.getState().setOrg(null);
    useAuthStore.getState().setSession(null);
    // SECURITY: Logout sırasında tüm cached query'leri temizle — aksi takdirde
    // sonraki kullanıcı önceki kullanıcının verilerini (notifications, profile,
    // org listesi vb.) görür. K6 (production audit bulgusu).
    queryClient.clear();
    try {
      // Supabase auth token + custom storage temizle
      Object.keys(localStorage)
        .filter((k) => k.startsWith('sb-') || k.startsWith('damga-'))
        .forEach((k) => localStorage.removeItem(k));
      sessionStorage.clear();
    } catch {
      /* SSR / private mode */
    }
    navigate("/auth/sign-in", { replace: true });
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
            {can("home") && <NavItem to="/">Bugün</NavItem>}
            {canRecords && <NavItem to="/me/records">Takvimim</NavItem>}
            {can("menu") && <NavItem to="/menu">Menü</NavItem>}
            {can("announcements") && (
              <NavItem to="/announcements">Duyuru</NavItem>
            )}
            {!showMobileShell && isManager && (
              <NavItem to="/manager/workforce">Ekip & Performans</NavItem>
            )}
            {!showMobileShell && isManager && (
              <NavItem to="/manager/reports">Raporlar</NavItem>
            )}
            {!showMobileShell &&
              (can("profile") || isAdmin || isPlatformAdmin) && (
                <NavItem to="/settings">Ayarlar</NavItem>
              )}
            <NavItem to="/support">Destek</NavItem>
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
            {can("home") && (
              <NavItem to="/" onClick={() => setOpen(false)}>
                Bugün
              </NavItem>
            )}
            {canRecords && (
              <NavItem to="/me/records" onClick={() => setOpen(false)}>
                Takvimim
              </NavItem>
            )}
            {can("menu") && (
              <NavItem to="/menu" onClick={() => setOpen(false)}>
                Menü
              </NavItem>
            )}
            {can("announcements") && (
              <NavItem to="/announcements" onClick={() => setOpen(false)}>
                Duyurular
              </NavItem>
            )}
            {!showMobileShell && isManager && (
              <NavItem to="/manager/workforce" onClick={() => setOpen(false)}>
                Ekip & Performans
              </NavItem>
            )}
            {!showMobileShell && isManager && (
              <NavItem to="/manager/reports" onClick={() => setOpen(false)}>
                Raporlar
              </NavItem>
            )}
            {!showMobileShell &&
              (can("profile") || isAdmin || isPlatformAdmin) && (
                <NavItem to="/settings" onClick={() => setOpen(false)}>
                  Ayarlar
                </NavItem>
              )}
            <NavItem to="/support" onClick={() => setOpen(false)}>
              Destek
            </NavItem>
          </nav>
        )}
      </header>

      <main className={`flex-1 ${showMobileShell ? "pb-20" : ""}`}>
        {children ?? <Outlet />}
      </main>

      {showMobileShell && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-orange-100 bg-white/95 px-2 py-2 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur md:hidden">
          <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
            <MobileNavItem
              to="/"
              icon={<Home className="size-5" />}
              label="Bugün"
            />
            <MobileNavItem
              to="/me/records"
              icon={<CalendarDays className="size-5" />}
              label="Takvimim"
            />
            <MobileNavItem
              to="/menu"
              icon={<Utensils className="size-5" />}
              label="Menü"
            />
            <MobileNavItem
              to="/announcements"
              icon={<Megaphone className="size-5" />}
              label="Duyuru"
            />
          </div>
        </nav>
      )}

      <NotificationPermissionGate />

      <footer className="border-t border-orange-100 bg-cream py-4 text-center text-xs text-muted">
        Damga v0.1.0 ·{" "}
        <Link to="/legal/kvkk" className="hover:text-orange-600 underline">
          KVKK
        </Link>{" "}
        ·{" "}
        <Link to="/legal/terms" className="hover:text-orange-600 underline">
          Kullanım Şartları
        </Link>{" "}
        ·{" "}
        <Link to="/legal/privacy" className="hover:text-orange-600 underline">
          Gizlilik
        </Link>{" "}
        ·{" "}
        <Link to="/legal/cookies" className="hover:text-orange-600 underline">
          Çerezler
        </Link>
        {" "}·{" "}
        <Link to="/support" className="inline-flex items-center gap-1 hover:text-orange-600 underline">
          <LifeBuoy className="size-3" />
          Destek
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
      end={to === "/"}
      className={({ isActive }) =>
        cn(
          "rounded-md px-3 py-1.5 text-sm font-medium transition",
          isActive
            ? "bg-orange-500 text-white"
            : "text-muted hover:bg-orange-50 hover:text-ink",
        )
      }
    >
      {children}
    </NavLink>
  );
}

function MobileNavItem({
  to,
  icon,
  label,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        cn(
          "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[11px] font-medium transition",
          isActive
            ? "bg-orange-500 text-white"
            : "text-muted hover:bg-orange-50 hover:text-ink",
        )
      }
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}

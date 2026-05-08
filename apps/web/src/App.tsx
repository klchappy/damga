import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { useAuthBoot, useAuthStore } from '@/hooks/use-auth';
import { AppLayout } from '@/components/layout';
import { DamgaSplash } from '@/components/splash';
import { SignInPage } from '@/pages/sign-in';
import { SignUpPage } from '@/pages/sign-up';
import { ForgotPasswordPage, ResetPasswordPage, AuthCallbackPage } from '@/pages/auth-misc';
import { EmployeeHomePage } from '@/pages/employee-home';
import { ManagerHomePage } from '@/pages/manager-home';
import { ManagerTeamPage } from '@/pages/manager-team';
import { ManagerReportsPage } from '@/pages/manager-reports';
import { AdminHomePage } from '@/pages/admin-home';
import { AdminLocationsPage } from '@/pages/admin-locations';
import { AdminApiKeysPage } from '@/pages/admin-api-keys';
import { AdminTeamPage } from '@/pages/admin-team';
import { AdminDepartmentsPage } from '@/pages/admin-departments';
import { LeavesMinePage } from '@/pages/leaves-mine';
import { HistoryPage } from '@/pages/history';
import { ProfilePage } from '@/pages/profile';
import { MenuPage } from '@/pages/menu';
import { AnnouncementsPage } from '@/pages/announcements';
import { KvkkPage, TermsPage } from '@/pages/legal';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5_000, retry: 1 },
  },
});

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore();
  if (loading) return <DamgaSplash />;
  if (!user) return <Navigate to="/auth/sign-in" replace />;
  return <>{children}</>;
}

function RoleGate({
  roles,
  children,
}: {
  roles: Array<'employee' | 'manager' | 'admin' | 'owner'>;
  children: React.ReactNode;
}) {
  const user = useAuthStore((s) => s.user);
  if (!user) return null;
  if (!roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppInner() {
  useAuthBoot();
  return (
    <Routes>
      {/* Public auth */}
      <Route path="/auth/sign-in" element={<SignInPage />} />
      <Route path="/auth/sign-up" element={<SignUpPage />} />
      <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/legal/kvkk" element={<KvkkPage />} />
      <Route path="/legal/terms" element={<TermsPage />} />

      {/* Auth gerekli */}
      <Route
        element={
          <PrivateRoute>
            <AppLayout />
          </PrivateRoute>
        }
      >
        <Route index element={<EmployeeHomePage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="leaves" element={<LeavesMinePage />} />
        <Route path="menu" element={<MenuPage />} />
        <Route path="announcements" element={<AnnouncementsPage />} />

        {/* Manager+ */}
        <Route
          path="manager"
          element={
            <RoleGate roles={['manager', 'admin', 'owner']}>
              <ManagerHomePage />
            </RoleGate>
          }
        />
        <Route
          path="manager/team"
          element={
            <RoleGate roles={['manager', 'admin', 'owner']}>
              <ManagerTeamPage />
            </RoleGate>
          }
        />
        <Route
          path="manager/reports"
          element={
            <RoleGate roles={['manager', 'admin', 'owner']}>
              <ManagerReportsPage />
            </RoleGate>
          }
        />

        {/* Admin+ */}
        <Route
          path="admin"
          element={
            <RoleGate roles={['admin', 'owner']}>
              <AdminHomePage />
            </RoleGate>
          }
        />
        <Route
          path="admin/locations"
          element={
            <RoleGate roles={['admin', 'owner']}>
              <AdminLocationsPage />
            </RoleGate>
          }
        />
        <Route
          path="admin/api-keys"
          element={
            <RoleGate roles={['admin', 'owner']}>
              <AdminApiKeysPage />
            </RoleGate>
          }
        />
        <Route
          path="admin/team"
          element={
            <RoleGate roles={['admin', 'owner']}>
              <AdminTeamPage />
            </RoleGate>
          }
        />
        <Route
          path="admin/departments"
          element={
            <RoleGate roles={['admin', 'owner']}>
              <AdminDepartmentsPage />
            </RoleGate>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppInner />
        <Toaster
          position="top-right"
          theme="light"
          toastOptions={{
            style: { fontFamily: 'DM Sans, system-ui, sans-serif' },
          }}
        />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

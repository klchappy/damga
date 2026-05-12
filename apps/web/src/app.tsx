import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { useAuthBoot, useAuthStore } from '@/hooks/use-auth';
import { AppLayout } from '@/components/layout';
import { DamgaSplash } from '@/components/splash';
import { SignInPage } from '@/pages/sign-in';
import { SignUpPage } from '@/pages/sign-up';
import { SignUpOrgPage } from '@/pages/sign-up-org';
import { ApplyOrgPage } from '@/pages/apply-org';
import { PendingPage } from '@/pages/pending';
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
import { AdminApplicationsPage } from '@/pages/admin-applications';
import { AdminSettingsPage } from '@/pages/admin-settings';
import { AdminPendingUsersPage } from '@/pages/admin-pending-users';
import { AdminPendingReviewsPage } from '@/pages/admin-pending-reviews';
import { AdminLiveFeedPage } from '@/pages/admin-live-feed';
import { GamificationPage } from '@/pages/gamification';
import { AdminRedemptionsPage } from '@/pages/admin-redemptions';
import { AdminShiftsPage } from '@/pages/admin-shifts';
import { ManagerSchedulePage } from '@/pages/manager-schedule';
import { AdminOvertimePage } from '@/pages/admin-overtime';
import { MyShiftsPage } from '@/pages/my-shifts';
import { MyShiftSwapsPage } from '@/pages/my-shift-swaps';
import { ManagerAnalyticsPage } from '@/pages/manager-analytics';
import { AdminBulkImportPage } from '@/pages/admin-bulk-import';
import { AdminIntegrationsPage } from '@/pages/admin-integrations';
import { EmployeePageGate } from '@/components/employee-page-gate';
import { LeavesMinePage } from '@/pages/leaves-mine';
import { HistoryPage } from '@/pages/history';
import { ProfilePage } from '@/pages/profile';
import { MenuPage } from '@/pages/menu';
import { MenuFeedbackPage } from '@/pages/menu-feedback';
import { QLandingPage } from '@/pages/q-landing';
import { AnnouncementsPage } from '@/pages/announcements';
import { KvkkPage, TermsPage, PrivacyPage, CookiesPage } from '@/pages/legal';
import { PlatformPage } from '@/pages/platform';
import { CookieBanner } from '@/components/cookie-banner';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5_000, retry: 1 },
  },
});

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, signInTransition } = useAuthStore();
  // Sign-in geçişi sırasında 5 sn damga animasyonu göstereceğiz
  if (loading || signInTransition) return <DamgaSplash />;
  if (!user) return <Navigate to="/auth/sign-in" replace />;
  // Atanmamış kullanıcı → bekleme ekranı
  if (user.is_pending || !user.org_id) return <PendingPage />;
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
      <Route path="/auth/sign-up-org" element={<SignUpOrgPage />} />
      <Route path="/apply-org" element={<ApplyOrgPage />} />
      {/* QR landing — kendi içinde auth check yapar (login yoksa sign-in'e yönlendirir) */}
      <Route path="/q/:locationId" element={<QLandingPage />} />
      <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/legal/kvkk" element={<KvkkPage />} />
      <Route path="/legal/terms" element={<TermsPage />} />
      <Route path="/legal/privacy" element={<PrivacyPage />} />
      <Route path="/legal/cookies" element={<CookiesPage />} />

      {/* Auth gerekli */}
      <Route
        element={
          <PrivateRoute>
            <AppLayout />
          </PrivateRoute>
        }
      >
        <Route index element={<EmployeeHomePage />} />
        <Route
          path="history"
          element={
            <EmployeePageGate page="history">
              <HistoryPage />
            </EmployeePageGate>
          }
        />
        <Route path="profile" element={<ProfilePage />} />
        <Route
          path="leaves"
          element={
            <EmployeePageGate page="leaves">
              <LeavesMinePage />
            </EmployeePageGate>
          }
        />
        <Route
          path="menu"
          element={
            <EmployeePageGate page="menu">
              <MenuPage />
            </EmployeePageGate>
          }
        />
        <Route
          path="menu/feedback"
          element={
            <EmployeePageGate page="menu">
              <MenuFeedbackPage />
            </EmployeePageGate>
          }
        />
        <Route
          path="announcements"
          element={
            <EmployeePageGate page="announcements">
              <AnnouncementsPage />
            </EmployeePageGate>
          }
        />
        <Route path="gamification" element={<GamificationPage />} />
        <Route
          path="leaderboard"
          element={<Navigate to="/gamification?tab=ranks" replace />}
        />
        <Route
          path="rewards"
          element={<Navigate to="/gamification?tab=store" replace />}
        />

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
          path="admin/integrations"
          element={
            <RoleGate roles={['admin', 'owner']}>
              <AdminIntegrationsPage />
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
        <Route
          path="admin/applications"
          element={
            <RoleGate roles={['admin', 'owner']}>
              <AdminApplicationsPage />
            </RoleGate>
          }
        />
        <Route
          path="admin/settings"
          element={
            <RoleGate roles={['admin', 'owner']}>
              <AdminSettingsPage />
            </RoleGate>
          }
        />
        <Route
          path="admin/pending-users"
          element={
            <RoleGate roles={['admin', 'owner']}>
              <AdminPendingUsersPage />
            </RoleGate>
          }
        />
        <Route
          path="admin/pending-reviews"
          element={
            <RoleGate roles={['manager', 'admin', 'owner']}>
              <AdminPendingReviewsPage />
            </RoleGate>
          }
        />
        <Route
          path="admin/live-feed"
          element={
            <RoleGate roles={['manager', 'admin', 'owner']}>
              <AdminLiveFeedPage />
            </RoleGate>
          }
        />
        <Route
          path="admin/redemptions"
          element={
            <RoleGate roles={['manager', 'admin', 'owner']}>
              <AdminRedemptionsPage />
            </RoleGate>
          }
        />
        <Route
          path="admin/shifts"
          element={
            <RoleGate roles={['admin', 'owner']}>
              <AdminShiftsPage />
            </RoleGate>
          }
        />
        <Route
          path="manager/schedule"
          element={
            <RoleGate roles={['manager', 'admin', 'owner']}>
              <ManagerSchedulePage />
            </RoleGate>
          }
        />
        <Route
          path="admin/overtime"
          element={
            <RoleGate roles={['manager', 'admin', 'owner']}>
              <AdminOvertimePage />
            </RoleGate>
          }
        />
        <Route path="me/shifts" element={<MyShiftsPage />} />
        <Route path="me/shift-swaps" element={<MyShiftSwapsPage />} />
        <Route
          path="me/monthly-market"
          element={<Navigate to="/gamification?tab=monthly" replace />}
        />
        <Route
          path="admin/bulk-import"
          element={
            <RoleGate roles={['admin', 'owner']}>
              <AdminBulkImportPage />
            </RoleGate>
          }
        />
        <Route
          path="manager/analytics"
          element={
            <RoleGate roles={['manager', 'admin', 'owner']}>
              <ManagerAnalyticsPage />
            </RoleGate>
          }
        />
        <Route path="platform" element={<PlatformPage />} />
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
        <CookieBanner />
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

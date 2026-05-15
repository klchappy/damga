import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { useAuthBoot, useAuthStore } from "@/hooks/use-auth";
import { AppLayout } from "@/components/layout";
import { DamgaSplash } from "@/components/splash";
import { SignInPage } from "@/pages/sign-in";
import { SignUpPage } from "@/pages/sign-up";
import { SignUpOrgPage } from "@/pages/sign-up-org";
import { ApplyOrgPage } from "@/pages/apply-org";
import { PendingPage } from "@/pages/pending";
import {
  ForgotPasswordPage,
  ResetPasswordPage,
  AuthCallbackPage,
} from "@/pages/auth-misc";
import { EmployeeHomePage } from "@/pages/employee-home";
import { ManagerReportsPage } from "@/pages/manager-reports";
import { ManagerPuantajPage } from "@/pages/manager-puantaj";
import { AdminLocationsPage } from "@/pages/admin-locations";
import { AdminTeamPage } from "@/pages/admin-team";
import { AdminDepartmentsPage } from "@/pages/admin-departments";
import { AdminApplicationsPage } from "@/pages/admin-applications";
import { AdminPendingUsersPage } from "@/pages/admin-pending-users";
import { AdminPendingReviewsPage } from "@/pages/admin-pending-reviews";
import { AdminLiveFeedPage } from "@/pages/admin-live-feed";
import { GamificationPage } from "@/pages/gamification";
import { AdminRedemptionsPage } from "@/pages/admin-redemptions";
import { AdminShiftsPage } from "@/pages/admin-shifts";
import { ManagerSchedulePage } from "@/pages/manager-schedule";
import { AdminOvertimePage } from "@/pages/admin-overtime";
import { MyShiftSwapsPage } from "@/pages/my-shift-swaps";
import { AdminBulkImportPage } from "@/pages/admin-bulk-import";
import { AdminIntegrationsPage } from "@/pages/admin-integrations";
import { AdminKitchenPage } from "@/pages/admin-kitchen";
import { MealFeedbackPage } from "@/pages/meal-feedback";
import { AdminRewardsPage } from "@/pages/admin-rewards";
import { EmployeePageGate } from "@/components/employee-page-gate";
import { MenuPage } from "@/pages/menu";
import { MenuFeedbackPage } from "@/pages/menu-feedback";
import { QLandingPage } from "@/pages/q-landing";
import { AnnouncementsPage } from "@/pages/announcements";
import { KvkkPage, TermsPage, PrivacyPage, CookiesPage } from "@/pages/legal";
import { StatusPage } from "@/pages/status";
import { LandingPage } from "@/pages/landing";
import { OnboardingPage } from "@/pages/onboarding";
import { KioskPage } from "@/pages/kiosk";
import { ManagerWorkforcePage } from "@/pages/manager-workforce";
import { MyRecordsPage } from "@/pages/my-records";
import { SettingsHubPage } from "@/pages/settings-hub";
import { SupportPage } from "@/pages/support";
import { CookieBanner } from "@/components/cookie-banner";
import { useMobileDevice } from "@/hooks/use-mobile-device";

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

/**
 * `/` index — login durumuna göre marketing landing veya çalışan ana sayfası.
 * Login yoksa LandingPage (pricing + features + signup CTA).
 * Login varsa AppLayout + EmployeeHomePage (mevcut davranış).
 */
function HomeOrLanding() {
  const { user, org, loading, signInTransition } = useAuthStore();
  if (loading || signInTransition) return <DamgaSplash />;
  if (!user) return <LandingPage />;
  if (user.is_pending || !user.org_id) return <PendingPage />;
  // Owner ve onboarding tamamlanmamış/atlanmamışsa wizard'a yönlendir
  const isOwner = user.role === "owner" || user.role === "admin";
  const needsOnboarding =
    isOwner &&
    org &&
    !org.settings?.onboarding_completed_at &&
    !org.settings?.onboarding_skipped_at;
  if (needsOnboarding) return <Navigate to="/onboarding" replace />;
  return (
    <AppLayout>
      <EmployeeHomePage />
    </AppLayout>
  );
}

function RoleGate({
  roles,
  children,
}: {
  roles: Array<"employee" | "manager" | "admin" | "owner">;
  children: React.ReactNode;
}) {
  const user = useAuthStore((s) => s.user);
  if (!user) return null;
  if (!roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function DesktopOnlyRoute({ children }: { children: React.ReactNode }) {
  const isMobile = useMobileDevice();
  if (isMobile) return <Navigate to="/" replace />;
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
      <Route path="/status" element={<StatusPage />} />

      {/* Index — anon ziyaretçi için marketing landing, auth için EmployeeHome */}
      <Route index element={<HomeOrLanding />} />

      {/* Onboarding wizard (owner için ilk-girişte) — AppLayout dışında, kendi başına */}
      <Route
        path="/onboarding"
        element={
          <PrivateRoute>
            <OnboardingPage />
          </PrivateRoute>
        }
      />

      {/* Kiosk modu (paylaşımlı tablet) — AppLayout dışında, fullscreen */}
      <Route
        path="/kiosk/:locationId"
        element={
          <PrivateRoute>
            <KioskPage />
          </PrivateRoute>
        }
      />

      {/* Auth gerekli */}
      <Route
        element={
          <PrivateRoute>
            <AppLayout />
          </PrivateRoute>
        }
      >
        <Route
          path="history"
          element={
            <EmployeePageGate page="history">
              <Navigate to="/me/records" replace />
            </EmployeePageGate>
          }
        />
        <Route
          path="profile"
          element={
            <DesktopOnlyRoute>
              <Navigate to="/settings" replace />
            </DesktopOnlyRoute>
          }
        />
        <Route
          path="settings"
          element={
            <DesktopOnlyRoute>
              <SettingsHubPage />
            </DesktopOnlyRoute>
          }
        />
        <Route
          path="leaves"
          element={
            <EmployeePageGate page="leaves">
              <Navigate to="/me/records?tab=leaves" replace />
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
            <DesktopOnlyRoute>
              <EmployeePageGate page="menu">
                <MenuFeedbackPage />
              </EmployeePageGate>
            </DesktopOnlyRoute>
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
        <Route path="support" element={<SupportPage />} />
        <Route
          path="gamification"
          element={
            <DesktopOnlyRoute>
              <GamificationPage />
            </DesktopOnlyRoute>
          }
        />
        <Route
          path="leaderboard"
          element={
            <DesktopOnlyRoute>
              <Navigate to="/gamification?tab=ranks" replace />
            </DesktopOnlyRoute>
          }
        />
        <Route
          path="rewards"
          element={
            <DesktopOnlyRoute>
              <Navigate to="/gamification?tab=store" replace />
            </DesktopOnlyRoute>
          }
        />

        {/* Manager+ */}
        <Route
          path="manager"
          element={
            <RoleGate roles={["manager", "admin", "owner"]}>
              <DesktopOnlyRoute>
                <Navigate to="/manager/workforce" replace />
              </DesktopOnlyRoute>
            </RoleGate>
          }
        />
        <Route
          path="manager/workforce"
          element={
            <RoleGate roles={["manager", "admin", "owner"]}>
              <DesktopOnlyRoute>
                <ManagerWorkforcePage />
              </DesktopOnlyRoute>
            </RoleGate>
          }
        />
        <Route
          path="manager/team"
          element={
            <RoleGate roles={["manager", "admin", "owner"]}>
              <DesktopOnlyRoute>
                <Navigate to="/manager/workforce" replace />
              </DesktopOnlyRoute>
            </RoleGate>
          }
        />
        <Route
          path="manager/reports"
          element={
            <RoleGate roles={["manager", "admin", "owner"]}>
              <DesktopOnlyRoute>
                <ManagerReportsPage />
              </DesktopOnlyRoute>
            </RoleGate>
          }
        />
        <Route
          path="manager/puantaj"
          element={
            <RoleGate roles={["manager", "admin", "owner"]}>
              <DesktopOnlyRoute>
                <ManagerPuantajPage />
              </DesktopOnlyRoute>
            </RoleGate>
          }
        />

        {/* Admin+ */}
        <Route
          path="admin"
          element={
            <RoleGate roles={["admin", "owner"]}>
              <DesktopOnlyRoute>
                <Navigate to="/settings?tab=admin" replace />
              </DesktopOnlyRoute>
            </RoleGate>
          }
        />
        <Route
          path="admin/locations"
          element={
            <RoleGate roles={["admin", "owner"]}>
              <DesktopOnlyRoute>
                <AdminLocationsPage />
              </DesktopOnlyRoute>
            </RoleGate>
          }
        />
        <Route
          path="admin/api-keys"
          element={
            <RoleGate roles={["admin", "owner"]}>
              <DesktopOnlyRoute>
                <Navigate to="/admin/integrations" replace />
              </DesktopOnlyRoute>
            </RoleGate>
          }
        />
        <Route
          path="admin/integrations"
          element={
            <RoleGate roles={["admin", "owner"]}>
              <DesktopOnlyRoute>
                <AdminIntegrationsPage />
              </DesktopOnlyRoute>
            </RoleGate>
          }
        />
        <Route
          path="admin/kitchen"
          element={
            <RoleGate roles={["admin", "owner", "manager"]}>
              <AdminKitchenPage />
            </RoleGate>
          }
        />
        <Route
          path="admin/rewards"
          element={
            <RoleGate roles={["admin", "owner"]}>
              <AdminRewardsPage />
            </RoleGate>
          }
        />
        <Route
          path="meal"
          element={
            <PrivateRoute>
              <MealFeedbackPage />
            </PrivateRoute>
          }
        />
        <Route
          path="admin/team"
          element={
            <RoleGate roles={["admin", "owner"]}>
              <DesktopOnlyRoute>
                <AdminTeamPage />
              </DesktopOnlyRoute>
            </RoleGate>
          }
        />
        <Route
          path="admin/departments"
          element={
            <RoleGate roles={["admin", "owner"]}>
              <DesktopOnlyRoute>
                <AdminDepartmentsPage />
              </DesktopOnlyRoute>
            </RoleGate>
          }
        />
        <Route
          path="admin/applications"
          element={
            <RoleGate roles={["admin", "owner"]}>
              <DesktopOnlyRoute>
                <AdminApplicationsPage />
              </DesktopOnlyRoute>
            </RoleGate>
          }
        />
        <Route
          path="admin/settings"
          element={
            <RoleGate roles={["admin", "owner"]}>
              <DesktopOnlyRoute>
                <Navigate to="/settings?tab=admin" replace />
              </DesktopOnlyRoute>
            </RoleGate>
          }
        />
        <Route
          path="admin/pending-users"
          element={
            <RoleGate roles={["admin", "owner"]}>
              <DesktopOnlyRoute>
                <AdminPendingUsersPage />
              </DesktopOnlyRoute>
            </RoleGate>
          }
        />
        <Route
          path="admin/pending-reviews"
          element={
            <RoleGate roles={["manager", "admin", "owner"]}>
              <DesktopOnlyRoute>
                <AdminPendingReviewsPage />
              </DesktopOnlyRoute>
            </RoleGate>
          }
        />
        <Route
          path="admin/live-feed"
          element={
            <RoleGate roles={["manager", "admin", "owner"]}>
              <DesktopOnlyRoute>
                <AdminLiveFeedPage />
              </DesktopOnlyRoute>
            </RoleGate>
          }
        />
        <Route
          path="admin/redemptions"
          element={
            <RoleGate roles={["manager", "admin", "owner"]}>
              <DesktopOnlyRoute>
                <AdminRedemptionsPage />
              </DesktopOnlyRoute>
            </RoleGate>
          }
        />
        <Route
          path="admin/shifts"
          element={
            <RoleGate roles={["admin", "owner"]}>
              <DesktopOnlyRoute>
                <AdminShiftsPage />
              </DesktopOnlyRoute>
            </RoleGate>
          }
        />
        <Route
          path="manager/schedule"
          element={
            <RoleGate roles={["manager", "admin", "owner"]}>
              <DesktopOnlyRoute>
                <ManagerSchedulePage />
              </DesktopOnlyRoute>
            </RoleGate>
          }
        />
        <Route
          path="admin/overtime"
          element={
            <RoleGate roles={["manager", "admin", "owner"]}>
              <DesktopOnlyRoute>
                <AdminOvertimePage />
              </DesktopOnlyRoute>
            </RoleGate>
          }
        />
        <Route path="me/records" element={<MyRecordsPage />} />
        <Route
          path="me/shifts"
          element={<Navigate to="/me/records?tab=shifts" replace />}
        />
        <Route
          path="me/shift-swaps"
          element={
            <DesktopOnlyRoute>
              <MyShiftSwapsPage />
            </DesktopOnlyRoute>
          }
        />
        <Route
          path="me/monthly-market"
          element={
            <DesktopOnlyRoute>
              <Navigate to="/gamification?tab=monthly" replace />
            </DesktopOnlyRoute>
          }
        />
        <Route
          path="admin/bulk-import"
          element={
            <RoleGate roles={["admin", "owner"]}>
              <DesktopOnlyRoute>
                <AdminBulkImportPage />
              </DesktopOnlyRoute>
            </RoleGate>
          }
        />
        <Route
          path="manager/analytics"
          element={
            <RoleGate roles={["manager", "admin", "owner"]}>
              <DesktopOnlyRoute>
                <Navigate to="/manager/workforce?tab=analytics" replace />
              </DesktopOnlyRoute>
            </RoleGate>
          }
        />
        <Route
          path="platform"
          element={
            <DesktopOnlyRoute>
              <Navigate to="/settings?tab=platform" replace />
            </DesktopOnlyRoute>
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
        <CookieBanner />
        <Toaster
          position="top-right"
          theme="light"
          toastOptions={{
            style: { fontFamily: "DM Sans, system-ui, sans-serif" },
          }}
        />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

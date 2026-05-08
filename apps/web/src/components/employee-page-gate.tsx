import { Navigate } from 'react-router-dom';
import {
  useAuthStore,
  DEFAULT_EMPLOYEE_PAGES,
  type EmployeePageKey,
} from '@/hooks/use-auth';

/**
 * Çalışan rolündeki kullanıcılar için sayfa-seviyesinde erişim kontrolü.
 *
 * - Manager/Admin/Owner her zaman görür.
 * - Employee rolündeki kullanıcı, org settings'in `employee_visible_pages` listesinde
 *   olmayan bir sayfayı URL ile açmaya çalışırsa `/` 'a yönlendirilir.
 *
 * Layout'taki nav filter sadece menüden gizliyordu; bu component URL guess'lemeyi
 * de bloklar.
 */
export function EmployeePageGate({
  page,
  children,
}: {
  page: EmployeePageKey;
  children: React.ReactNode;
}) {
  const user = useAuthStore((s) => s.user);
  const org = useAuthStore((s) => s.org);

  if (!user) return <>{children}</>; // PrivateRoute zaten kontrol ediyor — geçişte sorun olmasın
  if (user.role !== 'employee') return <>{children}</>;

  const cfg = org?.settings?.employee_visible_pages;
  const visible = new Set<EmployeePageKey>(
    cfg && cfg.length > 0 ? cfg : DEFAULT_EMPLOYEE_PAGES,
  );
  // home ve profile her zaman açık (sabit)
  visible.add('home');
  visible.add('profile');

  if (!visible.has(page)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

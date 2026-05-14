/**
 * Feature flag hook — frontend'de gated rollout için.
 *
 * Backend GET /v1/feature-flags/me'den context'le çözülmüş flag listesi alır.
 * 60 saniye cache.
 *
 * Kullanım:
 *   const newDashboard = useFeatureFlag('new_dashboard');
 *   if (newDashboard) return <NewDashboard />;
 *   return <OldDashboard />;
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/hooks/use-auth';

type FlagKey =
  | 'new_dashboard'
  | 'sms_2fa'
  | 'beta_bordro_excel'
  | 'video_kvkk_consent'
  | 'ai_anomaly_detection';

interface FlagsResponse {
  flags: Record<FlagKey, boolean>;
}

export function useFeatureFlags() {
  const user = useAuthStore((s) => s.user);
  return useQuery<FlagsResponse>({
    queryKey: ['feature-flags', user?.id],
    queryFn: async () => (await api.get('/feature-flags/me')).data,
    enabled: !!user,
    staleTime: 60_000, // 1 dakika
    retry: false,
  });
}

export function useFeatureFlag(key: FlagKey): boolean {
  const { data } = useFeatureFlags();
  return data?.flags?.[key] ?? false;
}

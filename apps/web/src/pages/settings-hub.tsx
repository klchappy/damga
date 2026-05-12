import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AdminSettingsPage } from '@/pages/admin-settings';
import { PlatformPage } from '@/pages/platform';
import { ProfilePage } from '@/pages/profile';
import { useAuthStore } from '@/hooks/use-auth';
import { api } from '@/lib/api';

type SettingsTab = 'profile' | 'admin' | 'platform';

interface PlatformMe {
  is_platform_admin: boolean;
}

export function SettingsHubPage() {
  const user = useAuthStore((s) => s.user);
  const [params, setParams] = useSearchParams();
  const isAdmin = user ? ['admin', 'owner'].includes(user.role) : false;

  const { data: platformMe } = useQuery<PlatformMe>({
    queryKey: ['platform-me'],
    queryFn: async () => (await api.get('/platform/me')).data,
    enabled: !!user,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const isPlatformAdmin = platformMe?.is_platform_admin === true;

  const requestedTab = params.get('tab') as SettingsTab | null;
  const activeTab: SettingsTab =
    requestedTab === 'admin' && isAdmin
      ? 'admin'
      : requestedTab === 'platform' && isPlatformAdmin
        ? 'platform'
        : 'profile';

  useEffect(() => {
    if (requestedTab && requestedTab !== activeTab) {
      setParams(activeTab === 'profile' ? {} : { tab: activeTab }, { replace: true });
    }
  }, [activeTab, requestedTab, setParams]);

  const tabs = [
    { key: 'profile' as const, label: 'Profil', desc: 'Kullanıcı bilgileri ve oturum' },
    ...(isAdmin
      ? [{ key: 'admin' as const, label: 'Şirket', desc: 'Kurum, sayfalar ve sistem ayarları' }]
      : []),
    ...(isPlatformAdmin
      ? [{ key: 'platform' as const, label: 'Platform', desc: 'Üst yönetim ve servis görünümü' }]
      : []),
  ];

  const setTab = (tab: SettingsTab) => {
    setParams(tab === 'profile' ? {} : { tab });
  };

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6 space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">
            Ayarlar
          </p>
          <h1 className="font-display text-2xl font-semibold text-ink">
            Profil, şirket ve platform
          </h1>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setTab(tab.key)}
            className={`rounded-lg border px-4 py-3 text-left transition ${
              activeTab === tab.key
                ? 'border-orange-400 bg-orange-50 text-ink shadow-sm'
                : 'border-orange-100 bg-white text-muted hover:border-orange-200 hover:text-ink'
            }`}
          >
            <div className="text-sm font-semibold">{tab.label}</div>
            <div className="mt-1 text-xs">{tab.desc}</div>
          </button>
        ))}
      </div>

      <div className="[&>.container]:max-w-none [&>.container]:px-0 [&>.container]:py-0">
        {activeTab === 'profile' && <ProfilePage />}
        {activeTab === 'admin' && isAdmin && <AdminSettingsPage />}
        {activeTab === 'platform' && isPlatformAdmin && <PlatformPage />}
      </div>
    </div>
  );
}

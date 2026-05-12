import { useSearchParams } from 'react-router-dom';
import { ManagerAnalyticsPage } from '@/pages/manager-analytics';
import { ManagerTeamPage } from '@/pages/manager-team';

type WorkforceTab = 'team' | 'analytics';

const tabs: Array<{ key: WorkforceTab; label: string; desc: string }> = [
  { key: 'team', label: 'Ekip', desc: 'Ekip durumu, kişiler ve hızlı işlemler' },
  { key: 'analytics', label: 'Performans', desc: 'Devam, puan ve operasyon metrikleri' },
];

function normalizeTab(value: string | null): WorkforceTab {
  return value === 'analytics' ? value : 'team';
}

export function ManagerWorkforcePage() {
  const [params, setParams] = useSearchParams();
  const activeTab = normalizeTab(params.get('tab'));

  const setTab = (tab: WorkforceTab) => {
    setParams(tab === 'team' ? {} : { tab });
  };

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6 space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">
            Yönetim
          </p>
          <h1 className="font-display text-2xl font-semibold text-ink">
            Ekip ve performans
          </h1>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
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
        {activeTab === 'team' && <ManagerTeamPage />}
        {activeTab === 'analytics' && <ManagerAnalyticsPage />}
      </div>
    </div>
  );
}

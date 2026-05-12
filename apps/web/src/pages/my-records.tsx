import { useSearchParams } from 'react-router-dom';
import { HistoryPage } from '@/pages/history';
import { LeavesMinePage } from '@/pages/leaves-mine';
import { MyShiftsPage } from '@/pages/my-shifts';
import {
  DEFAULT_EMPLOYEE_PAGES,
  type EmployeePageKey,
  useAuthStore,
} from '@/hooks/use-auth';

type RecordsTab = 'history' | 'shifts' | 'leaves';

const tabs: Array<{ key: RecordsTab; label: string; desc: string }> = [
  { key: 'history', label: 'Geçmişim', desc: 'Giriş, çıkış ve molalar' },
  { key: 'shifts', label: 'Vardiyalarım', desc: 'Planlanan vardiya takvimi' },
  { key: 'leaves', label: 'İzinlerim', desc: 'İzin talepleri ve durumları' },
];

function normalizeTab(value: string | null): RecordsTab {
  return value === 'shifts' || value === 'leaves' ? value : 'history';
}

export function MyRecordsPage() {
  const user = useAuthStore((s) => s.user);
  const org = useAuthStore((s) => s.org);
  const [params, setParams] = useSearchParams();
  const visibleSet =
    user?.role === 'employee'
      ? new Set<EmployeePageKey>(
          org?.settings?.employee_visible_pages?.length
            ? org.settings.employee_visible_pages
            : DEFAULT_EMPLOYEE_PAGES,
        )
      : new Set<EmployeePageKey>(['history', 'leaves']);
  const visibleTabs = tabs.filter(
    (tab) => tab.key === 'shifts' || visibleSet.has(tab.key === 'history' ? 'history' : 'leaves'),
  );
  const requestedTab = normalizeTab(params.get('tab'));
  const activeTab = visibleTabs.some((tab) => tab.key === requestedTab)
    ? requestedTab
    : visibleTabs[0]?.key ?? 'shifts';

  const setTab = (tab: RecordsTab) => {
    setParams(tab === 'history' ? {} : { tab });
  };

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6 space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">
            Kayıtlarım
          </p>
          <h1 className="font-display text-2xl font-semibold text-ink">
            Geçmiş, vardiya ve izinler
          </h1>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {visibleTabs.map((tab) => (
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
        {activeTab === 'history' && <HistoryPage />}
        {activeTab === 'shifts' && <MyShiftsPage />}
        {activeTab === 'leaves' && <LeavesMinePage />}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import {
  getNotificationPermission,
  isNotificationSupported,
  isPermissionPromptDismissed,
  requestNotificationPermission,
  setPermissionPromptDismissed,
} from '@/lib/notifications';

/**
 * Sağ alttta kibar bir chip — kullanıcıya bildirim izni vermesini önerir.
 *
 * Kapatılırsa bir daha gösterilmez (localStorage). İzin granted/denied ise
 * de gösterilmez.
 */
export function NotificationPermissionGate() {
  const [visible, setVisible] = useState(false);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    if (!isNotificationSupported()) return;
    const perm = getNotificationPermission();
    if (perm !== 'default') return;
    if (isPermissionPromptDismissed()) return;
    // 6 saniye sonra göster (sayfa yüklenirken bombardıman olmasın)
    const t = window.setTimeout(() => setVisible(true), 6000);
    return () => window.clearTimeout(t);
  }, []);

  if (!visible) return null;

  const handleAllow = async () => {
    setRequesting(true);
    await requestNotificationPermission();
    setRequesting(false);
    setVisible(false);
    setPermissionPromptDismissed();
  };

  const handleDismiss = () => {
    setVisible(false);
    setPermissionPromptDismissed();
  };

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 sm:left-auto sm:right-4 sm:translate-x-0 z-40 max-w-[calc(100vw-2rem)] w-full sm:w-[340px]">
      <div className="rounded-xl border-2 border-orange-200 bg-white shadow-lg p-3 flex items-start gap-3 animate-notif-pop">
        <div className="flex size-9 items-center justify-center rounded-lg bg-orange-100 text-orange-600 shrink-0">
          <Bell className="size-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-ink">Bildirimleri aç</div>
          <p className="text-xs text-muted mt-0.5">
            Damga vurduktan sonra ruh halini sormak için sessiz bir bildirim.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={handleAllow}
              disabled={requesting}
              className="btn-primary text-xs flex-1 py-1.5"
            >
              İzin ver
            </button>
            <button
              onClick={handleDismiss}
              disabled={requesting}
              className="btn-outline text-xs py-1.5 px-2"
              title="Kapat"
              aria-label="Kapat"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes notif-pop {
          0% { transform: translateY(20px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        .animate-notif-pop { animation: notif-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
      `}</style>
    </div>
  );
}

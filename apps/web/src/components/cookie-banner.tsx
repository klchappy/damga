import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cookie, X } from 'lucide-react';

const STORAGE_KEY = 'damga-cookie-consent';

export function CookieBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const consent = window.localStorage.getItem(STORAGE_KEY);
    if (!consent) {
      const t = window.setTimeout(() => setShow(true), 1500);
      return () => window.clearTimeout(t);
    }
  }, []);

  const accept = () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ accepted: true, ts: Date.now() }),
    );
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-3 left-3 right-3 sm:bottom-4 sm:left-4 sm:right-auto sm:max-w-md z-50 animate-fade-in-up">
      <div className="card bg-white border-2 border-orange-100 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-orange-100 text-orange-700 shrink-0">
            <Cookie className="size-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-display font-bold text-sm">Çerez Bildirimi</h3>
            <p className="text-xs text-muted mt-1">
              Damga yalnızca <strong>zorunlu çerezler</strong> kullanır (oturum, tercihler).
              Üçüncü taraf takip çerezi yoktur.{' '}
              <Link
                to="/legal/cookies"
                className="text-orange-600 hover:underline font-medium"
              >
                Detay
              </Link>
            </p>
            <div className="flex items-center gap-2 mt-2">
              <button onClick={accept} className="btn-primary text-xs">
                Anladım, Kabul Ediyorum
              </button>
              <button
                onClick={() => setShow(false)}
                className="btn-ghost p-1.5 text-muted"
                aria-label="Kapat"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up {
          animation: fadeInUp 0.4s ease-out;
        }
      `}</style>
    </div>
  );
}

import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Home, Search } from 'lucide-react';

/**
 * 404 — Sayfa Bulunamadı.
 * <Route path="*"> ile yakalanmayan tüm rotalar buraya düşer.
 *
 * Önceki davranış: `<Navigate to="/" replace />` ile sessizce ana sayfaya
 * yönlendiriliyordu; kullanıcı neden geldiğini anlayamıyordu. Production audit
 * bulgusu K7: explicit 404 göstermek + geri dönüş seçenekleri sunmak.
 */
export function NotFoundPage() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream px-4 py-12">
      <div className="card max-w-md w-full text-center space-y-4">
        <div className="font-display text-7xl text-orange-500 leading-none">404</div>
        <h1 className="font-display text-2xl">Sayfa Bulunamadı</h1>
        <p className="text-sm text-muted">
          Aradığın sayfa taşınmış, silinmiş veya hiç var olmamış olabilir.
        </p>

        {location.pathname && location.pathname !== '/' && (
          <div className="rounded-lg bg-orange-50/50 border border-orange-100 px-3 py-2 text-xs text-orange-800 font-mono break-all">
            <Search className="inline size-3 mr-1" />
            {location.pathname}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <button
            type="button"
            className="btn-secondary flex-1"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="size-4" />
            Geri Dön
          </button>
          <Link to="/" className="btn-primary flex-1">
            <Home className="size-4" />
            Ana Sayfa
          </Link>
        </div>

        <div className="text-xs text-muted pt-3 border-t border-orange-100">
          Sorunu bildirmek istersen{' '}
          <Link to="/support" className="text-orange-600 hover:underline">
            destek talebi
          </Link>{' '}
          aç.
        </div>
      </div>
    </div>
  );
}

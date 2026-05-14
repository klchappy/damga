/**
 * Damga marketing landing page — public, auth gerektirmez.
 *
 * Ziyaretçinin ilk gördüğü sayfa. Hedef:
 *   1. 5 saniyede "Damga ne yapar?" anlasın
 *   2. "Hemen ücretsiz başla" CTA → /auth/sign-up-org
 *   3. Pricing açıkça görünsün
 *   4. Sosyal kanıt / örnek senaryolar / KVKK güveni
 *
 * Routing: `<Route index>` altında. Login olmuş kullanıcı `/` ziyaret ederse
 * `app.tsx` içindeki HomeOrLanding wrapper'ı EmployeeHomePage'e yönlendirir.
 */
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Shield,
  Smartphone,
  Sparkles,
  Stamp,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';

const FEATURES = [
  {
    Icon: Stamp,
    title: 'NFC + QR + GPS yoklama',
    body: 'Çalışan telefonunu NFC etiketine yaklaştırır veya QR okutur. GPS + WiFi + cihaz parmak iziyle dürüstlük skoru. Hile mümkün değil.',
  },
  {
    Icon: Shield,
    title: 'Manipülasyona kapalı hash-zinciri',
    body: 'Her giriş-çıkış olayı bir önceki olayın hash\'iyle imzalanır. Geriye dönük müdahale anında yakalanır — KVKK uyumlu denetim izi.',
  },
  {
    Icon: Clock,
    title: 'Vardiya + esnek mesai',
    body: 'Sabit, dönüşümlü veya kişiselleştirilmiş vardiyalar. Vardiya takası, mesai onayı, izin yönetimi — hepsi tek panelde.',
  },
  {
    Icon: TrendingUp,
    title: 'Gerçek zamanlı raporlama',
    body: 'Canlı feed, geç kalma ısı haritası, departman karşılaştırması, bordro çıktısı (CSV). Tek tıkla PDF rapor.',
  },
  {
    Icon: Smartphone,
    title: 'Mobil-öncelikli PWA',
    body: 'Ana ekrana kurulur, internet kesik bile olsa yoklama alır, sonra sync olur. iOS/Android native uygulama gelecek.',
  },
  {
    Icon: Zap,
    title: 'API + Webhook entegrasyonu',
    body: 'Logo, Mikro, SAP veya kendi yazılımına bağlanır. Webhook HMAC v2, idempotency anahtarları, OpenAPI dokümantasyonu.',
  },
];

const PLANS = [
  {
    name: 'Free',
    price: '₺0',
    period: '/ay',
    body: 'Tek lokasyon, 3 çalışana kadar denemek için ideal.',
    features: [
      '3 kullanıcı',
      '1 lokasyon',
      'NFC + QR + GPS yoklama',
      'Hash-zinciri denetim',
      'Mobil PWA',
      '30 gün veri saklama',
    ],
    cta: 'Ücretsiz başla',
    highlighted: false,
  },
  {
    name: 'Starter',
    price: '₺99',
    period: '/ay',
    body: 'Küçük işletme — kafe, butik mağaza, ofis.',
    features: [
      '10 kullanıcı',
      '2 lokasyon',
      '1 API anahtarı + webhook',
      'Mesai onay zinciri',
      'Departmanlar',
      '90 gün veri saklama',
    ],
    cta: 'Starter ile başla',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '₺299',
    period: '/ay',
    body: 'Restoran zinciri, lojistik, üretim hatları için.',
    features: [
      '25 kullanıcı',
      '5 lokasyon',
      '3 API anahtarı + webhook',
      'Bordro export (CSV)',
      'Vardiya takası + overtime',
      '1 yıl veri saklama',
      'E-posta önceliği',
    ],
    cta: 'Pro\'yu seç',
    highlighted: true,
  },
  {
    name: 'Business',
    price: '₺899',
    period: '/ay',
    body: 'Çok şube, holding, kurumsal İK ekipleri için.',
    features: [
      '100 kullanıcı',
      '20 lokasyon',
      '10 API anahtarı + webhook',
      'KVKK denetim raporu',
      'Telefon desteği',
      'Sınırsız veri saklama',
      'Tek hesap yöneticisi',
    ],
    cta: 'Business\'a geç',
    highlighted: false,
  },
];

const SECTORS = [
  { emoji: '🍽️', label: 'Restoran & kafe zinciri', detail: 'Vardiyalı, multi-şube' },
  { emoji: '🚐', label: 'Lojistik & kargo', detail: 'Saha, GPS, sürücü' },
  { emoji: '🏭', label: 'Üretim & fabrika', detail: 'NFC kapı, vardiyalı işçi' },
  { emoji: '🛍️', label: 'Perakende mağaza', detail: 'Parttime, multi-lokasyon' },
  { emoji: '🏢', label: 'Holding & kurumsal', detail: 'Departman, izin onay zinciri' },
  { emoji: '🛎️', label: 'Hizmet & AVM', detail: 'Esnek vardiya, bordro' },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-zinc-900">
      {/* Top nav */}
      <nav className="border-b border-zinc-100 bg-white/80 backdrop-blur sticky top-0 z-30">
        <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-bold">
            <span className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center">
              <Stamp className="w-4 h-4" />
            </span>
            Damga
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <Link to="/status" className="hidden sm:inline text-zinc-500 hover:text-zinc-900 px-3 py-1.5">
              Durum
            </Link>
            <a href="#fiyatlar" className="hidden sm:inline text-zinc-500 hover:text-zinc-900 px-3 py-1.5">
              Fiyatlar
            </a>
            <Link to="/auth/sign-in" className="text-zinc-600 hover:text-zinc-900 px-3 py-1.5">
              Giriş
            </Link>
            <Link
              to="/auth/sign-up-org"
              className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 font-medium"
            >
              Ücretsiz başla
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 py-16 md:py-24 text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 text-blue-700 px-3 py-1 text-xs font-medium mb-6">
          <Sparkles className="w-3.5 h-3.5" />
          Şeffaf, manipülasyona kapalı işyeri yoklama
        </div>
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight max-w-3xl mx-auto leading-tight">
          Çalışanların geliş-gidişi <span className="text-blue-600">kanıtlı</span> ve şeffaf
        </h1>
        <p className="mt-6 text-lg md:text-xl text-zinc-600 max-w-2xl mx-auto">
          NFC, QR, GPS, WiFi ve cihaz parmak izinden hesaplanan dürüstlük skoru.
          Hash-zincirli denetim izi. Manipüle edilemez bir yoklama sistemi.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/auth/sign-up-org"
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 font-semibold shadow-sm hover:shadow-md transition"
          >
            Ücretsiz başla
            <ArrowRight className="w-4 h-4" />
          </Link>
          <a
            href="#nasil-calisir"
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 px-6 py-3 font-semibold text-zinc-700"
          >
            Nasıl çalışır?
          </a>
        </div>
        <p className="mt-4 text-xs text-zinc-500">
          Kredi kartı gerekmez · 3 çalışana kadar daima ücretsiz · KVKK uyumlu
        </p>
      </section>

      {/* Logos / social proof placeholder */}
      <section className="border-y border-zinc-100 bg-zinc-50">
        <div className="mx-auto max-w-6xl px-4 py-6 text-center">
          <p className="text-xs text-zinc-500 uppercase tracking-wider">
            Üretim altyapımız
          </p>
          <div className="mt-3 flex items-center justify-center gap-6 text-zinc-400 text-sm flex-wrap">
            <span>🇪🇺 Supabase EU</span>
            <span>·</span>
            <span>🇩🇪 Hetzner Cloud</span>
            <span>·</span>
            <span>☁️ Cloudflare</span>
            <span>·</span>
            <span>🛡️ Sentry</span>
            <span>·</span>
            <span>📊 Self-hosted Status</span>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="nasil-calisir" className="mx-auto max-w-6xl px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold">Sadece "buraya basın" değil</h2>
          <p className="mt-4 text-zinc-600 max-w-2xl mx-auto">
            Damga işyerinde 6 farklı sinyal birleştirir. Geç kalan kullanıcı GPS'ini
            sabote etse bile cihaz parmak izi yakalar.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((f) => (
            <div key={f.title} className="p-6 rounded-2xl border border-zinc-100 hover:border-blue-200 hover:shadow-sm transition">
              <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
                <f.Icon className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-lg">{f.title}</h3>
              <p className="mt-2 text-sm text-zinc-600 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Sectors */}
      <section className="bg-zinc-50 border-y border-zinc-100">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold">Hangi sektörler kullanıyor?</h2>
            <p className="mt-3 text-zinc-600">
              Multi-tenant — her firma kendi verisi izole, kendi planı, kendi kurallarıyla.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
            {SECTORS.map((s) => (
              <div key={s.label} className="bg-white rounded-xl p-4 border border-zinc-100 flex items-center gap-3">
                <span className="text-3xl">{s.emoji}</span>
                <div>
                  <div className="font-semibold text-sm">{s.label}</div>
                  <div className="text-xs text-zinc-500">{s.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="fiyatlar" className="mx-auto max-w-6xl px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold">Şeffaf fiyatlandırma</h2>
          <p className="mt-4 text-zinc-600">
            Kullanıcı sayına göre seç. Ölçeklenirse plan değiştirmek 1 tık.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {PLANS.map((p) => (
            <div
              key={p.name}
              className={`rounded-2xl p-6 border-2 ${
                p.highlighted
                  ? 'border-blue-600 bg-blue-50/50 shadow-lg relative'
                  : 'border-zinc-100'
              }`}
            >
              {p.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                  EN POPÜLER
                </div>
              )}
              <h3 className="font-bold text-lg">{p.name}</h3>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-bold">{p.price}</span>
                <span className="text-zinc-500 text-sm">{p.period}</span>
              </div>
              <p className="mt-2 text-sm text-zinc-600 min-h-[2.5em]">{p.body}</p>
              <ul className="mt-4 space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                to="/auth/sign-up-org"
                className={`mt-6 block text-center rounded-lg py-2.5 font-semibold transition ${
                  p.highlighted
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-900'
                }`}
              >
                {p.cta}
              </Link>
            </div>
          ))}
        </div>
        <p className="text-center text-xs text-zinc-500 mt-8">
          KDV dahil değildir · İhtiyacın daha büyük mü?{' '}
          <a href="mailto:satis@deploi.net" className="text-blue-600 hover:underline">
            satis@deploi.net
          </a>
        </p>
      </section>

      {/* Trust + KVKK */}
      <section className="bg-zinc-50 border-y border-zinc-100">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 text-emerald-700 px-3 py-1 text-xs font-medium mb-4">
            <Shield className="w-3.5 h-3.5" />
            KVKK uyumlu
          </div>
          <h2 className="text-2xl md:text-3xl font-bold">Veriler EU'da. Şifre çiğden bile değil.</h2>
          <p className="mt-4 text-zinc-600">
            Tüm kişisel veriler Supabase EU-Central (Frankfurt) bölgesinde tutulur.
            Sentry'ye gönderilen hata raporlarında PII filtrelenir. Hash-zincirli denetim
            izi ile veri bütünlüğü sürekli doğrulanır.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-sm">
            <Link to="/legal/kvkk" className="text-blue-600 hover:underline">
              KVKK Aydınlatma Metni
            </Link>
            <span className="text-zinc-300">·</span>
            <Link to="/legal/privacy" className="text-blue-600 hover:underline">
              Gizlilik Politikası
            </Link>
            <span className="text-zinc-300">·</span>
            <Link to="/legal/terms" className="text-blue-600 hover:underline">
              Hizmet Şartları
            </Link>
            <span className="text-zinc-300">·</span>
            <Link to="/status" className="text-blue-600 hover:underline">
              Sistem Durumu
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-3xl px-4 py-20 text-center">
        <Users className="w-12 h-12 text-blue-600 mx-auto mb-4" />
        <h2 className="text-3xl md:text-4xl font-bold">Ekibinin bugün başlamasına izin ver</h2>
        <p className="mt-4 text-zinc-600">
          3 kullanıcıya kadar daima ücretsiz. 2 dakikada ilk lokasyonunu kuruyorsun.
        </p>
        <Link
          to="/auth/sign-up-org"
          className="mt-8 inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-8 py-3.5 font-semibold shadow-md hover:shadow-lg transition"
        >
          Ücretsiz hesap aç
          <ArrowRight className="w-4 h-4" />
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-100">
        <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-zinc-500 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-md bg-blue-600 text-white flex items-center justify-center">
              <Stamp className="w-3.5 h-3.5" />
            </span>
            <span className="font-semibold text-zinc-700">Damga</span>
            <span className="text-zinc-400">· deploi.net</span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Link to="/legal/kvkk" className="hover:text-zinc-900">KVKK</Link>
            <Link to="/legal/privacy" className="hover:text-zinc-900">Gizlilik</Link>
            <Link to="/legal/terms" className="hover:text-zinc-900">Şartlar</Link>
            <Link to="/legal/cookies" className="hover:text-zinc-900">Çerezler</Link>
            <Link to="/status" className="hover:text-zinc-900">Durum</Link>
            <a href="mailto:destek@deploi.net" className="hover:text-zinc-900">Destek</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

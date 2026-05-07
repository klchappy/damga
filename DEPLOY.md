# 🚀 Damga Deploy Kılavuzu

> Hedef: Damga'yı `https://damga.deploi.net` ve `https://api.damga.deploi.net` üzerinden canlı.

## Önkoşullar

- Cloudflare DNS yönetiminde `deploi.net` domain'i ✓ (mevcut)
- Hetzner CX22+ sunucu + Coolify ✓ (mevcut)
- GitHub repo `klchappy/damga` ✓ (oluşturuldu)
- Yeni Supabase projesi ❌ (sen açacaksın — adım 1)

---

## Adım 1: Supabase yeni proje aç

1. https://app.supabase.com → **New project**
2. Bilgiler:
   - **Name**: `damga`
   - **Region**: `Frankfurt (eu-central-1)` (Hetzner'a yakın)
   - **Database password**: güvenli bir şifre belirle (örn `D@mg@2026$Strong!`)
3. Proje açıldıktan sonra (1-2 dakika), şu bilgileri kaydet:
   - Settings → API → **Project URL** (örn `https://abcdef.supabase.co`)
   - Settings → API → **anon public** key
   - Settings → API → **service_role** key (çok gizli!)
   - Settings → Database → Connection string → **URI** (pooled, port 6543)
   - Settings → Database → Connection string → **Direct connection** (port 5432, migration için)

## Adım 2: Lokal `.env` doldur (migration çalıştırmak için)

`.env` dosyasını proje kökünde oluştur (.env.example'dan kopyala) ve şunları doldur:

```bash
NODE_ENV=production

DATABASE_URL=postgres://postgres.YOUR-PROJECT:PASSWORD@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
DIRECT_URL=postgres://postgres.YOUR-PROJECT:PASSWORD@aws-0-eu-central-1.pooler.supabase.com:5432/postgres

SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_ANON_KEY=eyJxxxx...
SUPABASE_SERVICE_ROLE_KEY=eyJxxxx...

NFC_SIGNING_SECRET=  # ÖZEL BİR SECRET ÜRET (en az 32 karakter)

# RESEND vs Faz 2'de
```

NFC_SIGNING_SECRET için: `openssl rand -hex 32` veya online password generator kullan.

## Adım 3: Migration uygula (lokalden Supabase'e)

```bash
pnpm install
pnpm db:generate    # Drizzle migration üretir
pnpm db:migrate     # Supabase'e uygular (hash chain trigger dahil)
```

Sonuç olarak Supabase'de 14 tablo + hash chain trigger + verify_hash_chain() function oluşur.

## Adım 4: Cloudflare DNS — subdomain'ler

https://dash.cloudflare.com → deploi.net → DNS → Records

Ekle:

| Type | Name | Content | Proxy |
|---|---|---|---|
| A | `damga` | `<Hetzner IP>` (TahminIO ile aynı) | DNS only (gri) |
| A | `api.damga` | `<Hetzner IP>` | DNS only (gri) |

> Coolify SSL sertifikasını otomatik yönetir; Cloudflare proxy'yi bu yüzden kapalı tutuyoruz.

## Adım 5: Coolify'da Damga projesi ve servisleri

### 5.1 Yeni proje
1. Coolify → **Projects** → **+ New Project** → adı: `damga`
2. Environment: `production` (default)

### 5.2 `damga-api` servisi
1. **+ New Resource** → **Public Repository** veya **GitHub App** → `klchappy/damga`
2. **Build pack**: Dockerfile
3. **Dockerfile path**: `apps/api/Dockerfile`
4. **Build context**: `/` (root, monorepo nedeniyle)
5. **Domain**: `https://api.damga.deploi.net`
6. **Healthcheck**: Path `/v1/health/healthz`, Port 4100
7. **Environment Variables** (Save → Deploy):

```
NODE_ENV=production
PORT=4100
CLIENT_URL=https://damga.deploi.net
SERVER_URL=https://api.damga.deploi.net

DATABASE_URL=<Supabase pooled URL>
DIRECT_URL=<Supabase direct URL>

SUPABASE_URL=<Supabase URL>
SUPABASE_ANON_KEY=<anon>
SUPABASE_SERVICE_ROLE_KEY=<service_role>

NFC_SIGNING_SECRET=<32+ karakter güvenli secret>

RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=120

# Faz 2'de Resend eklenir
```

### 5.3 `damga-web` servisi
1. **+ New Resource** → aynı repo
2. **Dockerfile path**: `apps/web/Dockerfile`
3. **Domain**: `https://damga.deploi.net`
4. **Healthcheck**: Path `/healthz`, Port 80
5. **Build args** (önemli — Vite build-time'da inject olur):

```
VITE_API_URL=https://api.damga.deploi.net
VITE_SUPABASE_URL=<Supabase URL>
VITE_SUPABASE_ANON_KEY=<anon>
```

> Build args, environment variables'tan FARKLI bir alan. Coolify'da Configuration → Build → "Build arguments" sekmesi.

### 5.4 Auto-deploy webhook ✓
GitHub repo `klchappy/damga`'ya Coolify webhook zaten eklendi (id 619093759). Bundan sonraki tüm `git push origin main` Coolify'da otomatik build tetikler.

## Adım 6: Supabase URL whitelist

https://supabase.com/dashboard/project/YOUR-PROJECT/auth/url-configuration

- **Site URL**: `https://damga.deploi.net`
- **Redirect URLs** (+ Add URL):
  - `https://damga.deploi.net/auth/callback`
  - `https://damga.deploi.net/auth/reset-password`
  - `https://damga.deploi.net/**`
  - `http://localhost:5273/**` (dev için)

## Adım 7: Supabase Auth → Email templates (TR)

Supabase Auth → Email Templates altında 3 template'i Türkçeleştir:
- **Confirm signup**
- **Reset password**
- **Magic Link**

(Resend SMTP entegrasyonu Faz 2'de.)

## Adım 8: İlk smoke test

```bash
# API
curl https://api.damga.deploi.net/v1/health
# → { status: "ok", configured: { db: true, supabase: true, ... } }

# Web
curl -I https://damga.deploi.net/
# → HTTP 200

# Healthz
curl https://damga.deploi.net/healthz
# → ok
```

## Adım 9: Sign-up → ilk org açılışı

1. https://damga.deploi.net/auth/sign-up
2. Adın, şirket adın, e-posta, şifre + KVKK onayı
3. Mailini kontrol et → confirmation linkine tıkla
4. Sign-in → otomatik dashboard'a yönlendirilir
5. Sen `owner` rolüsün — `/admin/locations` görünür

## Adım 10: İlk lokasyon + NFC tag + QR test

1. `/admin/locations` → "Yeni Lokasyon"
2. "📍 Şu anki konumumu al" → kaydet
3. Lokasyon kartında **"NFC Tag Oluştur"** → payload kopyala
4. Telefonunda **NFC Tools** uygulamasıyla bir NTAG215 tag'a yaz
5. Veya **"QR Kod Oluştur"** → QR görseli aç → ekran görüntüsü al
6. Ana sayfa `/` → "Damga vur" → NFC tap **veya** QR tara → check-in!

## Sorun çözme

- **`/v1/health` 503**: Supabase env'leri eksik
- **Web 503**: Coolify build log'una bak (genelde build args eksik)
- **`Trust score 0`**: NFC_SIGNING_SECRET .env'de ve Coolify'da AYNI olmalı
- **NFC çalışmıyor**: Tarayıcı Chrome Android olmalı (iOS Safari Web NFC desteklemiyor)
- **QR çalışmıyor**: HTTPS gerekli (lokal'de localhost da OK)

## TahminIO ile çakışma kontrolü ✓

| Servis | TahminIO | Damga |
|---|---|---|
| GitHub repo | klchappy/tahminio | klchappy/damga |
| Web port (lokal) | 5173 | 5273 |
| API port (lokal) | 4000 | 4100 |
| Postgres (lokal) | — | 5433 |
| Domain | deploi.net + api.deploi.net | damga.deploi.net + api.damga.deploi.net |
| Coolify proje | tahminio | damga |
| Supabase proje | tahminio | damga (yeni — bu kılavuzda) |

Hiçbir kaynakta çakışma yok ✅

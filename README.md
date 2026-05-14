# Damga

> **Şeffaf işyeri yoklama platformu** — NFC + QR + GPS doğrulamalı, hash chain'li, multi-tenant SaaS.
> Personel check-in/out, vardiya, izin, mesai, gamification ve raporlama tek platformda.

[![Production](https://img.shields.io/badge/production-canlı-green.svg)](https://damga.deploi.net) [![API](https://img.shields.io/badge/API-v1-orange.svg)](https://api.damga.deploi.net/v1/health) [![License](https://img.shields.io/badge/license-Proprietary-blue.svg)](#lisans)

🌐 **Production:** [damga.deploi.net](https://damga.deploi.net) · 🔌 **API:** [api.damga.deploi.net/v1](https://api.damga.deploi.net/v1) · 📚 **Docs:** [`docs/`](./docs)

---

## 🎯 Neden Damga?

İşletmelerin personel takip yönetiminde yaşadığı 5 derdi tek platformda çözer:

| Dert | Damga çözümü |
|---|---|
| Excel kaosu, manuel yoklama | Otomatik NFC/QR/GPS check-in |
| Sahte check-in / başkası adına giriş | Hash chain + trust score + GPS doğrulama |
| KVKK uyumsuzluk riski | KVKK uyumlu, 5 yıl saklama, audit log |
| Kayıp mesai, eksik bordro | Otomatik overtime onay + bordro CSV (3-1) |
| Kağıt evrak (vardiya, izin) | Self-servis mobil/web onay akışları |

---

## 🏗️ Mimari

**Multi-tenant SaaS** — her şirket kendi izole org'una sahip. Tek kod tabanı, tek altyapı, çoklu tenant.

```
┌─────────────────────────────────────────────────────┐
│              damga.deploi.net (Web)                  │
│         (React + Vite + Tailwind + Capacitor)        │
└────────────────────┬────────────────────────────────┘
                     │ HTTPS + JWT
                     ▼
┌─────────────────────────────────────────────────────┐
│         api.damga.deploi.net (REST API /v1)          │
│      (Express + TypeScript + Drizzle ORM)            │
│  ┌──────────────┐  ┌──────────────────────────────┐ │
│  │ requireAuth  │  │ Rate limit (per-key)          │ │
│  │ (JWT / API)  │  │ Idempotency middleware        │ │
│  └──────┬───────┘  └──────────────────────────────┘ │
│         │ req.authOrgId (her sorguda zorunlu)       │
└─────────┼───────────────────────────────────────────┘
          ▼
┌─────────────────────────────────────────────────────┐
│        Supabase PostgreSQL (EU, RLS aktif)           │
│  public.orgs / users / attendance_events / ...       │
│  Hash chain trigger (append-only audit log)          │
└─────────────────────────────────────────────────────┘
          ▲
          │ Webhook (HMAC V2)
          ▼
┌─────────────────────────────────────────────────────┐
│  Dış sistemler (Lokma, müşteri ERP'leri, vb.)        │
│  Bearer dmg_svc_xxx (service key, org-bağımsız)      │
│  veya dmg_live_xxx (org-admin key)                   │
└─────────────────────────────────────────────────────┘
```

**İzolasyon katmanları:**
1. **Uygulama katmanı:** Her sorguda `WHERE org_id = req.authOrgId` zorunlu
2. **DB katmanı:** RLS default-deny (36 tablo, `service_role` bypass eder)
3. **Auth katmanı:** Supabase JWT veya API key, 3 ayrı yetki tipi
4. **Audit katmanı:** Hash chain — geriye dönük tahrif imkansız

---

## ✨ Modüller

### Çalışan tarafı (mobil + web)
- **Check-in/out** — NFC tag, QR kod veya GPS ile tek dokunuşta
- **Geçmiş** — kendi check-in/leave/overtime kayıtları
- **İzin** — talep, bakiye, geçmiş
- **Vardiya** — atanmış vardiya, takas talep et
- **Menü** — yemek planı, RSVP, puan ver
- **Duyuru** — yorum, okundu işareti
- **Gamification** — XP, level, streak, ödül mağazası, aylık market kredisi

### Yönetici / Admin tarafı
- **Canlı feed** — kim girdi/çıktı, geç kalanlar (real-time)
- **Vardiya planlama** — drag-drop haftalık plan, çakışma uyarısı
- **Mesai onay** — overtime kayıtlarını onayla, bordro CSV çıkar
- **İzin onay** — talep değerlendirme, kota yönetimi
- **Pending stamp approvals** — şüpheli check-in'leri manuel inceleme
- **Bulk Excel import** — çalışan / menü / izin toplu yükleme
- **Analytics** — heatmap (7×24), trend, top-late, departman karşılaştırma
- **Bordro CSV (3-1)** — attendance + izin + overtime tek dosyada
- **Audit export (KVKK)** — hash chain doğrulamalı tam event log

### Platform Admin (Damga sahibi)
- **Tüm org listesi** — kullanıcı, lokasyon, check-in metrikleri
- **Plan değiştirme** — free/starter/pro/business/enterprise
- **Billing katalog** — tier tanımları + fiyat + limit yönetimi
- **Kampanyalar** — indirim kodları
- **Service keys** — S2S API key üretme (Lokma vb. entegrasyon için)
- **Support tickets** — müşteri destek taleplerinin merkezi
- **Org başvuruları** — pending applications onay paneli
- **Dış Servisler** — Damga'nın kullandığı 3. taraf hizmetlerin (Hetzner, Cloudflare, Supabase, Resend...) merkezi yönetimi

### Entegrasyon / API
- **API key sistemi** — `dmg_live_xxx` (org owner) veya `dmg_svc_xxx` (platform admin)
- **Webhook** — outbound event push, HMAC V2 imza (Stripe pattern, replay-safe)
- **Rate limit** — per-key, in-memory, header bilgi (`X-RateLimit-*`)
- **Idempotency-Key** — POST/PUT/PATCH retry güvenliği, 24h cache
- **OpenAPI 3.0 spec** — Postman/Insomnia import edilebilir (`docs/openapi.yaml`)
- **External integrations** — org bazlı 3rd-party servis credentials (encrypted_secrets)

---

## 🚀 Kullanım

### Müşteri (yeni şirket)

**Yöntem 1 — Anında kayıt (self-signup):**
1. https://damga.deploi.net/auth/sign-up-org
2. Şirket adı + ad-soyad + email + şifre → form
3. KVKK + Kullanım Şartları onayı
4. Anında **owner** olarak giriş yaparsın, kendi şirket org'un açılır

**Yöntem 2 — Kurumsal başvuru:**
1. https://damga.deploi.net/apply-org
2. Form doldur (şirket adı, sektör, çalışan sayısı, owner şifresi)
3. Platform admin onaylar (~24 saat)
4. Onay sonrası belirlediğin şifre ile giriş

### Çalışan

1. Yöneticin sana **davet** gönderir veya manuel ekler
2. Email/şifre veya magic link ile giriş
3. Ana ekrandan **"Damga vur"** → NFC tap / QR scan / GPS ile check-in
4. Mobil PWA — telefonun ana ekranına eklenebilir

### Yönetici / Admin

1. Sol menüden ilgili modüle git
2. `/admin/locations` → lokasyon ekle → NFC tag veya QR kod oluştur
3. `/admin/team` → çalışan ekle, departman ata
4. `/admin/shifts` → vardiya planla
5. `/manager-workforce` → günlük pending onaylar
6. `/manager-reports` → bordro CSV indir

### Entegratör (API kullanıcısı)

```bash
# 1. Org-admin key üret (kendin için, kendi org'un)
curl -X POST https://api.damga.deploi.net/v1/api-keys \
  -H "Authorization: Bearer <supabase_jwt>" \
  -d '{"name":"erp-sync","scopes":["events:read","users:read"]}'

# 2. Kullanım — her istekte Bearer veya X-API-Key header
curl https://api.damga.deploi.net/v1/users \
  -H "Authorization: Bearer dmg_live_xxx..."

# 3. Webhook subscribe
curl -X POST https://api.damga.deploi.net/v1/webhooks \
  -H "Authorization: Bearer dmg_live_xxx" \
  -d '{"url":"https://erp.firma.com/webhooks/damga","events":["check_in.created"]}'
```

Detaylı entegrasyon rehberi: [`docs/api-readme.md`](./docs/api-readme.md)
Webhook imza doğrulama (Node/Python/PHP): [`docs/webhook-verify.md`](./docs/webhook-verify.md)
OpenAPI 3.0 spec: [`docs/openapi.yaml`](./docs/openapi.yaml)

---

## 🔧 Tech stack

| Katman | Teknoloji |
|---|---|
| **Frontend** | React 18 + Vite + TypeScript + React Query + Zustand + React Router + Tailwind + Lucide + Sonner |
| **Backend** | Express + TypeScript + Drizzle ORM + Zod + bcryptjs + web-push + Resend |
| **Mobile** | Capacitor (iOS + Android paketleme, henüz kurulmadı — PWA aktif) |
| **DB** | PostgreSQL 15 (Supabase, EU) — `public` schema, Drizzle migrations |
| **Auth** | Supabase Auth (JWT) + custom `requireAuth` middleware (`req.authOrgId` scope) |
| **QR scanner** | Native `BarcodeDetector` + jsQR fallback (5-10x hızlanma) |
| **Push** | web-push (VAPID), iOS native APNs gelecek |
| **Email** | Resend (transactional) |
| **Container** | Docker + Coolify (self-hosted PaaS) |
| **Sunucu** | Hetzner CX22 (EU, €4/ay) |
| **DNS/CDN** | Cloudflare Free tier |
| **Error tracking** | Sentry (`@sentry/react` + `@sentry/node`, KVKK uyumlu: PII off, header filtreli) |
| **Uptime monitoring** | UptimeRobot (web + `/v1/health`, 5dk interval) |
| **CI/CD** | GitHub Actions (typecheck + lint + build) + Coolify auto-deploy |

---

## 🧰 Lokal geliştirme

```bash
# 1) Bağımlılıklar
pnpm install

# 2) Lokal Postgres (Docker) — opsiyonel, prod Supabase'e direkt bağlanabilirsin
docker compose -f infra/docker-compose.yml up -d

# 3) .env oluştur
cp .env.example .env
# Lokal: DATABASE_URL=postgres://damga:damga@localhost:5433/damga
# Prod: Supabase connection string

# 4) Migration + seed
pnpm db:generate         # Drizzle migration üret
pnpm db:migrate          # DB'ye uygula (hash chain trigger dahil)
pnpm db:seed             # Örnek org + 3 user + 1 lokasyon

# 5) Tüm uygulamaları başlat
pnpm dev
```

- Web: http://localhost:5273
- API: http://localhost:4100/v1
- Postgres (lokal): postgres://damga:damga@localhost:5433/damga

### Workspace komutları

```bash
# Typecheck (tüm paketler)
pnpm -r typecheck

# Sadece bir paket
pnpm -F @damga/web typecheck
pnpm -F @damga/api typecheck
pnpm -F @damga/db typecheck

# Drizzle migration
pnpm -F @damga/db generate
pnpm -F @damga/db migrate

# Ad-hoc script (örn. RLS enable, platform_services seed)
pnpm -F @damga/db exec dotenv -e ../../.env -- tsx src/scripts/<script>.ts
```

---

## 🔐 Kritik prensipler

1. **Sunucu zamanı tek doğru** — istemci zamanı sadece anomali tespiti için
2. **Append-only** — `attendance_events` tablosunda UPDATE/DELETE trigger ile reddedilir
3. **Hash chain bütünlüğü** — her event önceki event'in SHA-256 hash'ini içerir
4. **Çoklu kanıt** — NFC + GPS + WiFi + Time + Device → trust score
5. **Çift taraflı görünürlük** — çalışan ve yönetici aynı ham veriyi görür
6. **API-first** — public REST API + webhook + service-to-service key
7. **KVKK önceliği** — IP maskelenir, 5 yıl retention (İş Kanunu m.75)
8. **Defense in depth** — uygulama katmanı org_id + DB katmanı RLS default-deny

### Trust score eşikleri

| Puan | Karar |
|---|---|
| ≥80 | Otomatik onay |
| 60-79 | Bayraklı kabul (admin'e bildirim) |
| <60 | Reddedildi |

---

## 🛡️ Güvenlik & KVKK

- **KVKK uyumlu** — Aydınlatma Metni (8 madde), Kullanım Şartları (10 madde), Gizlilik Politikası, Çerez Politikası
- **RLS default-deny** — Tüm `public.*` tablolarda enabled (anon REST API erişimi kapalı)
- **Audit log** — Her kritik aksiyon (auth, plan değişiklik, key üretme, vb.)
- **Hash chain** — Check-in kayıtları matematiksel olarak değiştirilemez
- **HTTPS TLS 1.3** — Cloudflare Edge SSL
- **bcrypt** — Şifreler hash'lenir, asla düz metin
- **Service role key** — Sadece backend, Coolify env'da, browser'da yok
- **2FA önerilir** — Tüm yönetici hesapları için (Hetzner, Cloudflare, Supabase, GitHub, Bitwarden)
- **Saklama:** 5 yıl (İş K. m.75)
- **Hak talepleri:** `kvkk@deploi.net` — 30 gün içinde yanıt

---

## 📁 Proje yapısı

```
damga/
├── apps/
│   ├── api/                  # Express backend (port 4100)
│   │   ├── src/
│   │   │   ├── config/       # env, logger, supabase client
│   │   │   ├── middleware/   # requireAuth, idempotency, error
│   │   │   ├── routes/       # auth, users, check-in, platform, vb.
│   │   │   ├── modules/      # webhook-delivery, hash chain
│   │   │   ├── lib/          # email, plan-limits, scheduler
│   │   │   └── scripts/      # send-test-email
│   │   └── Dockerfile
│   └── web/                  # Vite + React (port 5273)
│       ├── src/
│       │   ├── components/   # layout, qr-scanner, cookie-banner, vb.
│       │   ├── pages/        # sign-in, /platform, /admin/*, /manager/*
│       │   ├── hooks/        # use-auth, use-mobile-device
│       │   └── lib/          # api (axios), supabase, utils
│       └── Dockerfile
├── packages/
│   ├── db/                   # Drizzle schema + migrations + scripts
│   │   ├── src/schema/       # 14 schema dosyası
│   │   ├── src/migrations/   # 0000..0016 SQL dosyaları
│   │   └── src/scripts/      # enable-rls, setup-platform-services
│   ├── shared/               # Zod validators + ortak tipler
│   └── verification/         # Trust score, NFC/QR HMAC, Haversine, generateServiceKey
├── docs/                     # API rehberi + OpenAPI spec + webhook verify
├── infra/                    # docker-compose.yml (lokal Postgres)
└── README.md (bu dosya)
```

---

## 🌐 Production deploy (Coolify)

**Sunucu:** Hetzner CX22 (Ubuntu, EU, ~€4/ay)
**Orchestrator:** Coolify (self-hosted) — `coolify.deploi.net`
**Auto-deploy:** `git push origin main` → webhook → ~5 dk

| Container | Domain | Port |
|---|---|---|
| `damga-web` | `https://damga.deploi.net` | 5273 |
| `damga-api` | `https://api.damga.deploi.net` | 4100 |

Health endpoint: `https://api.damga.deploi.net/v1/health` — DB + Supabase + Resend + WebPush durumu

Deploy detay: [`DEPLOY.md`](./DEPLOY.md)

---

## 🗺️ Yol haritası

### ✅ Tamamlandı
- Multi-tenant SaaS (org_id scoping)
- Self-org-signup + apply-org (admin onaylı)
- Platform admin paneli (8 sekme)
- API entegrasyon paketi (S2S key, rate limit, webhook HMAC V2, idempotency, OpenAPI)
- Tier limit sistemi (free/starter/pro/business/enterprise)
- Legal sayfaları + cookie banner
- RLS default-deny (36 tablo)
- Email altyapısı (Resend)
- Dış Servisler yönetim UI
- **GitHub Actions CI** (typecheck + lint + build)
- **Sentry error tracking** (frontend + backend, @sentry/react + @sentry/node)
- **UptimeRobot monitoring** (web + api health, 5dk interval)

### 🟡 Plan dahilinde
- Stripe entegrasyonu (Iyzico stub yerine)
- Granüler RLS politikaları (per-table policy)
- Davet kodu sistemi
- Capacitor iOS/Android app
- APNs push notifications
- Mailbox kurulumu (Cloudflare Email Routing)
- UptimeRobot public status page yayınlama

### 🟢 Gelecek
- Lokma yeniden kurma (ayrı Supabase, API ile entegre)
- pg_dump otomatik haftalık yedek
- Vitest test coverage
- APM (application performance monitoring)

---

## 💼 Hedef sektörler

- 🍽️ Restoran & kafe zinciri (vardiyalı, multi-şube)
- 🚐 Lojistik & kargo (saha, GPS, sürücü)
- 🏭 Üretim & fabrika (NFC kapı, vardiyalı işçi)
- 🛍️ Perakende mağaza (parttime, multi-lokasyon)
- 🏢 Holding & kurumsal (departman, izin onay zinciri)
- 🛎️ Hizmet & AVM (esnek vardiya, bordro)

---

## 💰 Plan tarifeleri (TRY/ay)

| Plan | Kullanıcı | Lokasyon | API/webhook | Fiyat |
|---|---|---|---|---|
| **Free** | 3 | 1 | — | ₺0 |
| **Starter** | 10 | 2 | 1 | ₺99 |
| **Pro** | 25 | 5 | 3 | ₺299 |
| **Business** | 100 | 20 | 10 | ₺899 |
| **Enterprise** | Sınırsız | Sınırsız | Sınırsız | Görüş |

> Şu an **ücretsiz dönem** — gelir hedefi başladığında Stripe entegrasyonu açılır.

---

## 📧 İletişim

- 🛠️ **Destek:** [destek@deploi.net](mailto:destek@deploi.net)
- 📜 **KVKK / yasal:** [kvkk@deploi.net](mailto:kvkk@deploi.net)
- 🌐 **Genel:** [damga@deploi.net](mailto:damga@deploi.net)

---

## 📜 Lisans

Tescilli / kapalı kaynak. © 2026 Kaan Kılıç. Tüm hakları saklıdır.

Bu repo özel kullanım içindir; klonlama, türevi alma veya yeniden dağıtım yapma izni yoktur.

---

## 🙏 Teşekkür

Damga, modern web teknolojilerine kıymet veren açık kaynak projelerinin omuzlarında yükselir: React, Vite, Drizzle ORM, Supabase, Express, Tailwind, Lucide ve daha fazlası. Hepsine teşekkürler.

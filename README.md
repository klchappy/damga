# Damga

> **Şeffaf işyeri yoklama platformu.** NFC, QR, GPS, WiFi ve cihaz parmak izinden hesaplanan dürüstlük skoruyla doğrulanan, hash-zincirli denetim izine sahip, KVKK uyumlu multi-tenant SaaS.

**Production:** [damga.deploi.net](https://damga.deploi.net) · **API:** `api.damga.deploi.net/v1` · **Status:** [/status](https://damga.deploi.net/status)

[![CI](https://img.shields.io/github/actions/workflow/status/klchappy/damga/ci.yml?branch=main)](https://github.com/klchappy/damga/actions)
![Tests](https://img.shields.io/badge/tests-41%20passing-success)
![License](https://img.shields.io/badge/license-Proprietary-red)

---

## Tek cümleyle ne yapar?

Çalışanlar telefonlarını lokasyondaki NFC etiketine yaklaştırır veya QR'ı okutur; Damga 6 sinyali (NFC + QR + GPS + WiFi + cihaz fingerprint + zaman) birleştirip 0-100 arası **dürüstlük skoru** üretir, olayı hash-zincirli denetim izine yazar. Geriye dönük müdahale matematiksel olarak imkânsız.

---

## Hangi sektörlerde kullanılır?

🍽️ Restoran zincirleri · 🚐 Lojistik & kargo · 🏭 Üretim & fabrika · 🛍️ Perakende · 🏢 Holding & kurumsal · 🛎️ Hizmet & AVM

---

## 🏗️ Mimari

```
┌─────────────────────────────────────────────────────────────┐
│  Cloudflare (proxy, WAF, edge, HSTS, CSP)                   │
└──────────────────────────────┬──────────────────────────────┘
                               │
       ┌───────────────────────┴──────────────────────┐
       ▼                                              ▼
┌──────────────┐                              ┌──────────────┐
│  damga-web   │                              │  damga-api   │
│  React+Vite  │   /v1                        │  Node+Express│
│  PWA + nginx │ ─────► api.damga.deploi.net  │  TypeScript  │
└──────────────┘                              └──────┬───────┘
       │                                             │
       │                          ┌──────────────────┼──────────────────┐
       │                          ▼                  ▼                  ▼
       │                  ┌──────────────┐  ┌──────────────┐    ┌──────────────┐
       │                  │  Supabase    │  │  BullMQ +    │    │  Sentry      │
       │                  │  Postgres15  │  │  Redis       │    │  + PostHog   │
       │                  │  + Auth      │  │  (cron jobs) │    │  + Status    │
       │                  │  + Storage   │  └──────────────┘    └──────────────┘
       │                  │  EU/Frankfurt│
       │                  │  RLS deny    │
       │                  └──────────────┘
       │
       │  Hetzner CX22 + Coolify (self-hosted PaaS)
       │  + pg_dump cron → Backblaze B2 backup
       └────────────────────────────────────────────────────────────
```

---

## 🔧 Tech Stack

| Katman | Teknoloji |
|---|---|
| **Frontend** | React 18 + Vite + TypeScript + React Query + Zustand + React Router + Tailwind + Lucide + Sonner |
| **Backend** | Express + TypeScript + Drizzle ORM + Zod + bcryptjs + web-push + Resend |
| **Mobile** | PWA aktif · Capacitor wrapper hazır (Android/iOS Play Store deployment bekleniyor) |
| **DB** | PostgreSQL 15 (Supabase EU/Frankfurt) — `public` schema, Drizzle migrations, RLS default-deny (36 tablo) |
| **Auth** | Supabase Auth JWT + 2FA TOTP + custom `requireAuth` middleware + 3 auth tipi |
| **Job queue** | BullMQ + Redis (multi-instance safe) → REDIS_URL set olunca otomatik aktif, yoksa in-process fallback |
| **QR scanner** | Native `BarcodeDetector` + jsQR fallback (5-10x hızlı) |
| **Push** | web-push (VAPID) — iOS native APNs gelecek |
| **Image** | sharp + WebP optimize (5MB JPEG → ~150 KB WebP, 25-50x küçülme) |
| **Email** | Resend (transactional) + Svix-signed webhook (bounce/complaint tracking) |
| **Analytics** | PostHog (EU host, KVKK uyumlu, autocapture OFF, identify SADECE user_id) |
| **Error tracking** | Sentry (frontend + backend, KVKK filtreli) + custom spans + node profiling |
| **Container** | Docker + Coolify (self-hosted PaaS) |
| **Sunucu** | Hetzner CX22 (EU, €4/ay) |
| **DNS/CDN** | Cloudflare Free tier (proxy, WAF, HSTS, TLS 1.2 min) |
| **Uptime** | Self-hosted (`monitor_pings` tablo, 5dk interval, 90 gün retention) + `/status` public page |
| **CI/CD** | GitHub Actions (typecheck + build + 41 test) + Dependabot haftalık + Coolify auto-deploy |
| **Lint** | ESLint v10 flat config + Prettier + TypeScript strict |
| **Backup** | pg_dump cron + rclone B2 upload + age şifreleme + restore script + DR runbook |
| **Secrets** | Bitwarden vault ("Damga Sistem Envanteri") |

---

## 📁 Proje Yapısı

```
damga/
├── apps/
│   ├── api/                    # Express + TypeScript backend
│   │   ├── src/
│   │   │   ├── config/         # env, logger, constants (production tuning)
│   │   │   ├── lib/            # business logic helper'ları
│   │   │   │   ├── account-cleanup.ts       # KVKK anonymize cron
│   │   │   │   ├── account-lockout.ts       # Kullanıcı-bazlı brute force koruma
│   │   │   │   ├── attendance-helpers.ts    # check-in yardımcıları
│   │   │   │   ├── feature-flags.ts         # In-app feature flag evaluator
│   │   │   │   ├── health-monitor.ts        # Self-hosted uptime ping
│   │   │   │   ├── notifications.ts         # In-app + Web Push
│   │   │   │   ├── queue.ts + redis.ts      # BullMQ distributed cron
│   │   │   │   ├── scheduler.ts             # Leaderboard finalize (haftalık/aylık)
│   │   │   │   ├── sentry.ts                # APM custom span helper'ları
│   │   │   │   └── storage.ts               # Supabase Storage + sharp WebP optimize
│   │   │   ├── routes/         # ~30 router (auth, check-in, kiosk-stamp, ...)
│   │   │   ├── middleware/     # auth, error, idempotency, rate-limit
│   │   │   └── modules/        # webhook-delivery, ...
│   │   ├── tests/              # 41 Vitest test
│   │   └── vitest.config.ts
│   │
│   ├── web/                    # React + Vite frontend
│   │   ├── src/
│   │   │   ├── pages/          # 45+ sayfa (landing, sign-in, kiosk, onboarding, ...)
│   │   │   ├── components/     # AccountDeletion, MyStampBadge, TwoFactorAuth, ...
│   │   │   ├── hooks/          # use-auth, use-feature-flag, use-geolocation
│   │   │   ├── i18n/           # TR (varsayılan) + EN (iskelet)
│   │   │   ├── lib/            # api, analytics (PostHog), sentry, supabase, env
│   │   │   └── main.tsx
│   │   ├── public/             # robots.txt, sitemap.xml, .well-known/security.txt
│   │   └── nginx.conf          # HSTS + CSP enforce + Permissions-Policy
│   │
│   └── mobile/                 # Capacitor wrapper (Android/iOS, deploy pending)
│
├── packages/
│   ├── db/
│   │   ├── src/
│   │   │   ├── schema/         # 45+ Drizzle schema (orgs, users, attendance_events, ...)
│   │   │   ├── scripts/        # Setup + migration script'leri
│   │   │   └── migrations/     # Drizzle generate çıktıları
│   │   └── drizzle.config.ts
│   ├── shared/                 # Type'lar, Zod schema, sabitler (apps arası)
│   └── verification/           # Trust score + hash chain + NFC/QR HMAC
│
├── infra/
│   ├── backup/
│   │   ├── pg_dump_damga.sh    # Günlük backup (Coolify scheduled task)
│   │   ├── pg_restore_damga.sh # Interactive restore
│   │   └── README.md           # DR runbook
│   └── docker-compose.yml      # Lokal Postgres
│
├── docs/                       # Mintlify docs site (docs.damga.deploi.net hazır)
│   ├── mint.json
│   ├── introduction.mdx
│   ├── quickstart.mdx
│   ├── kiosk-mode.mdx
│   └── security/
│
├── .github/
│   ├── workflows/ci.yml        # GitHub Actions (typecheck + lint + build + test)
│   └── dependabot.yml          # Haftalık paket taraması (Pazartesi 06:00)
│
├── README.md                   # Bu dosya
├── RUNBOOK.md                  # 5 acil durum prosedürü + SLO + postmortem
├── SCALING.md                  # 50→1000+ müşteri yolculuğu rehberi
├── DEPLOY.md                   # Coolify deployment
├── eslint.config.js            # ESLint v10 flat config
├── .prettierrc.json
└── pnpm-workspace.yaml
```

---

## ⚡ Modüller (Özellik Bazlı)

### Yoklama (check-in/out)
- **NFC + QR + GPS + WiFi + Cihaz** sinyalleri (6'sı birden trust score'a girer)
- **Hash-zincirli audit:** her olay önceki olayın SHA-256'sıyla imzalanır
- **Trust score 0-100** + anomali flag'leri + selfie fallback (out-of-geofence durumunda)
- **Velocity koruma** (aynı kullanıcı 30 sn'de ikinci damga atamaz)
- **Vardiya bazlı late penalty** (kullanıcının atanmış vardiyasına göre XP ceza/bonus)
- **Otomatik check-in/out:** kullanıcının bugünkü son olayına göre sistem karar verir

### Kiosk modu (paylaşımlı tablet) 🆕
- Her çalışanın **kişisel QR kartı** (24 karakter Crockford Base32, bcrypt hash DB'de)
- Lokasyona tablet bırak → manager logged-in → çalışanlar kartlarını gösterir
- `POST /v1/kiosk-stamp` endpoint'i — operatör değil **kart sahibi** adına damga atılır
- Audit: kiosk_operator_id metadata'da saklanır

### Vardiya yönetimi
- Template + assignment + override (kişiye özel saat)
- Vardiya takası (shift swap) akışı
- Mesai (overtime) otomatik tespit + manager onay

### İzin yönetimi
- Çalışan talep → manager/admin onay zinciri
- Yıllık izin kotası (cron ile 1 Ocak'ta sıfırlanır)
- Excel toplu import (`/admin/leaves/bulk`)

### Gamification
- XP + level + streak + shield
- Haftalık ilk-3 (Pazartesi 09:00 finalize, BullMQ veya in-process cron)
- Aylık ilk-3 + monthly market credit (özel ödüller, 7 gün geçerli)

### KVKK + güvenlik
- Self-serve hesap silme (30 gün grace → anonymize → 60 gün audit → hard delete)
- 2FA TOTP (Supabase MFA + sign-in challenge)
- Account lockout (5 fail → 15 dk kilit, kullanıcı-bazlı)
- Hash chain audit + verify function
- Admin MFA reset (kullanıcı cihaz kaybederse)
- CSP enforce + HSTS 180g + Helmet
- Per-IP + per-API-key rate limit
- RLS default-deny (36 tablo)

### API & entegrasyon
- 3 auth tipi: **Supabase JWT** (kullanıcı), **dmg_live_** (org-admin), **dmg_svc_** (servis-servis)
- Webhook HMAC v2 (Stripe-style timestamp+body signature)
- Idempotency keys (Postgres tablosu, 24h TTL)
- ~110 endpoint, OpenAPI spec

### Operasyonel
- Sentry error tracking + node profiling (%50 trace sample)
- Self-hosted uptime monitoring + public status page
- PostHog analytics (KVKK uyumlu, EU host)
- Resend webhook (bounce/complaint takibi)
- Real-time admin notification (her damgada toast + ses, 10sn poll)
- Onboarding wizard (yeni owner için 3 adım)
- Backup cron + restore + DR runbook
- BullMQ distributed cron (multi-instance safe)
- Feature flags (in-app, gated rollout, percentage targeting)

---

## 🚀 Hızlı Başlangıç (lokal dev)

```bash
# 1. Bağımlılıklar
pnpm install

# 2. Lokal Postgres (Docker)
docker compose -f infra/docker-compose.yml up -d

# 3. .env oluştur
cp .env.example .env
# Lokal: DATABASE_URL=postgres://damga:damga@localhost:5433/damga
# Prod: Supabase connection string

# 4. Migration + seed
pnpm db:generate         # Drizzle migration üret
pnpm db:migrate          # DB'ye uygula
pnpm db:seed             # Örnek org + 3 user + 1 lokasyon

# 5. Tümünü başlat
pnpm dev
```

- Web: http://localhost:5273
- API: http://localhost:4100/v1
- Postgres: postgres://damga:damga@localhost:5433/damga

### Workspace komutları

```bash
pnpm -r typecheck                # Tüm paketler
pnpm -F @damga/web typecheck     # Tek paket
pnpm -F @damga/api test          # 41 test
pnpm -F @damga/api lint          # ESLint
pnpm format                      # Prettier
```

---

## 🚢 Deployment

**Production:** Coolify auto-deploy ile her `main` push'unda 3-5 dk içinde canlıya düşer.

Detay: [DEPLOY.md](./DEPLOY.md)

### Manuel deploy
```bash
git push origin main
# Coolify webhook tetikler → build → deploy
# Doğrulama: curl https://api.damga.deploi.net/v1/health → "sentry": true
```

---

## 📚 Dokümantasyon

| Dosya | İçerik |
|---|---|
| **README.md** | Bu dosya — genel bakış, mimari, modüller |
| **[RUNBOOK.md](./RUNBOOK.md)** | Operasyonel rehber: 5 acil durum prosedürü, SLO, postmortem template |
| **[SCALING.md](./SCALING.md)** | Production scaling: 50 → 1000+ müşteri yolculuğu, multi-instance, DB partitioning |
| **[DEPLOY.md](./DEPLOY.md)** | Coolify deployment + Hetzner setup |
| **[infra/backup/README.md](./infra/backup/README.md)** | Backup + DR (Backblaze B2, age encryption, restore prosedürü) |
| **[docs/](./docs)** | Mintlify public docs site — kullanıcı + developer kılavuzları |

---

## 🧪 Test + CI

```bash
pnpm -F @damga/api test
# Test Files  7 passed (7)
# Tests       41 passed (41)
# Duration    ~2 saniye
```

- **GitHub Actions:** typecheck + build her push'ta
- **Dependabot:** haftalık (Pazartesi 06:00 TR) — npm + Docker + GitHub Actions
- **Lint:** ESLint v10 flat config (0 error, 12 warning)

---

## 💰 Plan Tarifeleri (TRY/ay, KDV hariç)

| Plan | Kullanıcı | Lokasyon | API/Webhook | Fiyat |
|---|---|---|---|---|
| **Free** | 3 | 1 | — | ₺0 |
| **Starter** | 10 | 2 | 1 | ₺99 |
| **Pro** | 25 | 5 | 3 | ₺299 |
| **Business** | 100 | 20 | 10 | ₺899 |
| **Enterprise** | Sınırsız | Sınırsız | Sınırsız | Custom |

> Iyzico subscription production henüz aktif değil — şu an manuel fatura ile beta lansman.

---

## 🗺️ Yol Haritası

### ✅ Tamamlandı (production'da)
- Multi-tenant SaaS + RLS default-deny
- 3 auth tipi (JWT + org-admin + service key)
- Hash-zincirli audit + trust score
- KVKK self-serve silme + 2FA TOTP + account lockout
- **Kişisel QR + Kiosk modu** (multi-user paylaşımlı tablet)
- Onboarding wizard + real-time admin notification
- Public marketing landing + SEO + sitemap
- Self-hosted uptime monitoring + public `/status`
- Backup script + DR runbook
- Sentry + PostHog (KVKK uyumlu)
- Resend webhook (email delivery monitoring)
- BullMQ + Redis distributed queue (multi-instance ready)
- DB partitioning prep + 9 performance index + 4 analytics view
- Feature flags + APM custom spans
- ESLint + Prettier + 41 Vitest test
- Mintlify docs site iskelet
- i18n iskelet (TR + EN)

### 🟡 Sıradaki (1-2 ay)
- Iyzico subscription production (gelir akışı)
- e-Fatura entegrasyonu (Paraşüt önerilen)
- DPA template (kurumsal müşteri için)
- VERBİS tescili (sen yapacaksın, yasal)
- PostHog hesap + key
- Backup Backblaze B2 hesap + Coolify cron

### 🟢 Plan dahilinde (3-6 ay)
- Capacitor Android (Play Store iç test)
- Capacitor iOS (App Store)
- APNs/FCM native push
- SSO (Google/Microsoft OAuth)
- DPA + SOC2 Type 1 yol haritası
- 100+ müşteride DB partitioning migration
- 250+ müşteride multi-instance API deployment

---

## 🛡️ Güvenlik

Bir güvenlik açığı bulduysanız: **guvenlik@deploi.net** ([security.txt](https://damga.deploi.net/.well-known/security.txt))

Sorumlu açıklama ilkesine uyuyoruz, 7 iş günü içinde dönüş garantisi.

---

## 📊 Production Metrikleri (canlı)

- **Health:** [`api.damga.deploi.net/v1/health`](https://api.damga.deploi.net/v1/health)
- **Status sayfası:** [`damga.deploi.net/status`](https://damga.deploi.net/status)
- **Uptime hedefi:** 99.5% / ay
- **RPO:** ≤24 saat · **RTO:** ≤30 dakika

---

## 📞 İletişim

- **Destek:** destek@deploi.net
- **Satış:** satis@deploi.net
- **KVKK / veri:** kvkk@deploi.net
- **Güvenlik:** guvenlik@deploi.net

---

## License

Proprietary © 2026 Damga / Deploi. Tüm hakları saklıdır.

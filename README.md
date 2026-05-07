# Damga

> Şeffaf işyeri yoklama platformu — NFC + QR + GPS doğrulamalı, hash chain'li, append-only.

TahminIO ile tamamen bağımsız çalışan ayrı bir uygulama. Domain: `damga.deploi.net` + `api.damga.deploi.net`.

## Hızlı başlangıç (lokal dev)

```bash
# 1) Bağımlılıklar
pnpm install

# 2) Lokal Postgres (Docker)
docker compose -f infra/docker-compose.yml up -d

# 3) .env oluştur
cp .env.example .env
# Lokal Postgres için DATABASE_URL'yi olduğu gibi bırakabilirsin:
#   DATABASE_URL=postgres://damga:damga@localhost:5433/damga

# 4) Migration + seed
pnpm db:generate     # Drizzle migration üret
pnpm db:migrate      # DB'ye uygula (hash chain trigger dahil)
pnpm db:seed         # Örnek org + 3 user + 1 lokasyon

# 5) Tüm uygulamaları başlat
pnpm dev
```

- Web: http://localhost:5273
- API: http://localhost:4100/v1

## Stack

| Katman | Teknoloji |
|---|---|
| Frontend | React 18 + Vite + TS + Tailwind |
| Backend | Express + TypeScript + Drizzle ORM |
| DB | PostgreSQL 16 (Supabase production) |
| Auth | Supabase Auth (magic link + password) |
| Doğrulama | NFC (Web NFC API), QR (zxing-js), GPS (navigator.geolocation) |
| Hash chain | PostgreSQL pgcrypto + trigger |

## Kritik prensipler

1. **Sunucu zamanı tek doğru** — istemci zamanı sadece anomali tespiti için
2. **Append-only** — `attendance_events` tablosunda UPDATE/DELETE trigger ile reddedilir
3. **Hash chain bütünlüğü** — her event önceki event'in SHA-256 hash'ini içerir
4. **Çoklu kanıt** — NFC + GPS + WiFi + Time + Device → trust score
5. **Çift taraflı görünürlük** — çalışan ve yönetici aynı ham veriyi görür
6. **API-first** — public REST API + webhook (Faz 8'de SDK)
7. **KVKK önceliği** — IP maskelenir, retention 5 yıl

## Trust score eşikleri

| Puan | Karar |
|---|---|
| ≥80 | Otomatik onay |
| 60-79 | Bayraklı kabul (admin'e bildirim) |
| <60 | Reddedildi |

## Yapı

```
damga/
├── apps/
│   ├── api/        # Express backend (port 4100)
│   └── web/        # Vite + React (port 5273)
├── packages/
│   ├── db/         # Drizzle schema + migration + seed
│   ├── shared/     # Zod validators + ortak tipler
│   └── verification/  # Trust score + NFC/QR HMAC + Haversine
└── infra/
    └── docker-compose.yml  # Lokal Postgres
```

## NFC / QR test akışı

1. **Admin**: `/admin/locations` → "Yeni Lokasyon" oluştur
2. Lokasyon kartından **"NFC Tag Oluştur"** veya **"QR Kod Oluştur"**
3. NFC: oluşan payload'ı **NFC Tools** mobil uygulamasıyla bir tag'a yaz
4. QR: oluşan payload'ı QR koda dönüştürüp duvara astır
5. **Çalışan** ana ekrandan "Damga vur" → NFC tap veya QR tara → otomatik check-in

## Ports (TahminIO ile çakışma yok)

| Servis | TahminIO | Damga |
|---|---|---|
| Web | 5173 | **5273** |
| API | 4000 | **4100** |
| Postgres (lokal) | — | **5433** |

## Deploy (Coolify)

`apps/web/Dockerfile` ve `apps/api/Dockerfile` Coolify-ready:
- `damga-web` → domain `https://damga.deploi.net`
- `damga-api` → domain `https://api.damga.deploi.net`
- Healthcheck: `/healthz` (web) ve `/v1/health/healthz` (api)
- Auto-deploy: GitHub webhook bağlanmalı

Detay: `DEPLOY.md`

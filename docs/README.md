# Damga Documentation

Bu klasör Damga'nın public docs sitesini oluşturur.

## Geliştirme (lokal preview)

```bash
# Mintlify CLI kur
npm i -g mintlify

# docs klasöründe
cd docs
mintlify dev
# http://localhost:3000 — canlı preview
```

## Deployment

### Seçenek A: Mintlify Cloud (önerilen, ücretsiz)

1. https://dashboard.mintlify.com/signup → GitHub ile bağlan
2. "Add deployment" → `klchappy/damga` repo'su seç → root: `/docs`
3. Custom domain: `docs.damga.deploi.net`
4. Cloudflare DNS:
   - CNAME `docs.damga.deploi.net` → `docs.mintlify.com`
   - Proxy: orange cloud
5. Push edince auto-deploy

### Seçenek B: Coolify self-host

1. `docs/Dockerfile` ekle:
   ```dockerfile
   FROM node:22-alpine
   RUN npm i -g mintlify
   WORKDIR /docs
   COPY . .
   EXPOSE 3000
   CMD ["mintlify", "dev", "--port", "3000"]
   ```
2. Coolify > Damga > New Application > Dockerfile > /docs
3. Domain: docs.damga.deploi.net

## Yapı

```
docs/
├── mint.json              # Mintlify config (navigation, branding)
├── introduction.mdx       # Ana sayfa
├── quickstart.mdx         # Hızlı başlangıç
├── kiosk-mode.mdx         # Kiosk modu
├── personal-qr.mdx        # Kişisel QR
├── admin/                 # Yönetici rehberleri
│   ├── onboarding.mdx
│   ├── team-management.mdx
│   ├── shifts.mdx
│   └── reports.mdx
├── api-reference/         # API entegrasyonu
│   ├── intro.mdx
│   ├── auth.mdx
│   ├── rate-limits.mdx
│   ├── idempotency.mdx
│   └── webhooks.mdx
├── security/              # Güvenlik
│   ├── overview.mdx
│   ├── 2fa.mdx
│   ├── hash-chain.mdx
│   └── kvkk.mdx
└── api-readme.md          # Eski monolithic API rehberi (legacy)
```

## Yapılacak

Şu sayfalar henüz placeholder veya yazılmadı:
- `admin/onboarding.mdx`
- `admin/team-management.mdx`
- `admin/shifts.mdx`
- `admin/reports.mdx`
- `api-reference/auth.mdx` (api-readme.md'den parçala)
- `api-reference/rate-limits.mdx`
- `api-reference/idempotency.mdx`
- `api-reference/webhooks.mdx` (webhook-verify.md'den genişlet)
- `security/hash-chain.mdx`
- `personal-qr.mdx`

Yazıldıkça `mint.json`'daki navigation otomatik gösterir.

## Mevcut markdown'lar

`api-readme.md` ve `webhook-verify.md` dosyaları Mintlify-uyumlu **olmayan** eski monolithic dokümanlar. Mintlify build'lerinde dahil edilmez (sadece referans).

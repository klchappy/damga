# Damga Güvenlik Yol Haritası

> Son güncelleme: 2026-05-14
> Kaynak: Cross-project audit + 2 paralel Explore agent (auth+permissions, multi-tenant+RLS) + npm audit + production header check

## Bugün düzeltilen (commit `e90c86b`)

| # | Bulgu | Severity | Fix |
|---|---|---|---|
| 1 | `GET /v1/webhooks/resend/stats` anonim — TÜM org'ların metrikleri açık | HIGH | requireAuth + admin/owner + org_id filter |
| 2 | Selfie path random 41-bit entropy | HIGH | crypto.randomBytes(16) → 128-bit + getSignedSelfieUrl helper |
| 3 | Owner kendi rolünü düşürebiliyor — self-lockout | HIGH | Son owner self-demote + admin/owner self-deactivate engellendi |
| 4 | NFC_SIGNING_SECRET default değerde prod'a deploy olabilir | HIGH | process.exit(1) fail-fast + JWT secret zorunlu |
| 5 | CORS `*.deploi.net` wildcard — subdomain takeover riski | MEDIUM | Explicit allow-list + Capacitor scheme'ler |
| 6 | Bulk leave email lookup DB-level org filter yok | MEDIUM | WHERE org_id + explicit user_id org check |
| 7 | Notifications helper'ları sadece user_id filter | MEDIUM | orgId zorunlu parametre (defense-in-depth) |

---

## TODO — Acil (önümüzdeki 2 hafta)

### [ ] CRITICAL: Hash Chain Race Condition
**Yer:** `packages/db/src/migrations/custom/01-hash-chain-trigger.sql`
**Sorun:** PG trigger `ORDER BY server_time DESC LIMIT 1` ile önceki event'i çekerken aynı org'da iki concurrent INSERT READ COMMITTED isolation altında ikisi de aynı `previous_event_hash` alabilir → zincir bozulur.
**Exploit:** Tek user için 100ms içinde 2 damga = potansiyel hash duplikasyonu.
**Fix:**
1. Trigger içinde `pg_advisory_xact_lock(hashtext(NEW.org_id::text)::bigint)` — aynı org'un INSERT'lerini serialize eder, performans en az etkilenir
2. Alternatif: app-level retry — INSERT sonrası this_event_hash duplicate kontrolü, yenile-tekrar
3. Stress test: 1000 paralel check-in scenario'yu replay et
**Süre:** 4 saat

### [ ] MEDIUM: Web Nginx Security Headers Production'da Eksik
**Yer:** `apps/web/nginx.conf` (config doğru, deploy layer'ı strip ediyor)
**Sorun:** HSTS + CSP + X-Frame-Options nginx.conf'ta var, ama `curl -I https://damga.deploi.net/` döndürmüyor. Coolify Traefik proxy strip ediyor olabilir.
**Fix:**
1. Coolify panel → damga-web → Proxy settings → header passthrough kontrol
2. Veya direkt nginx'i bypass etmeden header forward et
3. Verify: curl response headers tam set
**Süre:** 1 saat

---

## TODO — Yakın (1 ay)

### [ ] HIGH: Multi-Instance Rate Limit (Redis)
**Yer:** `middleware/auth.ts:25` in-memory `Map<string, RateSlot>`
**Sorun:** Multi-instance deploy'da saldırgan instance'lar arası request dağıtarak limit'i bypass edebilir.
**Bağımlı:** Multi-instance'a geçmeden gerekmez. Müşteri 100+ olunca (Coolify replicas: 3) lazım.
**Fix:** `rate-limit-redis` paketi + Upstash bağlantısı (zaten infra'da)
**Süre:** 2 saat

### [ ] MEDIUM: Sentry Stack Trace + Path Sanitization
**Yer:** `middleware/error.ts:38` + `lib/sentry.ts beforeSend`
**Sorun:** Error stack trace + internal path Sentry'ye gider.
**Fix:** beforeSend hook'ta event.exception.values[].stacktrace.frames'i filtrele (internal paths kırp)
**Süre:** 1 saat

### [ ] Hetzner snapshot rutini
Aylık otomatik snapshot (~₺5/ay). Manuel adımlar: Hetzner Cloud panel → CX22 → Snapshots → Create.

---

## TODO — Orta vade (3 ay)

### [ ] HIGH: Velocity Check Kiosk Bypass
**Yer:** `routes/check-in.ts:89` `enforceVelocityLimit(req.authUserId)`
**Sorun:** Kiosk mode'da operator'ın velocity limit'i kullanılır, target user'ın değil. Manager kiosk'tan hızla birden fazla çalışanın damgasını vurabilir.
**Bağımlı:** Kiosk müşterileri arttığında acil.
**Fix:** Kiosk request'lerinde `targetUser.id` üzerinden velocity check
**Süre:** 3 saat (test dahil)

### [ ] MEDIUM: Selfie Bucket Private + Signed URL Migration
**Yer:** `lib/storage.ts` `damga-selfies` bucket
**Sorun:** Bucket public — şu an 128-bit entropy ile cross-org brute-force imkansız, ama URL leak'leri permanent.
**Fix:** Bucket'ı private yap → `getSignedSelfieUrl()` (helper hazır) → tüm selfie_url servis eden endpoint'lere uygula → DB'de `selfie_path` field'ı eklenip eski URL'lerden path extract edilebilir
**Süre:** 6 saat (migration dahil)

### [ ] CSP Nonce-Based (unsafe-inline kaldır)
**Yer:** `apps/web/nginx.conf` CSP `script-src 'unsafe-inline' 'unsafe-eval'`
**Sorun:** Sentry/Vite uyumu için zorunlu, ama daraltılmalı.
**Fix:** Nonce inject + Sentry SDK uyum testi
**Süre:** 4 saat

---

## TODO — Uzun vade (6-12 ay)

### [ ] VERBİS tescili tamamlama (yasal zorunlu)
verbis.kvkk.gov.tr'den başvuru. ~2 saat.

### [ ] SOC2 Type 1 hazırlık
Vanta veya Drata ile compliance dashboard. $50K+ deal müşterileri için. ~6 ay observation + auditor $15-30K.

### [ ] DB Partitioning Aktive
`attendance_events` 100K+ satır geçince. Plan zaten `packages/db/src/scripts/partition-attendance-events.md`'de.

### [ ] Read Replica (Supabase Pro+)
Raporlar/analytics primary'yi yormasın diye. Drizzle: `db.execute(sql..., { readonly: true })`.

---

## Mevcut güvenlik durumu (güçlü yönler)

| Katman | Durum |
|---|---|
| JWT auth (Supabase service_role, 5dk cache) | ✓ |
| RLS default-deny (tüm public tablolar) | ✓ |
| org_id scoping (%100 endpoint coverage post-fix) | ✓ |
| Hash chain trigger (append-only, evidence_hash + this_event_hash) | ✓ (race condition risk dışında) |
| NFC HMAC (32+ char, timing-safe, prod fail-fast) | ✓ |
| Idempotency (Resend svix-id unique, attendance idempotency_keys) | ✓ |
| Account lockout (5 fail → 15dk, DB-based multi-instance safe) | ✓ |
| Bcrypt + constant-time API key compare | ✓ |
| KVKK self-serve delete (30 gün grace + anonymize) | ✓ |
| HSTS + helmet headers (API tarafında) | ✓ |
| Supabase project izolasyonu (Damga ayrı ref) | ✓ |
| Resend domain izolasyonu (özel API key + DKIM verified) | ✓ |
| Sentry PII filter (auth header, cookie, svix-sig strip) | ✓ |
| npm audit: 0 known vulns | ✓ |

---

## Bulgu istatistikleri

| Severity | Fixed | Roadmap'e | Toplam |
|---|---|---|---|
| CRITICAL | 0 | 1 (hash chain) | 1 |
| HIGH | 4 | 2 (rate limit, velocity) | 6 |
| MEDIUM | 3 | 2 (sentry, nginx) | 5 |
| LOW | 0 | 0 | 0 |
| **Toplam** | **7** | **5** | **12** |

Damga'nın temel mimarisi güvenli. Bulduğum sorunlar implementation-level edge case'ler. Erken-aşama SaaS'lar için neredeyse hiçbiri bu seviyede değil — Damga ortalamanın çok üstünde.

CRITICAL hash chain race condition önümüzdeki 2 hafta içinde mutlaka kapatılmalı — Damga'nın iddiası "manipüle edilemez audit log", race condition bu iddiayı potansiyel olarak çürütüyor.

# Damga Production Scaling Rehberi

> Şu anki kapasite: **1 instance, 50-100 müşteri için yeterli**
> Bu rehber: 100 → 1000+ müşteri yolculuğu

---

## Mevcut altyapı (baseline)

```
Cloudflare (proxy, WAF, edge cache)
    │
    ▼
Hetzner CX22 (€4/ay)
├── damga-web (nginx + SPA, ~50 MB RAM)
├── damga-api (Node 22, ~150 MB RAM)
└── Coolify (orchestrator, ~200 MB RAM)
    │
    ▼
Supabase EU/Frankfurt (Free tier)
├── Postgres 15 (1 GB storage limit)
├── Auth + Storage (1 GB)
└── pgBouncer connection pool (60 max)
```

**Kapasite:** ~50 aktif org, ~1000 user, ~10K stamp/gün

---

## Scaling thresholds + ne yapmalı

### 50 müşteri (~$2-5K MRR)

✅ **Hiçbir değişiklik gerekmez.** Mevcut altyapı yeterli.

İzlemen gerekenler:
- Hetzner CX22 CPU avg < %50
- Supabase DB size < 500 MB
- Sentry hata oranı < %0.5

### 100 müşteri (~$5-15K MRR) — ŞU AN HAZIRLIK YAPTIK

**Yapılması gereken:**

1. **Redis aktif et** (Upstash free tier veya self-hosted)
   ```bash
   # Upstash: https://upstash.com/ → Create database (EU region)
   # Coolify env: REDIS_URL=rediss://default:xxx@xxx.upstash.io:6379
   ```
   → Otomatik BullMQ devreye girer (Batch 25'te hazırlandı)

2. **Supabase Pro upgrade** ($25/ay)
   - PITR (Point-In-Time Recovery)
   - 8 GB database
   - 250 GB bandwidth
   - 200 connection pool

3. **Hetzner CX32 upgrade** (€6/ay)
   - 4 vCPU / 8 GB RAM (vs CX22 2/4)

4. **Sentry Team plan** ($26/ay) — 100K events/ay

5. **External UptimeRobot monitor** (free tier, 50 monitor)

**Toplam ek maliyet: ~$80/ay**

### 250 müşteri (~$15-50K MRR)

**Mimari değişiklikler:**

1. **Multi-instance API** (load balancer arkasında 2-3 instance)
   ```yaml
   # Coolify > damga-api > Scaling
   replicas: 3
   ```
   - BullMQ zaten multi-instance safe (Batch 25)
   - express-session yok (JWT-based — stateless ✓)
   - Sticky session GEREKMEZ

2. **DB partitioning** (`attendance_events`)
   - `packages/db/src/scripts/partition-attendance-events.md` rehberi
   - Maintenance window: TR Pazar gece 02:00 (1 saat downtime)
   - Aylık partition, BullMQ cron auto-create

3. **DB read replica** (Supabase Pro+)
   - Analytics + raporlama read replica'ya
   - `DATABASE_URL_READONLY` env var
   - Drizzle: `db.execute(sql..., { readonly: true })`

4. **CDN için R2/S3 storage** (selfies)
   - Cloudflare R2 ($0.015/GB/ay, zero egress)
   - Mevcut Supabase Storage → migrate
   - Asset URL'leri rewrite

5. **GitHub Actions self-hosted runner** (CI hızı için, opsiyonel)

**Toplam ek maliyet: ~$200/ay**

### 1000 müşteri (~$100K+ MRR)

**Enterprise tier mimarisi:**

1. **Managed Postgres** (Supabase Pro+ veya AWS RDS)
   - Multi-AZ standby
   - Auto-failover
   - 99.99% uptime SLA

2. **Multi-region read replica**
   - EU primary + US east replica (latency için)
   - Damga TR pazarına fokuslu olduğu için bu BÜYÜK ihtimal **gereksiz**

3. **CDN edge functions** (Cloudflare Workers)
   - `/v1/health` ve `/v1/status` edge'de
   - Cold start <10ms

4. **Datadog/New Relic APM** (Sentry yetmez)
   - Distributed tracing
   - Custom metrics
   - APM cost: $150-300/ay

5. **SOC2 Type 1 → Type 2** (Vanta/Drata)
   - 6 ay observation window
   - Auditor: $15-30K
   - **Gerekli**: $50K+ deal size müşteriler için

**Toplam: $1-3K/ay altyapı + $25K/yıl compliance**

---

## Aşamalı geçiş checklist

### Şu an HAZIRDIR (kod tarafı)
- [x] BullMQ worker (Batch 25) — `REDIS_URL` set edince devreye girer
- [x] DB partitioning helper (Batch 26) — script hazır, migration sırasında uygulanır
- [x] Feature flags (Batch 27) — gated rollout için
- [x] APM custom spans (Batch 28) — BullMQ job profilleme
- [x] Hash chain audit (Batch 0) — multi-instance safe
- [x] Idempotency tablosu (önceden) — distributed retry safe
- [x] Account lockout (Batch 15) — DB-based, multi-instance safe
- [x] CSP + HSTS + 2FA + KVKK self-serve

### Geçiş sırasında YAPILACAK
- [ ] Upstash Redis hesap aç → REDIS_URL set et
- [ ] Supabase Pro upgrade (PITR + 200 connection)
- [ ] Coolify replica count 1 → 3
- [ ] `attendance_events` aylık partitioning migration (maintenance window)
- [ ] Cloudflare R2 bucket + selfie migration
- [ ] External monitor (UptimeRobot 2 endpoint)
- [ ] On-call rotation (2+ kişi, PagerDuty/Better Stack)

### Müşteri sayısına göre uyaranlar

| Müşteri | Aylık maliyet | Aksiyon |
|---|---|---|
| 0-50 | $5-15 | Hiçbir şey, sadece backup test |
| 50-100 | $50-100 | Redis + Supabase Pro upgrade |
| 100-250 | $200 | Multi-instance + DB partitioning |
| 250-500 | $500 | Read replica + CDN R2 |
| 500-1000 | $1500 | Managed DB + APM upgrade |
| 1000+ | $3K+ | SOC2 + dedicated infra team |

---

## Multi-Instance Deployment Notları

Damga şu an **tek instance**. Multi-instance'a geçince dikkat edilecekler:

### ✅ Zaten safe (kod değişikliği gerek yok)
- **JWT auth** — stateless (sticky session GEREK YOK)
- **API key auth** — bcrypt hash DB'de, per-key rate limit Redis'e geçecek
- **BullMQ cron** — Redis ile lock'lu, sadece 1 worker tetikler
- **Idempotency** — DB-based (idempotency_keys tablosu)
- **Hash chain** — DB trigger, race condition yok
- **Account lockout** — DB-based count
- **Health monitor** — BullMQ ile tek instance ping

### ⚠️ Dikkat edilecek
- **In-memory rate limit** (api-keys) — şu an per-instance. Multi-instance'da yetersiz korur. Redis'e geçirme: `rate-limit-redis` paketi.
- **Idempotency cache** — DB-based zaten OK, Redis'e geçince daha hızlı.
- **Feature flag cache** — 30sn in-memory. Multi-instance'da farklı instance'lar 30sn arasında farklı cevap verebilir (kabul edilebilir).
- **Webhook delivery** — webhook_deliveries tablosu üzerinden. Multi-instance worker'lar `SELECT FOR UPDATE SKIP LOCKED` kullanırsa duplicate olmaz (şu an böyle değil, ileride iyileştirilebilir).

### Coolify multi-instance setup

```yaml
# Coolify > damga-api > Scaling
replicas: 3
resource_limits:
  cpu: '1.0'  # 1 vCPU per instance
  memory: '512M'

# Health check
healthcheck:
  path: /v1/health/healthz
  interval: 30s
  timeout: 5s
  retries: 3
```

Coolify otomatik load balancer (Traefik) ile dağıtır.

### Database connection pool

3 API instance × max 10 connection each = 30 connection. Supabase Free tier limit 60. **Yeterli ama dikkat.**

Pro tier'a geçince:
- 200 pgBouncer connection
- 20 connection per instance × 3 instance = 60 (safe)

```typescript
// packages/db/src/index.ts (zaten configured)
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10, // her instance icin
});
```

---

## Maliyet projection

| Ay | Müşteri | MRR (TL) | Altyapı maliyeti (TL) | Net Margin |
|---|---|---|---|---|
| 1 | 5 | ₺2,000 | ₺150 | %93 |
| 3 | 25 | ₺10,000 | ₺300 | %97 |
| 6 | 75 | ₺35,000 | ₺2,500 | %93 |
| 12 | 200 | ₺100,000 | ₺8,000 | %92 |
| 24 | 500 | ₺350,000 | ₺25,000 | %93 |
| 36 | 1000 | ₺800,000 | ₺75,000 | %91 |

> Damga gibi B2B SaaS'ın altyapı maliyeti gelirin **%5-10**'u civarında olmalı. Üstüne çıkarsa mimari problem var.

---

## Acil ölçeklendirme senaryosu (viral oldun)

Ani trafik patlamasında:

1. **İlk 10 dakika:**
   ```bash
   # Coolify panel
   damga-api > Scaling > replicas: 5
   damga-web > Scaling > replicas: 3
   ```

2. **30 dakika içinde:**
   - Hetzner CX22 → CX32 (1 click)
   - Cloudflare proxy on (orange cloud) tüm A record'lar
   - Cloudflare cache aggressive (4 saat TTL)

3. **2 saat içinde:**
   - Supabase Pro upgrade ($25/ay)
   - Redis aktif (Upstash)

4. **24 saat içinde:**
   - DB partitioning planla
   - 2. Hetzner sunucu (load balancer arkasında)

**Damga'nın hash chain trigger'ı sequential olduğu için DB write'ı tek noktada.** 1000 paralel check-in/sn'de DB darboğaz olur. Bu noktada queue-based write'a geçmek gerekir (write API hızlı response döner, BullMQ ile gerçek event DB'ye yazılır).

Şimdilik bu noktaya **YIL 3-5 sonra** gelinir.

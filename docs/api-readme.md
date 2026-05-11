# Damga API — Entegrasyon Rehberi

Damga'nın HTTP API'sine entegrasyon yapanlar için. Hem kendi sistemlerinin Damga ile veri alışverişi yapması, hem üçüncü taraf entegratörler için.

**Base URL:** `https://api.damga.deploi.net/v1`
**Format:** JSON (request + response)
**Auth:** Bearer token (3 tip aşağıda)

---

## 1. Auth — 3 Tip Yetkilendirme

Damga 3 farklı yetki tipini destekler. Hangi senaryoda hangisi:

| Tip | Format | Kim üretir | Kullanım | `?org_id` zorunlu mu? |
|---|---|---|---|---|
| **Supabase JWT** | `eyJxxx...` | Kullanıcı login olunca Supabase | Web/mobil app | Hayır (user'ın org'u) |
| **Org-Admin Key** | `dmg_live_xxx` | Org owner (admin paneli) | Müşterinin kendi sistemi → Damga | Hayır (key'in org'u) |
| **Service Key** | `dmg_svc_xxx` | Platform admin (Kaan) | Diğer projeler (Lokma) → Damga | **EVET** |

### 1.1 Supabase JWT
Web/mobil client'lar için. Supabase Auth ile login → `data.session.access_token`. API çağrılarında:
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

### 1.2 Org-Admin API Key
Müşteri kendi Damga org'unun owner'ı olarak `/v1/api-keys` endpoint'inden üretir:
```bash
curl -X POST https://api.damga.deploi.net/v1/api-keys \
  -H "Authorization: Bearer <supabase_jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ERP entegrasyonu",
    "scopes": ["events:read", "users:read", "leaves:read"],
    "rate_limit_per_min": 100
  }'
```

Response (raw key SADECE bir kez gösterilir):
```json
{
  "api_key": { "id": "...", "name": "ERP entegrasyonu", "key_prefix": "dmg_live_a1b2..." },
  "secret_key": "dmg_live_a1b2c3d4e5f6...",
  "warning": "Bu key bir daha gösterilmeyecek. Şimdi kopyala ve güvenli sakla."
}
```

Sonra:
```http
Authorization: Bearer dmg_live_a1b2c3d4e5f6...
```

veya
```http
X-API-Key: dmg_live_a1b2c3d4e5f6...
```

### 1.3 Service Key (S2S)
Sadece platform admin (Kaan) üretebilir. Lokma vb. iç projelerin Damga'ya bağlanması için. Bir kez üretilir, tüm org'lara erişebilir, **her istekte hangi org için çalıştığını söylemen gerek**.

Üretme:
```bash
curl -X POST https://api.damga.deploi.net/v1/platform/service-keys \
  -H "Authorization: Bearer <kaan_supabase_jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "lokma-integration",
    "scopes": ["events:read", "users:read", "shifts:read"],
    "rate_limit_per_min": 1000
  }'
```

Kullanım — `?org_id=<damga_org_uuid>` query param **zorunlu** (cross-org leak önleme):
```bash
# Veya X-Damga-Org header
curl "https://api.damga.deploi.net/v1/users?org_id=550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer dmg_svc_xxx..."
```

Eksik olursa: `400 MISSING_ORG_ID`.

---

## 2. Rate Limit

Her API key için per-minute limit. Default `100/dk`, key başına override (`rate_limit_per_min`).

Her response'da:
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1700000060
```

Aşımda:
```http
HTTP/1.1 429 Too Many Requests
Retry-After: 23
```

İpucu: bulk işlemde `Retry-After`'ı bekle, sonra devam et. Service key'lerde default 1000/dk verilir (Lokma gibi yoğun kullanım için).

---

## 3. Idempotency-Key (Retry Güvenliği)

POST/PUT/PATCH/DELETE isteklerinde aynı request iki kez gönderilirse aynı sonucu garanti etmek için. Network retry'lar veri bozmaz.

```http
POST /v1/check-in
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json
```

İki gözlem:
- **Aynı body ile retry:** ilk işlem cached response'u döner. Header: `Idempotent-Replay: true`.
- **Farklı body ile aynı key:** `422 IDEMPOTENCY_KEY_REUSED`.

Cache TTL: 24 saat. 5xx response'lar cache'lenmez (geçici hata, retry mantıklı).

**Önerilen:** UUID v4 üret (her yeni "logical" işlem için bir tane), sunucu yanıt verene kadar aynı UUID ile retry yap.

---

## 4. Webhook (Realtime Push)

Damga olay olduğunda dış sisteminizi bildirir (HTTP POST).

### 4.1 Webhook oluştur
```bash
curl -X POST https://api.damga.deploi.net/v1/webhooks \
  -H "Authorization: Bearer <key>" \
  -d '{
    "url": "https://erp.firma.com/webhooks/damga",
    "events": ["check_in.created", "leave.approved", "shift.assigned"]
  }'
```

Response: `{ "id": "...", "secret": "whsec_..." }` — **secret'ı sakla**, doğrulama için lazım.

### 4.2 Receiver tarafı
Damga her event'te şunları gönderir:
```http
POST https://erp.firma.com/webhooks/damga
X-Damga-Signature-V2: t=1700000000,v1=abc123...
X-Damga-Timestamp: 1700000000
X-Damga-Event: check_in.created
X-Damga-Webhook-Id: <uuid>
X-Damga-Delivery-Attempt: 1
Content-Type: application/json

{ "event": "check_in.created", "payload": {...}, "timestamp": "2026-..." }
```

Doğrulama detayları → [`webhook-verify.md`](./webhook-verify.md) (Node/Python/PHP örnek snippet'leri).

### 4.3 Retry
Damga başarısız delivery'leri 3 kez dener (5sn, 30sn, 75sn). Hala fail ederse `webhook.failure_count` artar — admin paneli gösterir.

---

## 5. Hata Kodları

```json
{
  "error": "Mesaj (Türkçe)",
  "code": "MACHINE_READABLE_CODE",
  "details": { ... }  // opsiyonel
}
```

| HTTP | Kod | Anlam |
|---|---|---|
| 400 | `MISSING_ORG_ID` | Service key isteğinde `?org_id` veya `X-Damga-Org` yok |
| 400 | `BAD_IDEMPOTENCY_KEY` | Idempotency-Key 8-200 karakter olmalı |
| 401 | `NO_TOKEN` / `INVALID_TOKEN` | Authorization header yok / geçersiz |
| 401 | `INVALID_API_KEY` / `API_KEY_EXPIRED` / `KEY_TYPE_MISMATCH` | API key sorunları |
| 403 | `FORBIDDEN` / `MISSING_SCOPE` / `NOT_PLATFORM_ADMIN` | Yetki yok |
| 404 | _(çeşitli)_ | Kaynak bulunamadı |
| 422 | `IDEMPOTENCY_KEY_REUSED` | Aynı key farklı body ile gönderildi |
| 429 | `RATE_LIMIT_EXCEEDED` | Per-key limit aşıldı (`Retry-After` header) |
| 503 | `SUPABASE_NOT_CONFIGURED` | Sunucu yapılandırma sorunu |

---

## 6. Örnek Workflow — Lokma Senaryosu

Lokma bir mutfak çalışanını vardiyaya atadı, çalışan check-in yaptıkça Lokma'ya bildir, sonra Lokma vardiya raporunu Damga'dan çeksin.

### Adım 1: Service key ve webhook kur (bir kez)
```bash
# Service key (Kaan üretir, Lokma'ya verir)
curl -X POST https://api.damga.deploi.net/v1/platform/service-keys \
  -H "Authorization: Bearer <kaan_jwt>" \
  -d '{"name":"lokma","scopes":["events:read","shifts:read","users:read"]}'

# Lokma webhook subscriber'ı (Lokma'nın URL'i)
curl -X POST "https://api.damga.deploi.net/v1/webhooks?org_id=<damga_org>" \
  -H "Authorization: Bearer dmg_svc_xxx" \
  -d '{
    "url": "https://api-lokma.deploi.net/webhooks/damga",
    "events": ["check_in.created", "shift.assigned"]
  }'
```

### Adım 2: Damga olay → Lokma'ya push
Damga'da bir çalışan check-in yaparsa Lokma otomatik bildirim alır:
```http
POST https://api-lokma.deploi.net/webhooks/damga
X-Damga-Signature-V2: t=...,v1=...
{ "event": "check_in.created", "payload": { "user_id": "...", "location_id": "..." } }
```

Lokma webhook'u doğrular (HMAC V2), `payload.user_id`'yi alır, mutfak rolünü kontrol eder.

### Adım 3: Lokma → Damga vardiya verisi çek
```bash
# Yarın çalışacak personel
curl "https://api.damga.deploi.net/v1/shift-assignments?org_id=<damga_org>&date_from=2026-05-12&date_to=2026-05-12" \
  -H "Authorization: Bearer dmg_svc_xxx"
```

### Adım 4: Lokma → Damga overtime onaya gönder (idempotent)
```bash
curl -X POST "https://api.damga.deploi.net/v1/overtime?org_id=<damga_org>" \
  -H "Authorization: Bearer dmg_svc_xxx" \
  -H "Idempotency-Key: lokma-ot-2026-05-11-uuid" \
  -d '{ "user_id": "...", "minutes": 90, "reason": "Akşam servisi yoğun" }'
```

Lokma worker tekrar çalışırsa aynı key ile retry → çift kayıt OLMAZ.

---

## 7. Endpoint Listesi (Hızlı Bakış)

Tam liste: `GET https://api.damga.deploi.net/v1` (kendi gözüne).

Modül başlıklar:
- **Auth:** `/auth/sign-up`, `/auth/sign-up-org`, `/auth/me`, `/auth/magic-link`, `/auth/forgot`
- **Users:** `/users`, `/users/me`, `/users/:id`
- **Check-in:** `/check-in`, `/check-out`, `/stamp`, `/events`, `/events/verify-chain`
- **Shifts:** `/shifts`, `/shift-assignments`, `/shift-swaps`, `/me/shifts`
- **Leaves:** `/leaves`
- **Overtime:** `/overtime`
- **Locations:** `/locations`, `/locations/:id/nfc-tags`, `/locations/:id/qr-codes`
- **Departments:** `/departments`
- **Menus:** `/menus`, `/menus/today`, `/menus/:id/feedback`
- **Announcements:** `/announcements`
- **Reports:** `/reports/attendance`, `/reports/payroll`, `/reports/monthly-summary`, `/reports/audit-export`
- **API keys:** `/api-keys` (org admin) / `/platform/service-keys` (platform admin)
- **Webhooks:** `/webhooks`, `/webhooks/:id/deliveries`, `/webhooks/:id/test`
- **Analytics (manager+):** `/analytics/heatmap`, `/analytics/dept-compare`, `/analytics/trend`, `/analytics/top-late`
- **Platform (sadece Kaan):** `/platform/me`, `/platform/orgs`, `/platform/stats`, `/platform/service-keys`

OpenAPI 3.0 spec: [`openapi.yaml`](./openapi.yaml) — Postman/Insomnia import edilebilir.

---

## 8. Destek

- E-posta: `destek@damga.deploi.net`
- KVKK / yasal: `kvkk@damga.deploi.net`
- Webhook doğrulama: [`webhook-verify.md`](./webhook-verify.md)

API hata raporlaması yaparken: `code` + tam request URL + `X-Request-Id` header'ını ekle (eklenmişse).

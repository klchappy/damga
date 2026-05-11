# Damga Webhook İmza Doğrulama

Damga webhook gönderirken request'e iki imza header'ı koyar:

| Header | Format | Amaç |
|---|---|---|
| `X-Damga-Signature` | `sha256=<hex>` | Body'nin HMAC-SHA256'sı (legacy, geri uyumluluk) |
| `X-Damga-Signature-V2` | `t=<unix>,v1=<hex>` | `<unix>.<body>`'nin HMAC-SHA256'sı (replay-safe, **önerilen**) |
| `X-Damga-Timestamp` | `<unix_seconds>` | Request'in gönderilme zamanı (replay penceresi için) |
| `X-Damga-Event` | `event_type` | Hangi olay (`check_in.created` vb.) |
| `X-Damga-Webhook-Id` | `<uuid>` | Webhook subscription ID |
| `X-Damga-Delivery-Attempt` | `1` / `2` / `3` | Kaçıncı deneme |

`secret` değerini Damga `POST /v1/webhooks` ile webhook oluşturulduğunda dönen `secret` kolonundan alırsın. Bu değer hiçbir zaman log'a yazılmamalı.

## Önerilen doğrulama (V2 — replay-safe)

### Node.js / TypeScript

```ts
import { createHmac, timingSafeEqual } from 'crypto';

function verifyDamgaWebhook(
  rawBody: string,           // express'te bodyParser'dan ÖNCE raw body al
  signatureV2Header: string, // "t=1700000000,v1=abc..."
  secret: string,
  toleranceSeconds = 300,    // 5 dk replay penceresi
): { ok: boolean; reason?: string } {
  const parts = Object.fromEntries(
    signatureV2Header.split(',').map((p) => p.trim().split('=') as [string, string]),
  );
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!t || !v1) return { ok: false, reason: 'malformed_header' };

  // Replay protection
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - t) > toleranceSeconds) {
    return { ok: false, reason: 'timestamp_outside_tolerance' };
  }

  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  // Timing-safe compare (uzunluk eşit olmalı)
  if (expected.length !== v1.length) return { ok: false, reason: 'length_mismatch' };
  const ok = timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(v1, 'hex'));
  return ok ? { ok: true } : { ok: false, reason: 'signature_mismatch' };
}
```

**Express receiver örneği:**
```ts
import express from 'express';

const app = express();
// CRİTİK: HMAC için raw body lazım — express.json() body'yi parse etmeden önce yakala
app.post(
  '/webhooks/damga',
  express.raw({ type: 'application/json' }), // Buffer olarak al
  (req, res) => {
    const sigV2 = req.headers['x-damga-signature-v2'] as string;
    const result = verifyDamgaWebhook(req.body.toString('utf8'), sigV2, process.env.DAMGA_WEBHOOK_SECRET!);
    if (!result.ok) {
      return res.status(401).json({ error: result.reason });
    }
    const event = JSON.parse(req.body.toString('utf8'));
    // event.event, event.payload, event.timestamp ile işle
    res.json({ ok: true });
  },
);
```

### Python

```python
import hmac, hashlib, time
from typing import Tuple

def verify_damga_webhook(
    raw_body: bytes,
    signature_v2_header: str,
    secret: str,
    tolerance_seconds: int = 300,
) -> Tuple[bool, str]:
    parts = dict(p.strip().split("=", 1) for p in signature_v2_header.split(","))
    t = int(parts.get("t", 0))
    v1 = parts.get("v1", "")
    if not t or not v1:
        return False, "malformed_header"

    now = int(time.time())
    if abs(now - t) > tolerance_seconds:
        return False, "timestamp_outside_tolerance"

    signed = f"{t}.".encode() + raw_body
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, v1):
        return False, "signature_mismatch"
    return True, "ok"
```

### PHP

```php
function verify_damga_webhook(string $rawBody, string $sigV2, string $secret, int $tolerance = 300): array {
    $parts = [];
    foreach (explode(',', $sigV2) as $p) {
        [$k, $v] = explode('=', trim($p), 2);
        $parts[$k] = $v;
    }
    $t = (int)($parts['t'] ?? 0);
    $v1 = $parts['v1'] ?? '';
    if (!$t || !$v1) return ['ok' => false, 'reason' => 'malformed_header'];

    if (abs(time() - $t) > $tolerance) return ['ok' => false, 'reason' => 'timestamp_outside_tolerance'];

    $expected = hash_hmac('sha256', $t . '.' . $rawBody, $secret);
    if (!hash_equals($expected, $v1)) return ['ok' => false, 'reason' => 'signature_mismatch'];
    return ['ok' => true];
}
```

## Legacy doğrulama (V1 — sadece body imzası)

Eski entegrasyonlar için `X-Damga-Signature: sha256=<hex>` kullanır. Replay koruması yoktur — V2'ye geçmeniz önerilir.

```ts
const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
const ok = `sha256=${expected}` === req.headers['x-damga-signature'];
```

## Önemli notlar

1. **Raw body kullan** — JSON parse edilmiş veriyi tekrar `JSON.stringify` etmek byte-byte aynı sonucu vermez. Her zaman gelen ham byte'ı imzala/doğrula.
2. **Timing-safe compare** — `===` veya `==` kullanma, `timingSafeEqual` / `hmac.compare_digest` / `hash_equals` kullan (zamanlama saldırısı önleme).
3. **Tolerans** — 5 dk default. Sunucular arası saat farkı ve network gecikmesi için yeterli, replay penceresini dar tutar.
4. **Secret rotasyonu** — Damga'da webhook'u silip yeniden oluşturmak yeni secret üretir. Eski secret'lı receiver'ları güncel tut.
5. **HTTPS zorunlu** — Webhook URL'in `https://` ile başlamalı; yoksa MITM imzayı çalıp kullanabilir.

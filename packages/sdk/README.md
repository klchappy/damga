# @damga/sdk

Damga API için TypeScript SDK. Üçüncü taraf entegrasyonlar (TahminIO, bordro yazılımları, Slack vs) bunu kullanarak Damga'ya bağlanır.

## Kurulum

```bash
npm install @damga/sdk
```

## Hızlı başlangıç

```typescript
import { DamgaClient } from '@damga/sdk';

const damga = new DamgaClient({
  apiKey: process.env.DAMGA_API_KEY!,           // dmg_live_xxxxxxxx
  baseUrl: 'https://api.damga.deploi.net/v1',  // production
});

// Bugünkü check-in'leri çek
const events = await damga.events.list({
  date_from: new Date(Date.now() - 24 * 3600_000).toISOString(),
});

// İzin onayla
await damga.leaves.approve('leave-uuid');

// Aylık devam raporu
const report = await damga.reports.attendance('2026-05');
```

## Webhook signature doğrulama

```typescript
import { verifyWebhookSignature } from '@damga/sdk';

app.post('/webhook/damga', async (req, res) => {
  const ok = await verifyWebhookSignature({
    body: req.rawBody,
    signature: req.headers['x-damga-signature']!,
    secret: process.env.DAMGA_WEBHOOK_SECRET!,
  });
  if (!ok) return res.status(401).send('invalid signature');
  // ... event'i işle
});
```

## API key + webhook üretme

`https://damga.deploi.net/admin/api-keys` (admin yetkisi gerek) → "Yeni Key" → ihtiyaç duyulan scope'ları seç → key bir kez gösterilir, kopyala.

## Hata yönetimi

```typescript
import { DamgaApiError } from '@damga/sdk';

try {
  await damga.events.get('id');
} catch (e) {
  if (e instanceof DamgaApiError) {
    console.error(e.status, e.code, e.message);
  }
}
```

429 (rate limit) otomatik retry ile (3 deneme + exponential backoff) handle edilir.

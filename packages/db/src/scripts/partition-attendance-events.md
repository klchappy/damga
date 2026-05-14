# attendance_events Partitioning Plan

## Neden

`attendance_events` Damga'nın en hızlı büyüyen tablosu. Tahmini:
- 50 müşteri × 30 user × 2 stamp/gün × 365 gün = **~1M satır/yıl**
- 200 müşteri × 50 user × 2 × 365 = **~7M satır/yıl**
- 5 yıl sonra: 30-50M satır

Tek monolitik tablo bu boyutta yavaşlar:
- VACUUM süresi çok uzar
- Index'ler 5-10 GB olur
- Backup süresi katlanır
- Bazı query'ler full scan'e dönebilir

**Çözüm: Aylık declarative partitioning.**

## Mimari

```
attendance_events (parent — declarative range partition by server_time)
├── attendance_events_y2026m05  (2026-05-01 → 2026-06-01)
├── attendance_events_y2026m06  (2026-06-01 → 2026-07-01)
├── attendance_events_y2026m07  ...
└── attendance_events_default   (yakalanmamış aralık için fallback)
```

PostgreSQL 11+ declarative partitioning — query planner her zaman doğru partition'ı seçer.

## Avantajlar

1. **Hızlı silme:** 3 yıl önceki veriyi sil → `DROP TABLE attendance_events_y2023m05` (saniyeler, FULL VACUUM gerek yok)
2. **Hızlı backup:** Sadece son ayı yedeklersin (recent data)
3. **Index boyutu küçük:** Her partition'ın kendi index'i
4. **Query planner pruning:** `WHERE server_time > '2026-05-14'` → sadece ilgili partition'a bakar
5. **Parallel scan:** Birden fazla partition aynı anda taranabilir

## Migration adımları (production'da)

⚠️ **ÖNEMLI:** Bu büyük bir migration. Off-peak saatte yap. Maintenance window önerilir.

### 1. Hazırlık (boş prod'da güvenli)

```sql
-- Mevcut tabloyu yeniden adlandır
ALTER TABLE public.attendance_events RENAME TO attendance_events_legacy;

-- Yeni partitioned parent tablo
CREATE TABLE public.attendance_events (
  LIKE public.attendance_events_legacy INCLUDING ALL
) PARTITION BY RANGE (server_time);

-- İlk partition (mevcut ay)
CREATE TABLE public.attendance_events_y2026m05
  PARTITION OF public.attendance_events
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

-- Default catch-all
CREATE TABLE public.attendance_events_default
  PARTITION OF public.attendance_events DEFAULT;
```

### 2. Veri kopyalama

```sql
-- Mevcut tüm event'leri yeni partitioned table'a aktar (chunked)
INSERT INTO public.attendance_events
SELECT * FROM public.attendance_events_legacy;

-- Doğrulama
SELECT count(*) FROM public.attendance_events;
SELECT count(*) FROM public.attendance_events_legacy;
-- Sayılar EŞIT olmalı
```

### 3. Index + FK + trigger yeniden oluştur

```sql
-- Hash chain trigger'ı yeni partitioned table'a kopyala
-- (script: packages/db/migrations/0XXX_hash_chain.sql)

-- Index'ler her partition'da otomatik kopyalanır (INCLUDING ALL)
```

### 4. Eski tabloyu sil

```sql
DROP TABLE public.attendance_events_legacy;
```

### 5. Aylık partition cron

Her ay 25'i çalışır, gelecek ay partition'ını oluşturur:

```sql
-- packages/db/src/scripts/create-monthly-partition.ts
DO $$
DECLARE
  next_month text := to_char(now() + interval '1 month', 'YYYY-MM-DD');
  month_after text := to_char(now() + interval '2 months', 'YYYY-MM-DD');
  ym text := to_char(now() + interval '1 month', 'YYYYmMM');
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS public.attendance_events_%s
     PARTITION OF public.attendance_events
     FOR VALUES FROM (%L) TO (%L)',
    ym, next_month, month_after
  );
END $$;
```

BullMQ'da yeni job ekle:
```typescript
{ name: 'monthly-partition-create', pattern: '0 3 25 * *', jobId: 'partition-create' }
```

## Şu an yapılacak vs ileride

### ŞU AN (Batch 26 — bu commit)
- ✅ Bu rehber dokümante edildi
- ✅ Migration script taslakları hazır
- ❌ Production'a uygulama YOK — küçük müşteri sayısında premature

### 100-200 MÜŞTERI ARALIĞINDA (gelecek)
- Maintenance window planla (TR Pazar gece 02:00 önerilen)
- Backup al
- 1-4 adımlarını sırayla uygula (45 dk - 2 saat)
- Application down time ~5 dakika (rename + create + index)
- BullMQ'da monthly-partition-create job'unu aktif et

### Test ortamında
```bash
# Lokal DB'de denemek için
pnpm -F @damga/db exec dotenv -e ../../.env.local -- tsx \
  packages/db/src/scripts/partition-migration.ts --dry-run
```

## Rollback planı

Migration başarısız olursa:
```sql
DROP TABLE public.attendance_events CASCADE;
ALTER TABLE public.attendance_events_legacy RENAME TO attendance_events;
```

Eski hash chain trigger geri gelir, sistem normal çalışır.

## Riskler

- **Trigger uyumsuzluğu:** Hash chain trigger'ı partitioned table'da farklı davranır (ROW BEFORE INSERT). Test edilmeden production'a UYGULANMAMALI.
- **Existing index'ler:** Bazı index'ler partition başına ayrı oluşturulmalı (CREATE INDEX ... ON ONLY parent table → her partition'a yayılmaz).
- **FK constraint'ler:** Partition'da FK partition başına geçerli (legacy table'a tek check yetmiyor).

## Karar

**Şu an uygulanmıyor.** İlk 100 müşteriye kadar gereksiz karmaşıklık.
50+ müşteri olduğunda monitoring'e bakıp tetikle: `SELECT pg_size_pretty(pg_total_relation_size('public.attendance_events'))`.

Tablo > 2 GB veya satır > 5M olunca migration window planla.

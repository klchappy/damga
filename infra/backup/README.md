# Damga Backup Sistemi

PostgreSQL otomatik yedekleme + felaket kurtarma (DR).

---

## Hızlı kurulum (Coolify üzerinde)

Coolify v4 **Scheduled Tasks** desteği var — Hetzner'a SSH gerekmiyor.

### 1. Backblaze B2 hesabı aç (ücretsiz tier: 10 GB, ~50 paying müşteri'ye kadar yetiyor)

1. https://www.backblaze.com/b2/sign-up.html → kayıt ol
2. Application Keys → "Add a New Application Key"
   - keyName: `damga-backup`
   - Bucket: yeni "damga-backup" bucket'ı oluştur (private, EU-Central)
   - Capabilities: `listBuckets`, `readFiles`, `writeFiles`, `deleteFiles`
3. `keyID` + `applicationKey` not al → Bitwarden vault'a kaydet

**Maliyet:**
- Storage: $0.006/GB/ay (10GB ücretsiz)
- Download: $0.01/GB (sadece restore sırasında)
- Tahmin: 1GB damp × 90 gün retention = 90GB = ~$0.50/ay

### 2. Coolify'da rclone container

Damga projesi altına yeni **Service** ekle:

**Image:** `rclone/rclone:1`
**Volume:** `/config/rclone:/config/rclone` (persistent)
**Env:**
```
RCLONE_CONFIG_B2_TYPE=b2
RCLONE_CONFIG_B2_ACCOUNT=<keyID>
RCLONE_CONFIG_B2_KEY=<applicationKey>
RCLONE_CONFIG_B2_HARD_DELETE=true
```

### 3. Coolify Scheduled Task (damga-api container içinde)

Coolify UI → damga project → damga-api → **Scheduled Tasks** sekmesi:

| Alan | Değer |
|---|---|
| Name | `daily-pg-dump` |
| Cron | `30 3 * * *` (her gün 03:30 UTC, TR saatiyle 06:30) |
| Container | `damga-api` |
| Command | `/app/infra/backup/pg_dump_damga.sh` |

**Önemli:** `infra/backup/pg_dump_damga.sh` scripti container içine kopyalanmalı.
`apps/api/Dockerfile`'a şu satırı ekle:

```dockerfile
COPY infra/backup /app/infra/backup
RUN chmod +x /app/infra/backup/*.sh && \
    apt-get update && apt-get install -y --no-install-recommends \
      postgresql-client rclone curl && \
    rm -rf /var/lib/apt/lists/*
```

### 4. Environment variables (Coolify damga-api env'a ekle)

```
BACKUP_DIR=/var/backups/damga
BACKUP_REMOTE=b2:damga-backup
BACKUP_RETENTION_DAYS=30
BACKUP_REMOTE_RETENTION_DAYS=90

# Opsiyonel — healthcheck.io ücretsiz hesap aç
HEALTHCHECK_URL=https://hc-ping.com/<your-uuid>

# Opsiyonel — age ile şifreleme (önerilen, B2 hesabı çalınsa bile dump açılamaz)
# 1. age-keygen ile key üret: AGE-SECRET-KEY-1XXXX → public key: age1XXXX
# 2. AGE-SECRET-KEY-... Bitwarden'a kaydet
# 3. Aşağıdaki env'a sadece PUBLIC KEY (age1XXXX) yaz — restore'da private gerekecek
BACKUP_ENCRYPT_KEY=age1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## Alternatif kurulum (Hetzner host cron)

Coolify yerine doğrudan Hetzner sunucusunda cron çalıştır.

```bash
# 1. SSH ile bağlan
ssh root@deploi.net

# 2. Bağımlılıklar
apt update && apt install -y postgresql-client-15 rclone

# 3. rclone config
rclone config  # Backblaze B2 remote ekle, remote adı: b2-damga-backup

# 4. Script kur
mkdir -p /opt/damga
curl -o /opt/damga/pg_dump_damga.sh https://raw.githubusercontent.com/klchappy/damga/main/infra/backup/pg_dump_damga.sh
chmod +x /opt/damga/pg_dump_damga.sh

# 5. Env dosyası
cat > /etc/damga-backup.env <<EOF
DIRECT_URL=postgres://postgres.tidsuaupjvtviewidbav:****@aws-1-eu-central-1.pooler.supabase.com:5432/postgres
BACKUP_DIR=/var/backups/damga
BACKUP_REMOTE=b2-damga-backup:damga-backup
BACKUP_RETENTION_DAYS=30
BACKUP_REMOTE_RETENTION_DAYS=90
HEALTHCHECK_URL=https://hc-ping.com/...
EOF
chmod 600 /etc/damga-backup.env

# 6. Cron
cat > /etc/cron.d/damga-backup <<'EOF'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

30 3 * * * root . /etc/damga-backup.env && /opt/damga/pg_dump_damga.sh >> /var/log/damga-backup.log 2>&1
EOF
```

---

## Disaster Recovery (DR) Prosedürü

### Senaryo 1: Bir tablo bozuldu/silindi

```bash
# 1. En son yedeği bul
ls -lah /var/backups/damga/

# 2. Yedeği geçici DB'ye yükle
createdb damga_temp
gunzip -c /var/backups/damga/damga_2026-05-14_03-30.sql.gz | psql damga_temp

# 3. İlgili tabloyu production'a kopyala
pg_dump -t public.attendance_events damga_temp | psql "$DIRECT_URL"
```

### Senaryo 2: Tüm DB kaybedildi (Supabase project silindi vb.)

1. **Yeni Supabase projesi aç** (EU/Frankfurt region)
2. **Migration'ları çalıştır**: `pnpm db:migrate`
3. **Yedekten restore et**:
   ```bash
   rclone copy b2:damga-backup/$(date +%Y/%m)/ ./latest/ --max-age 24h
   ./infra/backup/pg_restore_damga.sh latest/damga_*.sql.gz <yeni-direct-url>
   ```
4. **Coolify env güncelle** → yeni DATABASE_URL + DIRECT_URL
5. **damga-api + damga-web redeploy**
6. **Hash chain doğrula**:
   ```sql
   SELECT public.verify_hash_chain(org_id) AS ok FROM orgs;
   -- Hepsi true olmalı
   ```

### Senaryo 3: Hetzner sunucusu çöktü

1. Coolify yeni sunucuya kuruldu (Hetzner CX22 ~5 dk setup)
2. GitHub'dan repo bağla → auto-deploy
3. Env'ları Bitwarden'dan oku
4. DNS A kaydını yeni IP'ye çek (Cloudflare 30 sn TTL)

**RTO:** ~30 dakika
**RPO:** Maksimum 24 saat (günlük yedek)

### RPO'yu 1 saate indirmek için (gelecek)

- Supabase Pro → PITR ($25/ay)
- Veya: 4-saatte-bir snapshot cron (script'i 4 saat aralık yap)

---

## Test prosedürü (ayda 1 yap)

```bash
# 1. Geçici test DB'si aç (Supabase free tier'da yeni proje)
# 2. En son yedeği restore et
./infra/backup/pg_restore_damga.sh /var/backups/damga/damga_son.sql.gz $TEST_DB_URL

# 3. Önemli verileri kontrol et
psql $TEST_DB_URL <<SQL
SELECT 'orgs' AS table, count(*) FROM orgs
UNION ALL
SELECT 'users', count(*) FROM users
UNION ALL
SELECT 'attendance_events', count(*) FROM attendance_events
UNION ALL
SELECT 'hash_chain', count(*) FROM attendance_events WHERE prev_hash IS NOT NULL;
SQL

# 4. Hash chain doğrula
psql $TEST_DB_URL -c "SELECT org_id, public.verify_hash_chain(org_id) AS ok FROM orgs;"

# 5. Test DB'sini sil
```

---

## Sorun giderme

| Sorun | Çözüm |
|---|---|
| `pg_dump: error: connection to server failed` | DIRECT_URL doğru mu? (pooler değil, 5432 portu) |
| `pg_dump: error: server version mismatch` | Hetzner'da postgresql-client-15 (Supabase = pg15) |
| `rclone: directory not found` | B2 bucket adı doğru mu? remote adı `b2:damga-backup` formatında mı? |
| Dump dosyası 1KB'dan küçük | Bağlantı koptu → DIRECT_URL'i test et: `psql "$DIRECT_URL" -c "SELECT 1"` |
| HEALTHCHECK_URL 404 | hc-ping.com'da check oluştur, UUID'i kopyala |

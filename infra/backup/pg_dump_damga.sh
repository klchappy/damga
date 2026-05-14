#!/usr/bin/env bash
#
# Damga production PostgreSQL yedekleme scripti.
#
# Çalışma planı (Coolify scheduled task veya Hetzner cron):
#   Her gün 03:30 (Europe/Istanbul) — son 30 gün yerel + son 90 gün B2 saklama
#
# Ön gereksinimler:
#   - postgresql-client (pg_dump 15+): apt install postgresql-client
#   - rclone (B2 upload için): https://rclone.org/install/
#   - rclone config remote adı: "b2-damga-backup"
#
# Çevre değişkenleri (Coolify env veya /etc/damga-backup.env):
#   DIRECT_URL=postgres://...        — Supabase direct (pooler değil!)
#   BACKUP_DIR=/var/backups/damga    — yerel saklama dizini
#   BACKUP_REMOTE=b2:damga-backup    — rclone remote (B2/S3/Backblaze)
#   BACKUP_RETENTION_DAYS=30         — yerel saklama günü
#   BACKUP_REMOTE_RETENTION_DAYS=90  — uzak saklama günü
#   BACKUP_ENCRYPT_KEY=...           — age veya gpg key (opsiyonel)
#   HEALTHCHECK_URL=https://hc-ping.com/...  — healthchecks.io ping URL (opsiyonel)
#
# Çalıştırma:
#   chmod +x pg_dump_damga.sh
#   sudo -u postgres /opt/damga/pg_dump_damga.sh
#
# Cron örneği (/etc/cron.d/damga-backup):
#   30 3 * * * root /opt/damga/pg_dump_damga.sh >> /var/log/damga-backup.log 2>&1
#
# Coolify scheduled task (önerilen):
#   Coolify UI > damga project > Scheduled Tasks
#   Cron: 30 3 * * *  Container: damga-api  Command: /app/scripts/pg_dump_damga.sh

set -euo pipefail

# === Konfigürasyon ===
BACKUP_DIR="${BACKUP_DIR:-/var/backups/damga}"
BACKUP_REMOTE="${BACKUP_REMOTE:-b2:damga-backup}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
BACKUP_REMOTE_RETENTION_DAYS="${BACKUP_REMOTE_RETENTION_DAYS:-90}"
DATE_TS="$(date +%Y-%m-%d_%H-%M)"
DUMP_FILE="${BACKUP_DIR}/damga_${DATE_TS}.sql.gz"
LOG_PREFIX="[backup ${DATE_TS}]"

# === Pre-flight ===
if [[ -z "${DIRECT_URL:-}" ]]; then
  echo "${LOG_PREFIX} HATA: DIRECT_URL tanımlı değil"
  exit 1
fi

if ! command -v pg_dump &>/dev/null; then
  echo "${LOG_PREFIX} HATA: pg_dump bulunamadı. postgresql-client kurun."
  exit 1
fi

mkdir -p "${BACKUP_DIR}"

# Healthcheck ping (başlangıç)
if [[ -n "${HEALTHCHECK_URL:-}" ]]; then
  curl -fsS -m 10 --retry 3 "${HEALTHCHECK_URL}/start" &>/dev/null || true
fi

# === pg_dump ===
echo "${LOG_PREFIX} Başladı → ${DUMP_FILE}"

# --no-owner --no-acl: restore'da yetki/role hatalarını önler
# --format=plain --compress: gzip ile inline sıkıştırma
# --exclude-schema: storage/auth Supabase iç şemaları (RLS bağımlılığı, restore'da ayrıca lazım olur)
pg_dump \
  --no-owner \
  --no-acl \
  --format=plain \
  --compress=9 \
  --serializable-deferrable \
  --exclude-schema='auth' \
  --exclude-schema='storage' \
  --exclude-schema='realtime' \
  --exclude-schema='supabase_*' \
  --exclude-schema='extensions' \
  --exclude-schema='graphql*' \
  --exclude-schema='pgbouncer' \
  --exclude-schema='pg_*' \
  --exclude-schema='_realtime' \
  --exclude-schema='vault' \
  --exclude-schema='cron' \
  "${DIRECT_URL}" \
  > "${DUMP_FILE}"

# Boyut kontrolü (1KB altı = boş dump = corrupt)
SIZE=$(stat -c%s "${DUMP_FILE}" 2>/dev/null || stat -f%z "${DUMP_FILE}")
if [[ "${SIZE}" -lt 1024 ]]; then
  echo "${LOG_PREFIX} HATA: dump dosyası çok küçük (${SIZE} byte) — boş çıktı?"
  rm -f "${DUMP_FILE}"
  if [[ -n "${HEALTHCHECK_URL:-}" ]]; then
    curl -fsS -m 10 --retry 3 --data "dump too small: ${SIZE}b" "${HEALTHCHECK_URL}/fail" &>/dev/null || true
  fi
  exit 1
fi

# Restore-test (opsiyonel — sadece gzip integrity check)
gzip -t "${DUMP_FILE}" || { echo "${LOG_PREFIX} HATA: gzip integrity"; exit 1; }

echo "${LOG_PREFIX} ✓ Yerel dump: ${DUMP_FILE} (${SIZE} byte)"

# === Şifreleme (opsiyonel) ===
if [[ -n "${BACKUP_ENCRYPT_KEY:-}" ]]; then
  if command -v age &>/dev/null; then
    age -r "${BACKUP_ENCRYPT_KEY}" -o "${DUMP_FILE}.age" "${DUMP_FILE}"
    rm -f "${DUMP_FILE}"
    DUMP_FILE="${DUMP_FILE}.age"
    echo "${LOG_PREFIX} ✓ age ile şifrelendi → ${DUMP_FILE}"
  else
    echo "${LOG_PREFIX} UYARI: age kurulu değil, şifrelenmeden yedeklendi"
  fi
fi

# === Uzak upload (rclone B2/S3) ===
if command -v rclone &>/dev/null && rclone listremotes 2>/dev/null | grep -q "^${BACKUP_REMOTE%%:*}:$"; then
  rclone copy "${DUMP_FILE}" "${BACKUP_REMOTE}/$(date +%Y/%m)/" --progress --transfers=2 || {
    echo "${LOG_PREFIX} UYARI: uzak upload başarısız (yerel kopya korundu)"
  }
  echo "${LOG_PREFIX} ✓ Uzak upload → ${BACKUP_REMOTE}/$(date +%Y/%m)/"

  # Uzak temizlik (BACKUP_REMOTE_RETENTION_DAYS'den eski)
  rclone delete "${BACKUP_REMOTE}/" --min-age "${BACKUP_REMOTE_RETENTION_DAYS}d" 2>/dev/null || true
else
  echo "${LOG_PREFIX} UYARI: rclone yok veya '${BACKUP_REMOTE%%:*}:' remote tanımlı değil — sadece yerel"
fi

# === Yerel temizlik ===
find "${BACKUP_DIR}" -name "damga_*.sql.gz*" -mtime "+${BACKUP_RETENTION_DAYS}" -delete

# === Sonuç ===
TOTAL_SIZE=$(du -sh "${BACKUP_DIR}" 2>/dev/null | cut -f1)
BACKUP_COUNT=$(find "${BACKUP_DIR}" -name "damga_*.sql.gz*" -type f | wc -l)

echo "${LOG_PREFIX} ✓ Tamamlandı. Yerel: ${BACKUP_COUNT} dosya, toplam ${TOTAL_SIZE}"

# Healthcheck ping (başarı)
if [[ -n "${HEALTHCHECK_URL:-}" ]]; then
  curl -fsS -m 10 --retry 3 --data "ok: ${BACKUP_COUNT} files, ${TOTAL_SIZE}, last: ${SIZE}b" "${HEALTHCHECK_URL}" &>/dev/null || true
fi

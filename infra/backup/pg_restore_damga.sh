#!/usr/bin/env bash
#
# Damga PostgreSQL restore scripti.
#
# KULLANIM:
#   ./pg_restore_damga.sh <yedek-dosyası.sql.gz> [hedef_db_url]
#
# Örnek:
#   # Yerel yedek → Supabase
#   ./pg_restore_damga.sh /var/backups/damga/damga_2026-05-14_03-30.sql.gz
#
#   # B2'den çekip yeni DB'ye geri yükle
#   rclone copy b2:damga-backup/2026/05/damga_2026-05-14_03-30.sql.gz .
#   ./pg_restore_damga.sh damga_2026-05-14_03-30.sql.gz \
#     "postgres://postgres:pass@new-db.supabase.co:5432/postgres"
#
# UYARI: Bu işlem hedef DB'deki "public" şemasını ETKİLER.
# Önce dry-run yapın, dosyayı manuel inceleyin:
#   gunzip -c yedek.sql.gz | less
#
# Restore sonrası yapılması gerekenler:
#   1. SELECT count(*) FROM users, orgs, attendance_events; (satır sayısı kontrolü)
#   2. SELECT public.verify_hash_chain(org_id) FROM orgs; (audit chain doğrulama)
#   3. Coolify env'lar yeni DB'ye işaret etmeli (DATABASE_URL, DIRECT_URL)
#   4. damga-api restart → connection pool yeniden açılır

set -euo pipefail

BACKUP_FILE="${1:-}"
TARGET_URL="${2:-${DIRECT_URL:-}}"

if [[ -z "${BACKUP_FILE}" ]] || [[ -z "${TARGET_URL}" ]]; then
  cat <<EOF
Kullanım: $0 <yedek-dosyası.sql.gz> [hedef_db_url]

  hedef_db_url verilmezse \$DIRECT_URL kullanılır.

Mevcut yedekler (yerel):
$(find /var/backups/damga -name 'damga_*.sql.gz*' -type f 2>/dev/null | sort -r | head -10 | sed 's/^/  /')

EOF
  exit 1
fi

if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "HATA: ${BACKUP_FILE} bulunamadı"
  exit 1
fi

# Confirmation
echo "================================"
echo "DİKKAT — VERİTABANI RESTORE"
echo "================================"
echo "Hedef: ${TARGET_URL%%@*}@***"
echo "Yedek: ${BACKUP_FILE}"
echo "Boyut: $(du -h "${BACKUP_FILE}" | cut -f1)"
echo "================================"
echo
read -p "Bu işlem hedef DB'deki public şemasını ETKİLER. Devam? (evet yazın): " CONFIRM
if [[ "${CONFIRM}" != "evet" ]]; then
  echo "İptal edildi."
  exit 0
fi

# Şifrelenmiş mi? Önce çöz
WORK_FILE="${BACKUP_FILE}"
if [[ "${BACKUP_FILE}" == *.age ]]; then
  if [[ -z "${BACKUP_ENCRYPT_KEY:-}" ]]; then
    echo "HATA: .age dosyası için BACKUP_ENCRYPT_KEY env değişkeni gerekli"
    exit 1
  fi
  echo "→ age ile çözülüyor..."
  age --decrypt -i "${BACKUP_ENCRYPT_KEY}" "${BACKUP_FILE}" > "${BACKUP_FILE%.age}"
  WORK_FILE="${BACKUP_FILE%.age}"
fi

# Restore
echo "→ Restore başlıyor..."
START=$(date +%s)

if [[ "${WORK_FILE}" == *.gz ]]; then
  gunzip -c "${WORK_FILE}" | psql "${TARGET_URL}" -v ON_ERROR_STOP=1 --quiet
else
  psql "${TARGET_URL}" -v ON_ERROR_STOP=1 --quiet < "${WORK_FILE}"
fi

END=$(date +%s)
DURATION=$((END - START))

echo "✓ Restore tamamlandı (${DURATION} saniye)"
echo
echo "Doğrulama sorguları:"
echo "  psql \"${TARGET_URL}\" -c 'SELECT count(*) FROM orgs;'"
echo "  psql \"${TARGET_URL}\" -c 'SELECT count(*) FROM users;'"
echo "  psql \"${TARGET_URL}\" -c 'SELECT count(*) FROM attendance_events;'"
echo
echo "Sonraki adım: Coolify env'da DATABASE_URL/DIRECT_URL'i yeni DB'ye işaret edin + damga-api restart."

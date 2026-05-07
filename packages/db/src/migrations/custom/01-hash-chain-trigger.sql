-- ===================================================================
-- Damga: Hash Chain Trigger + Append-Only Constraint
-- Bu migration TÜM normal Drizzle migration'larından SONRA çalıştırılmalı.
-- attendance_events tablosunu append-only yapar ve hash chain'i otomatize eder.
-- ===================================================================

-- 1) pgcrypto extension'ı (sha256 için)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2) Hash chain hesaplama fonksiyonu
CREATE OR REPLACE FUNCTION compute_event_hash()
RETURNS TRIGGER AS $$
DECLARE
  prev_hash TEXT;
BEGIN
  -- Aynı org'un en son event'inin hash'ini al (server_time desc)
  SELECT this_event_hash INTO prev_hash
  FROM attendance_events
  WHERE org_id = NEW.org_id
  ORDER BY server_time DESC
  LIMIT 1;

  NEW.previous_event_hash := prev_hash;

  -- SHA-256 hash hesapla:
  -- prevHash + userId + type + serverTime + evidenceHash
  NEW.this_event_hash := encode(
    digest(
      COALESCE(prev_hash, 'GENESIS') ||
      NEW.user_id::text ||
      NEW.type::text ||
      COALESCE(NEW.server_time::text, NOW()::text) ||
      NEW.evidence_hash,
      'sha256'
    ),
    'hex'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_event_hash ON attendance_events;
CREATE TRIGGER tr_event_hash
  BEFORE INSERT ON attendance_events
  FOR EACH ROW
  EXECUTE FUNCTION compute_event_hash();

-- 3) Append-only enforcement: UPDATE ve DELETE'i tetikleyici ile reddet
CREATE OR REPLACE FUNCTION reject_event_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'attendance_events tablosu append-only — UPDATE/DELETE kabul edilmez. Düzeltme için yeni event ekleyin (type=admin_correction, supersedes_event_id=...).'
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_reject_event_update ON attendance_events;
CREATE TRIGGER tr_reject_event_update
  BEFORE UPDATE ON attendance_events
  FOR EACH ROW
  EXECUTE FUNCTION reject_event_modification();

DROP TRIGGER IF EXISTS tr_reject_event_delete ON attendance_events;
CREATE TRIGGER tr_reject_event_delete
  BEFORE DELETE ON attendance_events
  FOR EACH ROW
  EXECUTE FUNCTION reject_event_modification();

-- 4) Hash chain doğrulama fonksiyonu (admin için)
-- Bir org'un tüm hash chain'ini doğrular, kırılma noktasını döner
CREATE OR REPLACE FUNCTION verify_hash_chain(p_org_id UUID)
RETURNS TABLE (
  event_id UUID,
  is_valid BOOLEAN,
  expected_hash TEXT,
  actual_hash TEXT,
  chain_position BIGINT
) AS $$
DECLARE
  rec RECORD;
  prev_hash TEXT := NULL;
  expected TEXT;
  pos BIGINT := 0;
BEGIN
  FOR rec IN
    SELECT * FROM attendance_events
    WHERE org_id = p_org_id
    ORDER BY server_time ASC
  LOOP
    pos := pos + 1;
    expected := encode(
      digest(
        COALESCE(prev_hash, 'GENESIS') ||
        rec.user_id::text ||
        rec.type::text ||
        rec.server_time::text ||
        rec.evidence_hash,
        'sha256'
      ),
      'hex'
    );
    event_id := rec.id;
    is_valid := (expected = rec.this_event_hash);
    expected_hash := expected;
    actual_hash := rec.this_event_hash;
    chain_position := pos;
    RETURN NEXT;
    prev_hash := rec.this_event_hash;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ===================================================================
-- ÖNEMLİ NOT: Üretimde ek olarak şunlar uygulanmalı:
--   REVOKE UPDATE, DELETE ON attendance_events FROM PUBLIC;
-- Bu trigger zaten reddediyor ama PG izinleri seviyesinde de
-- kapatmak ek savunma katmanıdır.
-- Supabase'te PUBLIC ROLE için zaten işlem yapılmaz (RLS), ek tedbir
-- olarak service_role'dan da REVOKE etmek için ayrıca migration gerekir.
-- ===================================================================

-- ============================================================================
-- Migration 0018 — leaves.business_days TEXT → INTEGER
-- ============================================================================
-- Önceki versiyon String(businessDays) ile text olarak tutuyordu. Bordro
-- raporlarında cast(... as int) gerekiyor, type mismatch. Şu an leaves
-- tablosunda 0 row var (production), migration güvenli.
-- ============================================================================

-- USING ifadesi: mevcut text değerleri integer'a parse et
ALTER TABLE leaves
  ALTER COLUMN business_days TYPE integer
  USING NULLIF(trim(business_days), '')::integer;

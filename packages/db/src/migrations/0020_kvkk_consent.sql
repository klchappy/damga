-- 0020_kvkk_consent.sql
-- Sign-up sırasında alınan KVKK aydınlatma metni onayını users tablosuna kaydet.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "kvkk_accepted_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "kvkk_consent_version" text;

-- Mevcut kullanıcılar için varsayılan: created_at değerine eşit (geriye dönük onay varsayımı).
-- Bu sadece eski hesaplar için, yeni sign-up'lar zaten doğru zaman damgası alacak.
UPDATE "users"
SET "kvkk_accepted_at" = "created_at",
    "kvkk_consent_version" = '2026-05-15'
WHERE "kvkk_accepted_at" IS NULL;

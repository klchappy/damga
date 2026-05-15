-- 0019_kitchen_meals.sql
-- Mutfak QR + yemek geri bildirim (rating + yorum) sistemi
-- Owner/admin QR oluşturur, personel günde 1 kez okutup feedback verir.

CREATE TABLE IF NOT EXISTS "kitchen_qrs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "token" text NOT NULL UNIQUE,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "idx_kitchen_qrs_org" ON "kitchen_qrs"("org_id", "is_active");

CREATE TABLE IF NOT EXISTS "meal_feedbacks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kitchen_qr_id" uuid NOT NULL REFERENCES "kitchen_qrs"("id") ON DELETE CASCADE,
  "rating" smallint NOT NULL CHECK ("rating" BETWEEN 1 AND 5),
  "comment" text,
  "ate_on" date NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- Günde 1 kez kuralı: aynı kullanıcı aynı gün ikinci feedback veremez.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_meal_feedbacks_user_day"
  ON "meal_feedbacks"("user_id", "ate_on");

CREATE INDEX IF NOT EXISTS "idx_meal_feedbacks_org_day"
  ON "meal_feedbacks"("org_id", "ate_on");

CREATE INDEX IF NOT EXISTS "idx_meal_feedbacks_qr"
  ON "meal_feedbacks"("kitchen_qr_id");

-- RLS — default-deny
ALTER TABLE "kitchen_qrs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "meal_feedbacks" ENABLE ROW LEVEL SECURITY;

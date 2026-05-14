-- ============================================================================
-- Migration 0017 — Puantaj manuel override tablosu
-- ============================================================================
-- Drizzle generate cumulative migration üretti (önceki snapshot 0015 olduğu
-- için 0016'daki tablolar da SQL'e dahil edildi). Production'da bunlar zaten
-- mevcut; bu yüzden manuel temizleyip SADECE puantaj_overrides ile ilgili
-- kısmı bırakıyoruz. IF NOT EXISTS koruması idempotent uygulama için.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "puantaj_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"code" text NOT NULL,
	"reason" text,
	"set_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
    ALTER TABLE "puantaj_overrides"
      ADD CONSTRAINT "puantaj_overrides_org_id_orgs_id_fk"
      FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id")
      ON DELETE cascade ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
    ALTER TABLE "puantaj_overrides"
      ADD CONSTRAINT "puantaj_overrides_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
      ON DELETE cascade ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
    ALTER TABLE "puantaj_overrides"
      ADD CONSTRAINT "puantaj_overrides_set_by_users_id_fk"
      FOREIGN KEY ("set_by") REFERENCES "public"."users"("id")
      ON DELETE restrict ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_puantaj_override_org_user_date"
  ON "puantaj_overrides" USING btree ("org_id","user_id","date");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_puantaj_override_org_date"
  ON "puantaj_overrides" USING btree ("org_id","date");

-- Default-deny RLS (Damga pattern)
ALTER TABLE "puantaj_overrides" ENABLE ROW LEVEL SECURITY;

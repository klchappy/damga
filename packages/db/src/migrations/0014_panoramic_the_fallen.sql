CREATE TYPE "public"."api_key_type" AS ENUM('org_admin', 'service');--> statement-breakpoint
ALTER TABLE "api_keys" ALTER COLUMN "org_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "key_type" "api_key_type" DEFAULT 'org_admin' NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_api_keys_type" ON "api_keys" USING btree ("key_type");
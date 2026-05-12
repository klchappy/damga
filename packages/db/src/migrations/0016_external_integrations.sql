CREATE TABLE "external_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"service_type" text NOT NULL,
	"name" text NOT NULL,
	"base_url" text,
	"docs_url" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"encrypted_secrets" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secret_fields" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "external_integrations" ADD CONSTRAINT "external_integrations_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "external_integrations" ADD CONSTRAINT "external_integrations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_external_integrations_org" ON "external_integrations" USING btree ("org_id");
--> statement-breakpoint
CREATE INDEX "idx_external_integrations_type" ON "external_integrations" USING btree ("service_type");

CREATE TABLE "organization_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_name" text NOT NULL,
	"tax_id" text,
	"industry" text,
	"employee_count_estimate" text,
	"applicant_full_name" text NOT NULL,
	"applicant_email" text NOT NULL,
	"applicant_phone" text,
	"applicant_title" text,
	"notes" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"created_org_id" uuid,
	"created_user_id" uuid,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"ip_address" text,
	"user_agent" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_pending" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_org_app_status" ON "organization_applications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_org_app_email" ON "organization_applications" USING btree ("applicant_email");
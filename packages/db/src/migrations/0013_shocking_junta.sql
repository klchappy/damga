CREATE TABLE "monthly_market_credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"period" text NOT NULL,
	"rank" integer NOT NULL,
	"credit_amount" integer NOT NULL,
	"spent_amount" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rewards" ADD COLUMN "market_type" text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "monthly_market_credits" ADD CONSTRAINT "monthly_market_credits_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_market_credits" ADD CONSTRAINT "monthly_market_credits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_market_credit_user_active" ON "monthly_market_credits" USING btree ("user_id","is_active");--> statement-breakpoint
CREATE INDEX "idx_market_credit_org_period" ON "monthly_market_credits" USING btree ("org_id","period");
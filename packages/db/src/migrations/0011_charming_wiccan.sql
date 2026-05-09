CREATE TABLE "shift_swap_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"from_user_id" uuid NOT NULL,
	"from_assignment_id" uuid NOT NULL,
	"to_user_id" uuid NOT NULL,
	"to_assignment_id" uuid,
	"message" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"response_reason" text,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "uq_shift_assignments_user_date";--> statement-breakpoint
ALTER TABLE "shift_swap_requests" ADD CONSTRAINT "shift_swap_requests_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_swap_requests" ADD CONSTRAINT "shift_swap_requests_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_swap_requests" ADD CONSTRAINT "shift_swap_requests_from_assignment_id_shift_assignments_id_fk" FOREIGN KEY ("from_assignment_id") REFERENCES "public"."shift_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_swap_requests" ADD CONSTRAINT "shift_swap_requests_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_swap_requests" ADD CONSTRAINT "shift_swap_requests_to_assignment_id_shift_assignments_id_fk" FOREIGN KEY ("to_assignment_id") REFERENCES "public"."shift_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_swap_from_user" ON "shift_swap_requests" USING btree ("from_user_id","status");--> statement-breakpoint
CREATE INDEX "idx_swap_to_user" ON "shift_swap_requests" USING btree ("to_user_id","status");--> statement-breakpoint
CREATE INDEX "idx_swap_org_status" ON "shift_swap_requests" USING btree ("org_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_shift_assignments_user_date" ON "shift_assignments" USING btree ("user_id","shift_date") WHERE status <> 'swapped';
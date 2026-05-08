CREATE TABLE "overtime_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"shift_assignment_id" uuid,
	"event_id" uuid,
	"overtime_minutes" integer NOT NULL,
	"expected_end" text NOT NULL,
	"actual_end" timestamp with time zone NOT NULL,
	"reason" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"xp_transaction_id" uuid,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shift_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"shift_template_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"shift_date" date NOT NULL,
	"override_start" text,
	"override_end" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shift_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"location_id" uuid,
	"name" text NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"break_minutes" integer DEFAULT 60 NOT NULL,
	"color" text DEFAULT '#f97316' NOT NULL,
	"overtime_threshold_minutes" integer DEFAULT 15 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "overtime_records" ADD CONSTRAINT "overtime_records_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overtime_records" ADD CONSTRAINT "overtime_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overtime_records" ADD CONSTRAINT "overtime_records_shift_assignment_id_shift_assignments_id_fk" FOREIGN KEY ("shift_assignment_id") REFERENCES "public"."shift_assignments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overtime_records" ADD CONSTRAINT "overtime_records_event_id_attendance_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."attendance_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overtime_records" ADD CONSTRAINT "overtime_records_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_shift_template_id_shift_templates_id_fk" FOREIGN KEY ("shift_template_id") REFERENCES "public"."shift_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_overtime_org_status" ON "overtime_records" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "idx_overtime_user_time" ON "overtime_records" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_shift_assignments_org_date" ON "shift_assignments" USING btree ("org_id","shift_date");--> statement-breakpoint
CREATE INDEX "idx_shift_assignments_user_date" ON "shift_assignments" USING btree ("user_id","shift_date");--> statement-breakpoint
CREATE INDEX "uq_shift_assignments_user_date" ON "shift_assignments" USING btree ("user_id","shift_date") WHERE status <> 'swapped';--> statement-breakpoint
CREATE INDEX "idx_shift_templates_org" ON "shift_templates" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_shift_templates_location" ON "shift_templates" USING btree ("location_id");
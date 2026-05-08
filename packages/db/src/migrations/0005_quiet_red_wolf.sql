CREATE TABLE "announcement_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"announcement_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"comment" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "announcement_comments" ADD CONSTRAINT "announcement_comments_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_comments" ADD CONSTRAINT "announcement_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_announcement_comments_announcement" ON "announcement_comments" USING btree ("announcement_id");--> statement-breakpoint
CREATE INDEX "idx_announcement_comments_user" ON "announcement_comments" USING btree ("user_id");
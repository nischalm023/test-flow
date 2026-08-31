CREATE TYPE "public"."repo_scan_status" AS ENUM('PENDING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TABLE "repo_scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"owner" text NOT NULL,
	"repo_name" text NOT NULL,
	"setup_branch" text NOT NULL,
	"base_branch" text NOT NULL,
	"tests_folder_created" boolean DEFAULT false NOT NULL,
	"status" "repo_scan_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "repo_scans" ADD CONSTRAINT "repo_scans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
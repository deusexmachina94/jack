CREATE TABLE "certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"consumer_id" text NOT NULL,
	"domain_id" uuid NOT NULL,
	"terms_id" uuid NOT NULL,
	"terms_hash" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"event_count" integer DEFAULT 0 NOT NULL,
	"jws" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_terms_id_license_terms_id_fk" FOREIGN KEY ("terms_id") REFERENCES "public"."license_terms"("id") ON DELETE no action ON UPDATE no action;
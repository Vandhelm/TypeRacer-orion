ALTER TABLE "rooms" ADD COLUMN "invite_token" text NOT NULL;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_invite_token_unique" UNIQUE("invite_token");--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_code_format" CHECK ("rooms"."code" ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$');
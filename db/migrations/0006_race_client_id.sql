ALTER TABLE "races" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "races" ADD CONSTRAINT "races_client_id_unique" UNIQUE("client_id");
-- SALLE-04 : un lien d'invitation par invité, lié à son IP. L'ancien jeton unique par salon (122 bits, sans statut)
-- est retiré sans être repris : l'hôte d'un salon ouvert génère de nouveaux liens.
CREATE TABLE "room_invites" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "room_invites_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"room_id" integer NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_by" text,
	"used_name" text,
	"used_ip" text,
	"used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "room_invites_token_unique" UNIQUE("token"),
	CONSTRAINT "room_invites_used" CHECK (("room_invites"."used_by" is null) = ("room_invites"."used_ip" is null) and ("room_invites"."used_by" is null) = ("room_invites"."used_at" is null))
);
--> statement-breakpoint
ALTER TABLE "rooms" DROP CONSTRAINT "rooms_invite_token_unique";--> statement-breakpoint
ALTER TABLE "room_invites" ADD CONSTRAINT "room_invites_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "room_invites_room" ON "room_invites" USING btree ("room_id");--> statement-breakpoint
ALTER TABLE "rooms" DROP COLUMN "invite_token";
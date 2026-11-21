-- SALLE-01 : un membre est un compte ou un invité, participant ou spectateur. Les lignes existantes sont des comptes participants.
CREATE TYPE "public"."member_role" AS ENUM('player', 'spectator');--> statement-breakpoint
ALTER TABLE "room_members" ADD COLUMN "member_key" text;--> statement-breakpoint
UPDATE "room_members" SET "member_key" = 'player:' || "player_id";--> statement-breakpoint
ALTER TABLE "room_members" ALTER COLUMN "member_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "room_members" ADD COLUMN "guest_name" text;--> statement-breakpoint
ALTER TABLE "room_members" ADD COLUMN "role" "member_role" DEFAULT 'player' NOT NULL;--> statement-breakpoint
ALTER TABLE "room_members" DROP CONSTRAINT "room_members_room_id_player_id_pk";--> statement-breakpoint
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_room_id_member_key_pk" PRIMARY KEY("room_id","member_key");--> statement-breakpoint
ALTER TABLE "room_members" ALTER COLUMN "player_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "room_members" ALTER COLUMN "seat" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "room_members" ALTER COLUMN "color" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_identity" CHECK (("room_members"."player_id" is null) <> ("room_members"."guest_name" is null));--> statement-breakpoint
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_seat_role" CHECK (("room_members"."role" = 'player') = ("room_members"."seat" is not null));

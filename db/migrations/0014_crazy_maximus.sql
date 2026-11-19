-- SALLE-06 : avant la contrainte, un salon fermé perd ses membres, et une personne dans plusieurs salons ne garde que le plus récent.
DELETE FROM "room_members" WHERE "room_id" IN (SELECT "id" FROM "rooms" WHERE "status" = 'closed');--> statement-breakpoint
DELETE FROM "room_members" AS m USING "room_members" AS newer WHERE m."member_key" = newer."member_key" AND (m."joined_at", m."room_id") < (newer."joined_at", newer."room_id");--> statement-breakpoint
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_member_unique" UNIQUE("member_key");

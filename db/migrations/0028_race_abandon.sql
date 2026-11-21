-- COURSE-07 : l'abandon d'un membre pendant la course, et d'un résultat enregistré (COURSE-10 classe les abandons à part).
ALTER TABLE "race_results" ADD COLUMN "abandoned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "room_members" ADD COLUMN "abandoned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_finished_or_abandoned" CHECK ("room_members"."finished_at" is null or "room_members"."abandoned_at" is null);
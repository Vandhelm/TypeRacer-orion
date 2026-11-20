-- COURSE-06 : la progression validée par le serveur temps réel, et le résultat déjà enregistré pour la course en cours.
ALTER TABLE "room_members" ADD COLUMN "progress" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "room_members" ADD COLUMN "race_recorded" boolean DEFAULT false NOT NULL;

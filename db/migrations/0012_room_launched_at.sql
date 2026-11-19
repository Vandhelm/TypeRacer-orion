-- SALLE-09 : une course sans fin déclarée (onglet fermé) se termine d'elle-même ; une salle déjà en course part de maintenant.
ALTER TABLE "rooms" ADD COLUMN "launched_at" timestamp with time zone;--> statement-breakpoint
UPDATE "rooms" SET "launched_at" = now() WHERE "status" = 'racing';

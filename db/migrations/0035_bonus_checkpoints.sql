-- BONUS-01 / BOT-04 : les points de contrôle franchis de la course en cours, relus par un serveur temps réel redémarré.
ALTER TABLE "rooms" ADD COLUMN "bonus_checkpoints" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_bonus_checkpoints_range" CHECK ("rooms"."bonus_checkpoints" between 0 and 3);

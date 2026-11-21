-- HIST-02 : les bonus reçus par chaque coureur, gardés par le serveur pendant la course puis avec la course enregistrée.
ALTER TABLE "race_results" ADD COLUMN "bonuses" jsonb;--> statement-breakpoint
ALTER TABLE "room_members" ADD COLUMN "received_bonuses" jsonb DEFAULT '[]'::jsonb NOT NULL;

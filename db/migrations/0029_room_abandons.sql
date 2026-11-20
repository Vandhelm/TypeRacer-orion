-- COURSE-10 : classement final. Les abandons et les coureurs partis de la dernière course d'un salon (gardés après leur départ), et la progression d'un bot (reclassement à la fin de la course).
ALTER TABLE "race_results" ADD COLUMN "progress" real;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "abandons" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "departed" jsonb DEFAULT '[]'::jsonb NOT NULL;

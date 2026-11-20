-- COURSE-10 : qui a abandonné la dernière course d'un salon, gardé même après son départ (podium des autres membres).
ALTER TABLE "rooms" ADD COLUMN "abandoned_names" text[] DEFAULT '{}'::text[] NOT NULL;

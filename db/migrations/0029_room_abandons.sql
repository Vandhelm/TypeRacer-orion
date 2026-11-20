-- COURSE-10 : qui a abandonné la dernière course d'un salon (et à quelle progression), gardé même après son départ.
ALTER TABLE "rooms" ADD COLUMN "abandons" jsonb DEFAULT '[]'::jsonb NOT NULL;

-- COURSE-10 : les abandons de la dernière course avec leur progression gardée et leur place (remplace abandoned_names).
ALTER TABLE "rooms" ADD COLUMN "abandons" jsonb DEFAULT '[]'::jsonb NOT NULL;

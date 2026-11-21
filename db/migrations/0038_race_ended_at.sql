-- COURSE-09 : une course finie avant ses bots (aucun humain en course ni arrivé) garde son heure de fin, où les bots s'arrêtent.
ALTER TABLE "rooms" ADD COLUMN "ended_at" timestamp with time zone;
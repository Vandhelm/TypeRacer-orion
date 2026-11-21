-- SALLE-09 : la salle passe aux résultats quand chaque participant humain a fini ; nullable, rien à remplir.
ALTER TABLE "room_members" ADD COLUMN "finished_at" timestamp with time zone;

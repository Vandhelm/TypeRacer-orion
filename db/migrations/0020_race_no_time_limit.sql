-- CONF-01 : le temps maximal peut être « aucun » (null) ; les lignes existantes gardent leur durée.
ALTER TABLE "race_configs" ALTER COLUMN "duration" DROP NOT NULL;
-- CONF-06 : majuscules activées ou non ; les configurations existantes gardent leurs majuscules (true).
ALTER TABLE "race_configs" ADD COLUMN "capitals" boolean DEFAULT true NOT NULL;

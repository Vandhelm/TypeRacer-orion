-- CONF-09 : bonus de remontée activés ou non ; les configurations existantes restent sans bonus (false).
ALTER TABLE "race_configs" ADD COLUMN "catch_up_bonus" boolean DEFAULT false NOT NULL;

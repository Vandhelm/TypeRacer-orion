-- BOT-04 : les effets de bonus reçus par les bots pendant la dernière course, datés depuis le départ, rejoués par le moteur.
ALTER TABLE "rooms" ADD COLUMN "bot_bonuses" jsonb DEFAULT '[]'::jsonb NOT NULL;

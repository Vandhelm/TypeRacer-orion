-- HIST-02 : les participants sans historique (invités, autres humains), pour réafficher toute la course ; les courses existantes n'en ont pas gardé.
ALTER TABLE "races" ADD COLUMN "others" jsonb DEFAULT '[]'::jsonb NOT NULL;

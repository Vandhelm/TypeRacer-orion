-- BONUS-04 : le texte d'un coureur changé par un bonus (+3 / -3 mots), pour reprendre et enregistrer la course sur ce texte.
ALTER TABLE "room_members" ADD COLUMN "bonus_words" jsonb;
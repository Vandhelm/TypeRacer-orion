-- BOT-01 : les niveaux de bots passent de lent / moyen / rapide aux cinq niveaux ; les listes déjà enregistrées suivent
-- (lent -> débutant, moyen -> intermédiaire, rapide -> expert), dans l'ordre des places.
UPDATE "rooms" SET "bot_list" = (
  SELECT coalesce(jsonb_agg(
    CASE item->>'level'
      WHEN 'slow' THEN jsonb_set(item, '{level}', '"beginner"')
      WHEN 'medium' THEN jsonb_set(item, '{level}', '"intermediate"')
      WHEN 'fast' THEN jsonb_set(item, '{level}', '"expert"')
      ELSE item
    END ORDER BY position), '[]'::jsonb)
  FROM jsonb_array_elements("bot_list") WITH ORDINALITY AS list(item, position)
)
WHERE jsonb_array_length("bot_list") > 0;

-- CONF-10 : les bots d'un salon, chacun avec son niveau. Un salon existant aux bots activés garde ceux qu'il montrait : un par place libre, dans l'ordre de la liste fermée (src/players/bots.ts), à sa vitesse (« mixte » alterne lent, moyen, rapide), comme defaultBots.
ALTER TABLE "rooms" ADD COLUMN "bot_list" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "rooms" SET "bot_list" = coalesce((
  SELECT jsonb_agg(jsonb_build_object('name', n.name, 'level', CASE WHEN c.bot_speed = 'mixed' THEN (ARRAY['slow', 'medium', 'fast'])[((n.ord - 1) % 3) + 1] ELSE c.bot_speed::text END) ORDER BY n.ord)
  FROM unnest(ARRAY['Thon_Rouge', 'Wasabi99', 'Saba_Sensei', 'Nori_Ninja', 'Ebi_Fry', 'Uni_Kun', 'Tako_San']) WITH ORDINALITY AS n(name, ord)
  JOIN "race_configs" c ON c.id = "rooms"."config_id"
  WHERE n.ord <= "rooms"."guests" - (SELECT count(*) FROM "room_members" m WHERE m.room_id = "rooms"."id" AND m.role = 'player')
), '[]'::jsonb) WHERE "bots";--> statement-breakpoint
UPDATE "rooms" SET "bots" = false WHERE "bots" AND "bot_list" = '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_bot_list_array" CHECK (jsonb_typeof("rooms"."bot_list") = 'array' and jsonb_array_length("rooms"."bot_list") <= 30);

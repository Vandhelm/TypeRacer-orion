// JOIN-02 : filtres de l'explorateur de salons (GET /api/rooms?language=…&level=…). Un seul schéma (TECH-07),
// lu par le serveur pour valider la requête et par la page d'accueil pour construire l'adresse.
import { z } from "zod";
import { LANGUAGES, LEVELS } from "./settings";

/** Strict : un paramètre inconnu (taille de liste, visibilité…) est refusé, pas ignoré. */
export const RoomFiltersSchema = z.object({ language: z.enum(LANGUAGES).optional(), level: z.enum(LEVELS).optional() }).strict();
export type RoomFilters = z.infer<typeof RoomFiltersSchema>;

/** Les filtres d'une adresse ; null si un paramètre est inconnu, invalide ou répété. */
export function parseRoomFilters(params: URLSearchParams): RoomFilters | null {
  const keys = [...params.keys()];
  if (new Set(keys).size !== keys.length) return null;
  const parsed = RoomFiltersSchema.safeParse(Object.fromEntries(params));
  return parsed.success ? parsed.data : null;
}


/** La requête de l'explorateur pour ces filtres : « » sans filtre, sinon « ?language=fr&level=rich ». */
export function roomFiltersQuery(filters: RoomFilters): string {
  const params = new URLSearchParams();
  if (filters.language) params.set("language", filters.language);
  if (filters.level) params.set("level", filters.level);
  const query = params.toString();
  return query ? `?${query}` : "";
}

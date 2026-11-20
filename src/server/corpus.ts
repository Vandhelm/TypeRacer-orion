// CONF-03 : le texte d'une course en mode cohérent, tiré côté serveur du corpus en base (corpus_texts).
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { corpusTexts } from "../../db/schema";
import type { RoomSettings } from "../rooms/settings";

export type Passage = { id: number; body: string; source: string | null };
export type PassageQuery = Pick<RoomSettings, "language" | "level"> & { words: number };

/**
 * Un passage cohérent dans la langue du salon, au hasard. Ordre de préférence : le niveau demandé, puis un passage
 * assez long pour la longueur voulue (`words`). Sans passage à ce niveau, un autre niveau de la même langue ; null si
 * la langue n'en a aucun.
 */
export async function pickPassage(db: Db, query: PassageQuery): Promise<Passage | null> {
  const length = sql<number>`array_length(regexp_split_to_array(trim(${corpusTexts.body}), '\\s+'), 1)`;
  const [row] = await db
    .select({ id: corpusTexts.id, body: corpusTexts.body, source: corpusTexts.source })
    .from(corpusTexts)
    .where(and(eq(corpusTexts.language, query.language), eq(corpusTexts.type, "coherent")))
    .orderBy(desc(sql`${corpusTexts.level} = ${query.level}`), desc(sql`${length} >= ${query.words}`), asc(sql`random()`))
    .limit(1);
  return row ?? null;
}

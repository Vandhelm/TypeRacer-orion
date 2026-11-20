// CONF-03 : le texte d'une course en mode cohérent, tiré côté serveur du corpus en base (corpus_texts).
import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { corpusTexts } from "../../db/schema";
import type { RoomSettings } from "../rooms/settings";

/** `id` : le passage tiré (rooms.text_id), par lequel le texte commence ; `source` : les sources de tous ses passages. */
export type Passage = { id: number; body: string; source: string | null };
export type PassageQuery = Pick<RoomSettings, "language"> & { words: number };

const wordsOf = (body: string) => body.trim().split(/\s+/).length;

/**
 * Le texte d'une course : le passage `startId`, suivi des passages suivants de la même langue (dans l'ordre du corpus,
 * en reprenant au début si besoin), jusqu'à `words` mots au moins (CONF-04). Le même départ donne le même texte :
 * chaque lecture du salon renvoie celui de la course. Le niveau ne filtre pas : le salon le désactive en mode cohérent.
 * Null si le passage de départ n'est plus dans le corpus.
 */
export async function composePassage(db: Db, query: PassageQuery & { startId: number }): Promise<Passage | null> {
  const rows = await db
    .select({ id: corpusTexts.id, body: corpusTexts.body, source: corpusTexts.source })
    .from(corpusTexts)
    .where(and(eq(corpusTexts.language, query.language), eq(corpusTexts.type, "coherent")))
    .orderBy(asc(corpusTexts.id));
  const start = rows.findIndex((row) => row.id === query.startId);
  if (start < 0) return null;
  const parts: typeof rows = [];
  let count = 0;
  for (let i = start; count < query.words || parts.length === 0; i = (i + 1) % rows.length) {
    const row = rows[i]!;
    parts.push(row);
    count += wordsOf(row.body);
  }
  const sources = [...new Set(parts.map((row) => row.source).filter((source): source is string => Boolean(source)))];
  return { id: query.startId, body: parts.map((row) => row.body.trim()).join(" "), source: sources.length ? sources.join(" · ") : null };
}

/** Un passage de départ au hasard dans la langue du salon, puis le texte composé ; null si la langue n'en a aucun. */
export async function pickPassage(db: Db, query: PassageQuery): Promise<Passage | null> {
  const [row] = await db
    .select({ id: corpusTexts.id })
    .from(corpusTexts)
    .where(and(eq(corpusTexts.language, query.language), eq(corpusTexts.type, "coherent")))
    .orderBy(sql`random()`)
    .limit(1);
  return row ? composePassage(db, { ...query, startId: row.id }) : null;
}

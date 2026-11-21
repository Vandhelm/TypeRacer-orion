// RES-04 : le record personnel d'un compte, décidé par le serveur à partir de son historique (race_results).
// Le meilleur précédent : son meilleur MPM et sa meilleure précision sur ses courses d'avant (ordre du départ, puis de
// l'id). Une course abandonnée (COURSE-07) n'est ni un record ni le record à battre ; la première course n'en est pas un.
import { and, eq, lt, max, not, or, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { raceResults, races } from "../../db/schema";
import { beatenRecord, type PersonalRecord } from "../players/records";

/** Les records que la course `raceId` a battus pour ce joueur, ou null (première course, rien de battu, pas sa course). */
export async function personalRecord(db: Db, playerId: number, raceId: number): Promise<PersonalRecord | null> {
  const [current] = await db
    .select({ wpm: raceResults.wpm, accuracy: raceResults.accuracy, abandoned: raceResults.abandoned, startedAt: races.startedAt })
    .from(raceResults)
    .innerJoin(races, eq(races.id, raceResults.raceId))
    .where(and(eq(raceResults.playerId, playerId), eq(raceResults.raceId, raceId)));
  if (!current || current.abandoned) return null;
  const before = or(lt(races.startedAt, current.startedAt), and(eq(races.startedAt, current.startedAt), lt(races.id, raceId)));
  const [best] = await db
    .select({ wpm: max(raceResults.wpm), accuracy: max(raceResults.accuracy) })
    .from(raceResults)
    .innerJoin(races, eq(races.id, raceResults.raceId))
    .where(and(eq(raceResults.playerId, playerId), not(raceResults.abandoned), before));
  return beatenRecord(current, best ?? null);
}

/**
 * Pour l'historique (HIST-01) : vrai si la course a battu le record de cette mesure au moment où elle a été courue.
 * Fonction de fenêtre sur les courses du joueur (avant LIMIT/OFFSET : juste sur toutes les pages), mêmes règles que
 * personalRecord (strictement au-dessus, hors abandons, rien tapé ou première course : faux).
 */
const beatenBefore = (column: typeof raceResults.wpm | typeof raceResults.accuracy) => sql<boolean>`coalesce(
  not ${raceResults.abandoned} and ${raceResults.wpm} > 0 and ${column} > max(${column}) filter (where not ${raceResults.abandoned})
    over (order by ${races.startedAt}, ${races.id} rows between unbounded preceding and 1 preceding),
  false)`;

export const recordFlags = { wpmRecord: beatenBefore(raceResults.wpm), accuracyRecord: beatenBefore(raceResults.accuracy) };

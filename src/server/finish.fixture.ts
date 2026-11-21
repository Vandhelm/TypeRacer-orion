// COURSE-06 : un membre n'arrive que si le serveur temps réel a validé 100 % de sa progression. Les tests qui font
// finir un coureur jouent ici ce que fait le temps réel (recordProgress), puis l'appel de la page (POST …/finish).
import { eq, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { raceConfigs, rooms } from "../../db/schema";
import { COUNTDOWN_MS } from "../rooms/race-clock";
import { recordProgress } from "./rooms";

type Call = (method: string, path: string, cookie?: string) => Promise<Response>;

/** Le coureur de ce cookie atteint 100 % validé par le serveur, puis sa page appelle /finish ; renvoie cette réponse. */
export async function finishAsServer(db: Db, call: Call, code: string, cookie: string): Promise<Response> {
  const read = await call("GET", `/api/rooms/${code}`, cookie);
  if (read.ok) {
    const { you } = (await read.json()) as { you: string };
    await recordProgress(db, code, you, 1);
  }
  return call("POST", `/api/rooms/${code}/finish`, cookie);
}

/**
 * BOT-05 : le serveur attend les bots du salon. Recule le lancement pour que leur course soit finie : juste après la fin
 * du temps (avant la marge de SALLE-09, qui fermerait la course d'office) ; sans limite, 6 h plus tôt, quand tous sont
 * arrivés. Pour les tests où les bots ne servent qu'à lancer et où seuls les humains comptent.
 */
export async function botsDone(db: Db, code: string): Promise<void> {
  const [row] = await db.select({ duration: raceConfigs.duration }).from(rooms).innerJoin(raceConfigs, eq(raceConfigs.id, rooms.configId)).where(eq(rooms.code, code));
  const ago = COUNTDOWN_MS + (row?.duration == null ? 6 * 3600 : row.duration) * 1000 + 300;
  await db.update(rooms).set({ launchedAt: sql`now() - ${ago} * interval '1 millisecond'` }).where(eq(rooms.code, code));
}

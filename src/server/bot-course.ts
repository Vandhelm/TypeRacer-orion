// BOT-05 / COURSE-09 / COURSE-10 : la course des bots d'un salon, calculée par le serveur avec le moteur partagé
// (src/rooms/bot-engine.ts) : la graine du lancement (rooms.text_seed), les mots tirés comme la page de course et les
// bots assis (seatedBots, CONF-10). Les navigateurs calculent la même trajectoire : le serveur n'a besoin de rien
// d'eux pour savoir où en est un bot. Mesuré à l'heure de la base, borné à la fin de la course (endsAt).
import { eq, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { raceConfigs, rooms } from "../../db/schema";
import { botProfile, botSeed, simulateBot } from "../rooms/bot-engine";
import { seatedBots } from "../rooms/bots";
import { courseWords } from "../rooms/course-words";
import { raceClock } from "../rooms/race-clock";
import { wordTarget } from "../rooms/text";
import { composePassage } from "./corpus";

/** Où en est un bot : son arrivée (heure de la base) s'il est arrivé, sa part du texte (0 à 1). */
export type BotStanding = { finishedAt: Date | null; progress: number; seat: null };

/**
 * Les bots assis du lancement en cours, par nom en minuscules, à l'heure de la base (au plus la fin de la course).
 * `humans` : les coureurs humains du lancement, pour savoir quels bots ont une place. `running` : au moins un bot court
 * encore (ni arrivé, ni arrêté par la fin de la course). Rien sans lancement ni graine (salon lancé avant CONF-03).
 */
export async function launchBots(db: Db, roomId: number, humans: number): Promise<{ standings: Map<string, BotStanding>; running: boolean }> {
  const [row] = await db
    .select({ rooms, config: raceConfigs, now: sql<number>`extract(epoch from now()) * 1000`.mapWith(Number) })
    .from(rooms)
    .innerJoin(raceConfigs, eq(raceConfigs.id, rooms.configId))
    .where(eq(rooms.id, roomId));
  const standings = new Map<string, BotStanding>();
  const { startsAt, endsAt } = raceClock(row?.rooms.launchedAt ?? null, row?.config.duration ?? null);
  if (!row || startsAt === null || row.rooms.textSeed === null) return { standings, running: false };
  const bots = seatedBots(row.rooms, humans);
  if (!bots.length) return { standings, running: false };
  const { config } = row;
  const passage = row.rooms.textId === null ? null : await composePassage(db, { language: config.language, words: wordTarget(config), startId: row.rooms.textId });
  const words = courseWords({ settings: { ...config, text: config.customText }, seed: row.rooms.textSeed, passage }) ?? [];
  // BOT-03 : le mode d'erreur du lancement, comme la page (createCourse)
  const course = { words, durationMs: endsAt === null ? null : endsAt - startsAt, mistakes: config.mistakes };
  let running = false;
  for (const bot of bots) {
    const seed = botSeed(row.rooms.textSeed, bot.name);
    const run = simulateBot(course, { seed, ...botProfile(seed, bot.level, config.botAccuracy) }, row.now - startsAt);
    // un bot éliminé (mode fatal) ne court plus : il ne retient pas la course
    if (run.arrivedMs === null && run.eliminatedMs === null) running = true;
    standings.set(bot.name.toLowerCase(), { finishedAt: run.arrivedMs === null ? null : new Date(startsAt + run.arrivedMs), progress: run.progress, seat: null });
  }
  return { standings, running: running && (endsAt === null || row.now < endsAt) };
}

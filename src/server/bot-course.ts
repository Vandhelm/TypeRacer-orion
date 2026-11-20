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
import type { RoomSettings } from "../rooms/settings";
import { wordTarget } from "../rooms/text";
import { composePassage } from "./corpus";

/**
 * Où en est un bot : son arrivée (heure de la base) s'il est arrivé, sa part du texte (0 à 1). COURSE-06 : `seconds` et
 * `wpm`, le temps et le MPM net de sa course calculée (annexe A, comme la page : caractères justes ÷ 5 ÷ minutes), jusqu'à
 * son arrivée, son élimination, ou maintenant (au plus la fin de la course).
 */
export type BotStanding = { finishedAt: Date | null; progress: number; seat: null; seconds: number; wpm: number };

/** COURSE-06 : le texte de la course tiré par le serveur (vide sans graine), son départ, sa fin et l'heure de la base, en ms. */
export type LaunchCourse = { words: string[]; startsAt: number; endsAt: number | null; now: number; mistakes: RoomSettings["mistakes"] };

/** Caractères cumulés (espaces comprises) après chaque mot, comme la page (createCourse) et l'arbitre (raceCourseOf). */
export function marksOf(words: readonly string[]): number[] {
  const marks = [0];
  for (const word of words) marks.push(marks.at(-1)! + word.length + 1);
  return marks;
}

/** MPM net (annexe A) : caractères justes ÷ 5 ÷ minutes ; 0 sous 1,2 s, comme la page (myWpm). */
export const netWpm = (chars: number, seconds: number) => (seconds > 1.2 ? Math.round(Math.max(0, chars) / 5 / (seconds / 60)) : 0);

/**
 * Les bots assis du lancement en cours, par nom en minuscules, à l'heure de la base (au plus la fin de la course).
 * `humans` : les coureurs humains du lancement, pour savoir quels bots ont une place. `running` : au moins un bot court
 * encore (ni arrivé, ni arrêté par la fin de la course). Rien sans lancement ni graine (salon lancé avant CONF-03).
 * COURSE-06 : avec `withText`, `course` est le texte tiré par le serveur, même sans bot (null sans lancement).
 */
export async function launchBots(db: Db, roomId: number, humans: number, withText = false): Promise<{ standings: Map<string, BotStanding>; running: boolean; course: LaunchCourse | null }> {
  const [row] = await db
    .select({ rooms, config: raceConfigs, now: sql<number>`extract(epoch from now()) * 1000`.mapWith(Number) })
    .from(rooms)
    .innerJoin(raceConfigs, eq(raceConfigs.id, rooms.configId))
    .where(eq(rooms.id, roomId));
  const standings = new Map<string, BotStanding>();
  const { startsAt, endsAt } = raceClock(row?.rooms.launchedAt ?? null, row?.config.duration ?? null);
  if (!row || startsAt === null) return { standings, running: false, course: null };
  const bots = row.rooms.textSeed === null ? [] : seatedBots(row.rooms, humans);
  const none = { standings, running: false, course: { words: [], startsAt, endsAt, now: row.now, mistakes: row.config.mistakes } };
  if (!bots.length && (!withText || row.rooms.textSeed === null)) return none;
  const { config } = row;
  const passage = row.rooms.textId === null ? null : await composePassage(db, { language: config.language, words: wordTarget(config), startId: row.rooms.textId });
  const words = courseWords({ settings: { ...config, text: config.customText }, seed: row.rooms.textSeed, passage }) ?? [];
  // BOT-03 : le mode d'erreur du lancement, comme la page (createCourse)
  const course = { words, durationMs: endsAt === null ? null : endsAt - startsAt, mistakes: config.mistakes };
  const marks = marksOf(words);
  const elapsed = Math.max(0, Math.min(row.now, endsAt ?? Infinity) - startsAt);
  let running = false;
  for (const bot of bots) {
    const seed = botSeed(row.rooms.textSeed!, bot.name);
    const run = simulateBot(course, { seed, ...botProfile(seed, bot.level, config.botAccuracy) }, row.now - startsAt);
    // un bot éliminé (mode fatal) ne court plus : il ne retient pas la course
    if (run.arrivedMs === null && run.eliminatedMs === null) running = true;
    // COURSE-06 : son temps et son MPM, ceux de sa course calculée ; en mode libre, les mots laissés faux ne comptent pas (BOT-03)
    const seconds = (run.arrivedMs ?? run.eliminatedMs ?? elapsed) / 1000;
    const wpm = netWpm((marks[run.position] ?? marks.at(-1)!) - run.missed, seconds);
    standings.set(bot.name.toLowerCase(), { finishedAt: run.arrivedMs === null ? null : new Date(startsAt + run.arrivedMs), progress: run.progress, seat: null, seconds, wpm });
  }
  return { standings, running: running && (endsAt === null || row.now < endsAt), course: { words, startsAt, endsAt, now: row.now, mistakes: config.mistakes } };
}

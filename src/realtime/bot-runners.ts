// BOT-04 : les bots d'une course vus par l'attribution des bonus (src/realtime/server.ts, awardCatchUp). Leur progression
// est celle du moteur partagé (src/rooms/bot-engine.ts), calculée par le serveur à l'instant demandé, avec les effets de
// bonus qu'ils ont déjà reçus : la même que la page de course et que la fin de course (src/server/bot-course.ts).
import { simulateBot, type BotBonus } from "../rooms/bot-engine";
import type { RaceCourse } from "./referee";

/** Un bot à l'instant `now` : sa progression, arrivé ou non, éliminé (mode fatal) et son texte (bonus compris). */
export type BotRunner = { playerId: string; progress: number; finished: boolean; out: boolean; words: readonly string[] };

/** Les bots de la course à l'heure serveur `now` ; aucun sans bots ou sans texte connu. */
export function botRunners(course: RaceCourse, bonuses: readonly BotBonus[], now: number): BotRunner[] {
  const { bots, words, startsAt, endsAt } = course;
  if (!bots?.length || !words?.length) return [];
  const race = { words, durationMs: endsAt === null ? null : endsAt - startsAt, mistakes: course.mistakes ?? "fix" };
  return bots.map(({ id, seed, profile }) => {
    const run = simulateBot(race, { seed, ...profile }, now - startsAt, bonuses.filter((bonus) => bonus.effect.target === id));
    return { playerId: id, progress: run.progress, finished: run.arrivedMs !== null, out: run.eliminatedMs !== null, words: run.words };
  });
}

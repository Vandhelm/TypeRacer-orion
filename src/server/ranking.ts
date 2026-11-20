// COURSE-10 : le classement final d'une course de salon, fait par le serveur. Les règles (rankByServer), ce que le
// serveur sait des coureurs d'un lancement, même partis (launchStandings), et le reclassement des courses déjà
// enregistrées pour ce lancement (rerankLaunch). Sans dépendance vers rooms.ts ni races.ts, qui l'utilisent tous les deux.
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { players, raceConfigs, raceResults, races, roomMembers, rooms } from "../../db/schema";
import { raceClock } from "../rooms/race-clock";
import { launchBots } from "./bot-course";

/** COURSE-06 : la place d'un membre participant au classement du serveur (temps réel, room_members). */
/** COURSE-07 : abandonedAt, l'abandon de ce membre ; progress est alors celle validée au moment de l'abandon. */
/** COURSE-10 : seat, sa place dans le salon, qui départage deux humains à égalité. */
/** COURSE-06 : words, le texte de ce membre changé par un bonus (room_members.bonus_words) ; eliminatedAt, son élimination datée par le serveur (mode fatal) ; seconds et wpm, ceux de la course calculée d'un bot. */
export type ServerStanding = { finishedAt: Date | null; progress: number; abandonedAt?: Date | null; seat?: number | null; words?: string[] | null; eliminatedAt?: Date | null; seconds?: number; wpm?: number };

/**
 * COURSE-10 : le classement final, refait d'après le serveur (COURSE-06). `bots` : les bots du salon, décidés par le
 * serveur (jamais le drapeau du corps) ; tout le reste est humain. Ordre :
 * 1. les terminés : les humains que le serveur a vus arriver (par heure d'arrivée), puis les bots arrivés selon le
 *    navigateur (ordre du corps) : un bot, simulé par le navigateur, ne passe jamais devant un humain arrivé ;
 * 2. les non terminés : humains (progression validée par le serveur) et bots non arrivés (progression du navigateur),
 *    par progression décroissante ; un bot sans progression dans le corps (client d'avant COURSE-10) se place en tête
 *    de ce groupe, comme le faisait COURSE-06 ;
 * 3. les abandons : humains dont le serveur a noté l'abandon, par progression validée au moment de l'abandon ;
 * 4. les humains inconnus du serveur.
 * Égalités (heure d'arrivée ou progression) : la place dans le salon (seat) départage les humains ; un humain passe
 * devant un bot (les couloirs des bots suivent ceux des humains) ; les bots gardent l'ordre du corps.
 * BOT-05 : un bot qui a une place dans `server` (sa course calculée par le serveur, src/server/bot-course.ts) est
 * classé par elle, parmi les humains : arrivé, par heure d'arrivée (un humain devant à égalité) ; sinon par progression.
 * Les règles ci-dessus (navigateur) ne restent que pour un bot sans course calculée (salon lancé avant CONF-03).
 */
export function rankByServer<T extends { name: string; rank: number; finished?: boolean; progress?: number }>(results: T[], server: Map<string, ServerStanding>, bots: Set<string> = new Set()): T[] {
  const isBot = (r: T) => bots.has(r.name.toLowerCase());
  const standing = (r: T) => server.get(r.name.toLowerCase());
  const seat = (r: T) => standing(r)?.seat ?? Number.MAX_SAFE_INTEGER;
  const humans = results.filter((r) => !isBot(r));
  // BOT-05 : un bot dont le serveur a calculé la course (src/server/bot-course.ts) est classé comme un humain connu
  const computed = results.filter((r) => isBot(r) && standing(r));
  const botRows = results.filter((r) => isBot(r) && !standing(r));
  // à égalité, un humain passe devant un bot (tri stable : humains d'abord)
  const arrived = [...humans, ...computed]
    .filter((r) => standing(r)?.finishedAt && !standing(r)!.abandonedAt)
    .sort((a, b) => standing(a)!.finishedAt!.getTime() - standing(b)!.finishedAt!.getTime() || (isBot(a) ? 1 : 0) - (isBot(b) ? 1 : 0) || seat(a) - seat(b));
  const blindBots = botRows.filter((r) => !r.finished && r.progress === undefined);
  // humains d'abord, par place, puis les bots dans l'ordre du corps : le tri stable garde cet ordre à progression égale
  const racing = [
    ...humans.filter((r) => standing(r) && !standing(r)!.finishedAt && !standing(r)!.abandonedAt).sort((a, b) => seat(a) - seat(b)).map((r) => ({ r, progress: standing(r)!.progress })),
    ...computed.filter((r) => !standing(r)!.finishedAt).map((r) => ({ r, progress: standing(r)!.progress })),
    ...botRows.filter((r) => !r.finished && r.progress !== undefined).map((r) => ({ r, progress: r.progress! })),
  ].sort((a, b) => b.progress - a.progress).map(({ r }) => r);
  const abandoned = humans.filter((r) => standing(r)?.abandonedAt).sort((a, b) => standing(b)!.progress - standing(a)!.progress || seat(a) - seat(b));
  const unknown = humans.filter((r) => !standing(r));
  return [...arrived, ...botRows.filter((r) => r.finished), ...blindBots, ...racing, ...abandoned, ...unknown].map((r, index) => ({ ...r, rank: index + 1 }));
}

/**
 * COURSE-10 : ce que le serveur sait des coureurs humains du lancement en cours : les participants présents
 * (room_members), puis ceux partis depuis, gardés par le salon : les abandons (rooms.abandons) et les coureurs partis
 * sans abandonner (rooms.departed), avec leur progression validée (et leur arrivée). `runners` : les participants
 * présents, bots compris ; `absent` : les humains partis ; `humanNames` : tous les humains, en minuscules.
 * COURSE-06 : avec `withText`, `course` est le texte tiré par le serveur et son horloge (launchBots).
 */
export async function launchStandings(db: Db, roomId: number, withText = false) {
  const runners = await db
    .select({ name: sql<string>`coalesce(${players.name}, ${roomMembers.guestName})`, isBot: sql<boolean>`coalesce(${players.isBot}, false)`, finishedAt: roomMembers.finishedAt, progress: roomMembers.progress, abandonedAt: roomMembers.abandonedAt, seat: roomMembers.seat, words: roomMembers.bonusWords, eliminatedAt: roomMembers.eliminatedAt })
    .from(roomMembers)
    .leftJoin(players, eq(players.id, roomMembers.playerId))
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.role, "player")));
  const [room] = await db.select({ abandons: rooms.abandons, departed: rooms.departed }).from(rooms).where(eq(rooms.id, roomId));
  const humans = runners.filter((r) => !r.isBot);
  const humanNames = new Set(humans.map((r) => r.name.toLowerCase()));
  const standings = new Map<string, ServerStanding>(humans.map((r) => [r.name.toLowerCase(), { finishedAt: r.finishedAt, progress: r.progress, abandonedAt: r.abandonedAt, seat: r.seat, words: r.words, eliminatedAt: r.eliminatedAt }]));
  const absent: { name: string; progress: number }[] = [];
  const gone = [
    ...(room?.abandons ?? []).map((a) => ({ ...a, standing: { finishedAt: null, progress: a.progress, abandonedAt: new Date(0), seat: a.seat } })),
    ...(room?.departed ?? []).map((d) => ({ ...d, standing: { finishedAt: d.finishedAt ? new Date(d.finishedAt) : null, progress: d.progress, abandonedAt: null, seat: d.seat } })),
  ];
  for (const { name, progress, standing } of gone) {
    if (humanNames.has(name.toLowerCase())) continue;
    humanNames.add(name.toLowerCase());
    standings.set(name.toLowerCase(), standing);
    absent.push({ name, progress });
  }
  // BOT-05 : les bots assis, à leur course calculée par le serveur (jamais un nom porté par un humain)
  const bots = await launchBots(db, roomId, runners.length + absent.length, withText);
  for (const [name, standing] of bots.standings) if (!humanNames.has(name)) standings.set(name, standing);
  return { runners, humanNames, standings, absent, botsRunning: bots.running, course: bots.course };
}

/** COURSE-10 : décalage temporaire des rangs reclassés (bien au-delà des 30 places d'un salon). */
const RANK_SHIFT = 1_000_000;

/**
 * COURSE-10 : reclasse les courses déjà enregistrées pour le lancement en cours de ce salon (races.room_id et départ
 * serveur) avec ce que le serveur sait maintenant : une course envoyée à l'abandon a été classée avant la fin des
 * autres. Appelée à chaque enregistrement et au passage aux résultats. Les lignes gardées (race_results) et les autres
 * (races.others) reçoivent leur nouveau rang ; un humain connu du serveur, son arrivée et son abandon. Les bots sont
 * ceux qui ont une ligne de bot, à la progression envoyée par le navigateur (race_results.progress).
 */
export async function rerankLaunch(db: Db, roomId: number): Promise<void> {
  const [room] = await db
    .select({ launchedAt: rooms.launchedAt, duration: raceConfigs.duration })
    .from(rooms)
    .innerJoin(raceConfigs, eq(raceConfigs.id, rooms.configId))
    .where(eq(rooms.id, roomId));
  const { startsAt } = raceClock(room?.launchedAt ?? null, room?.duration ?? null);
  if (startsAt === null) return;
  const recorded = await db.select({ id: races.id, others: races.others }).from(races).where(and(eq(races.roomId, roomId), eq(races.startedAt, new Date(startsAt))));
  if (!recorded.length) return;
  const { standings } = await launchStandings(db, roomId);
  for (const race of recorded) {
    const rows = await db
      .select({ id: raceResults.playerId, rank: raceResults.rank, finished: raceResults.finished, progress: raceResults.progress, name: players.name, isBot: players.isBot })
      .from(raceResults)
      .innerJoin(players, eq(players.id, raceResults.playerId))
      .where(eq(raceResults.raceId, race.id));
    const bots = new Set(rows.filter((r) => r.isBot).map((r) => r.name.toLowerCase()));
    const entries = [
      ...rows.map((r) => ({ name: r.name, rank: r.rank, finished: r.finished, ...(r.isBot && r.progress !== null ? { progress: r.progress } : {}), row: r.id, other: -1 })),
      ...race.others.map((o, index) => ({ name: o.name, rank: o.rank, finished: o.finished, row: -1, other: index })),
    ].sort((a, b) => a.rank - b.rank);
    const ranked = rankByServer(entries, standings, bots);
    // BOT-05 : un bot calculé par le serveur prend aussi son arrivée
    const statusOf = (name: string) => {
      const s = standings.get(name.toLowerCase());
      if (!s) return {};
      return bots.has(name.toLowerCase()) ? { finished: !!s.finishedAt } : { abandoned: !!s.abandonedAt, finished: !!s.finishedAt && !s.abandonedAt };
    };
    // deux lignes qui échangent leur rang violeraient race_results_race_rank_unique (vérifiée ligne par ligne) : les
    // rangs passent d'abord hors de portée (au-dessus de RANK_SHIFT, la contrainte rank >= 1 interdit les négatifs)
    const moved = ranked.filter((e) => e.row >= 0 && e.rank !== rows.find((r) => r.id === e.row)!.rank).map((e) => e.row);
    if (moved.length) await db.update(raceResults).set({ rank: sql`${raceResults.rank} + ${RANK_SHIFT}` }).where(and(eq(raceResults.raceId, race.id), inArray(raceResults.playerId, moved)));
    for (const entry of ranked) {
      if (entry.row >= 0) await db.update(raceResults).set({ rank: entry.rank, ...statusOf(entry.name) }).where(and(eq(raceResults.raceId, race.id), eq(raceResults.playerId, entry.row)));
    }
    const others = race.others.map((o, index) => ({ ...o, rank: ranked.find((e) => e.other === index)!.rank, ...statusOf(o.name) }));
    await db.update(races).set({ others }).where(eq(races.id, race.id));
  }
}

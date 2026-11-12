// Enregistrer une course terminée et lire les statistiques d'un joueur (AUTH-06).
// À BRANCHER : le navigateur envoie lui-même les résultats ; le serveur de jeu devra les produire pour qu'on ne puisse pas les inventer.
import { avg, count, desc, eq, max, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { parseKeys, type KeyCounts } from "../players/keys";
import { players, raceConfigs, raceResults, races, raceSamples, user } from "../../db/schema";

const LANGUAGES = ["fr", "en"] as const;
const BOT_SPEEDS = ["slow", "medium", "fast", "mixed"] as const;
const BOT_ACCURACIES = ["shaky", "decent", "high"] as const;
const TEXT_TYPES = ["coherent", "quote", "words", "custom"] as const;
const TEXT_LENGTHS = ["very-short", "short", "medium", "long", "other"] as const;
const LEVELS = ["common", "rich", "expert"] as const;
const MISTAKE_MODES = ["fix", "carry-on", "fatal"] as const;
const MAX_SECONDS = 600;
/** Points du graphique de progression : les dernières courses. */
export const PROGRESS_LIMIT = 50;

export class InvalidRace extends Error {}

const fail = (what: string): never => {
  throw new InvalidRace(`Invalid race: ${what}`);
};
const oneOf = <T extends string>(list: readonly T[], value: unknown, what: string): T => (list.includes(value as T) ? (value as T) : fail(what));
const int = (value: unknown, what: string, min = 0, high = 100_000) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= high ? Math.round(n) : fail(what);
};
const decimal = (value: unknown, what: string, min = 0, high = 100) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= high ? n : fail(what);
};
const series = (value: unknown, what: string) =>
  (Array.isArray(value) && value.length <= MAX_SECONDS ? value : fail(what)).map((n) => int(n, what, 0, 10_000));

/** Vérifie ce que le navigateur envoie : rien d'autre n'entre en base. */
export function parseRace(body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  const s = (b.summary ?? fail("summary")) as Record<string, unknown>;
  const config = {
    language: oneOf(LANGUAGES, s.language, "language"),
    botSpeed: oneOf(BOT_SPEEDS, s.botSpeed, "botSpeed"),
    botAccuracy: oneOf(BOT_ACCURACIES, s.botAccuracy, "botAccuracy"),
    textType: oneOf(TEXT_TYPES, s.textType, "textType"),
    length: oneOf(TEXT_LENGTHS, s.length, "length"),
    wordCount: int(s.wordCount, "wordCount", 1, 1000),
    duration: int(s.duration, "duration", 1, MAX_SECONDS),
    level: oneOf(LEVELS, s.level, "level"),
    punctuation: !!s.punctuation,
    numbers: !!s.numbers,
    specials: !!s.specials,
    accents: !!s.accents,
    mistakes: oneOf(MISTAKE_MODES, s.mistakes, "mistakes"),
    excluded: String(s.excluded ?? "").slice(0, 20),
  };
  const list = Array.isArray(b.players) && b.players.length >= 1 && b.players.length <= 8 ? b.players : fail("players");
  const results = list.map((raw, index) => {
    const p = raw as Record<string, unknown>;
    const name = String(p.name ?? "").trim();
    if (!name || name.length > 20) fail("name");
    const [correct, wrong, extra, missed] = Array.isArray(p.chars) ? p.chars : fail("chars");
    return {
      name,
      bot: !!p.bot,
      rank: index + 1,
      wpm: int(p.wpm, "wpm", 0, 500),
      raw: int(p.raw, "raw", 0, 1000),
      accuracy: decimal(p.accuracy, "accuracy"),
      seconds: decimal(p.seconds, "seconds", 0, MAX_SECONDS),
      correctChars: int(correct, "chars"),
      wrongChars: int(wrong, "chars"),
      extraChars: int(extra, "chars"),
      missedChars: int(missed, "chars"),
      consistency: int(p.consistency, "consistency", 0, 100),
      idle: decimal(p.idle, "idle"),
      finished: !!p.finished,
      eliminated: !!p.eliminated,
      wpmSeries: series(p.wpmSeries, "wpmSeries"),
      rawSeries: series(p.rawSeries, "rawSeries"),
      errorSeries: series(p.errorSeries, "errorSeries"),
      keys: parseKeys(p.keys),
    };
  });
  return { config, content: String(b.content ?? "").slice(0, 10_000), sessionSeconds: int(s.sessionSeconds ?? 0, "sessionSeconds", 0, 10_000_000), results };
}

type ParsedRace = ReturnType<typeof parseRace>;

/** Le joueur d'un bot : créé à sa première course. Un nom pris par un humain n'est jamais repris. */
async function botPlayer(db: Db, name: string) {
  await db.insert(players).values({ name, isBot: true }).onConflictDoNothing();
  const [row] = await db.select({ id: players.id, isBot: players.isBot }).from(players).where(sql`lower(${players.name}) = lower(${name})`);
  return row?.isBot ? row.id : null;
}

/**
 * Enregistre la course. Seuls les bots y laissent un historique pour l'instant : un invité n'en a pas (AUTH-03)
 * et un compte connecté s'ajoutera ici avec l'authentification. Renvoie l'id de la course, ou null s'il n'y avait rien à garder.
 */
export async function recordRace(db: Db, race: ParsedRace) {
  const kept: (ParsedRace["results"][number] & { playerId: number })[] = [];
  for (const result of race.results) {
    const playerId = result.bot ? await botPlayer(db, result.name) : null;
    if (playerId) kept.push({ ...result, playerId });
  }
  if (!kept.length) return null;

  return db.transaction(async (tx) => {
    const [config] = await tx.insert(raceConfigs).values(race.config).returning({ id: raceConfigs.id });
    const longest = Math.max(...kept.map((result) => result.seconds));
    const [row] = await tx
      .insert(races)
      .values({ configId: config!.id, content: race.content, startedAt: new Date(Date.now() - longest * 1000), finishedAt: new Date() })
      .returning({ id: races.id });
    const raceId = row!.id;
    for (const { playerId, wpmSeries, rawSeries, errorSeries, name: _name, bot: _bot, ...result } of kept) {
      await tx.insert(raceResults).values({ ...result, raceId, playerId, sessionSeconds: race.sessionSeconds });
      if (wpmSeries.length) {
        await tx.insert(raceSamples).values(wpmSeries.map((wpm, second) => ({ raceId, playerId, second, wpm, raw: rawSeries[second] ?? 0, errors: errorSeries[second] ?? 0 })));
      }
    }
    return raceId;
  });
}

/** postgres-js (en ligne) renvoie un tableau de lignes, PGlite (tests) un objet { rows }. */
const rowsOf = <T>(result: unknown): T[] => (Array.isArray(result) ? result : ((result as { rows?: T[] }).rows ?? []));

/** Statistiques d'un joueur sur toutes ses courses, et sa progression (MPM course après course). */
export async function playerStats(db: Db, name: string) {
  const [player] = await db.select({ id: players.id, name: players.name, isBot: players.isBot }).from(players).where(sql`lower(${players.name}) = lower(${name})`);
  if (!player) return null;
  const [totals] = await db
    .select({ best: max(raceResults.wpm), averageWpm: avg(raceResults.wpm), averageAccuracy: avg(raceResults.accuracy), races: count(), wins: count(sql`case when ${raceResults.rank} = 1 then 1 end`) })
    .from(raceResults)
    .where(eq(raceResults.playerId, player.id));
  const recent = await db
    .select({ at: races.startedAt, wpm: raceResults.wpm, accuracy: raceResults.accuracy })
    .from(raceResults)
    .innerJoin(races, eq(races.id, raceResults.raceId))
    .where(eq(raceResults.playerId, player.id))
    .orderBy(desc(races.startedAt))
    .limit(PROGRESS_LIMIT);
  // frappes et fautes par touche, cumulées sur toutes ses courses
  const keyRows = await db.execute<{ key: string; typed: number; errors: number }>(sql`
    SELECT k.key, sum((k.value->>0)::real) AS typed, sum((k.value->>1)::real) AS errors
    FROM ${raceResults}, jsonb_each(${raceResults.keys}) AS k
    WHERE ${raceResults.playerId} = ${player.id}
    GROUP BY k.key`);
  const keys: KeyCounts = Object.fromEntries(rowsOf<{ key: string; typed: number; errors: number }>(keyRows).map((row) => [row.key, [Number(Number(row.typed).toFixed(1)), Number(Number(row.errors).toFixed(1))]]));
  // la photo de son compte, s'il en a un (AUTH-04)
  const [account] = await db.select({ image: user.image }).from(user).where(eq(user.playerId, player.id));
  const round = (value: string | number | null | undefined, digits = 0) => (value == null ? null : Number(Number(value).toFixed(digits)));
  return {
    name: player.name,
    bot: player.isBot,
    image: account?.image ?? null,
    races: totals?.races ?? 0,
    wins: totals?.wins ?? 0,
    bestWpm: totals?.best ?? null,
    averageWpm: round(totals?.averageWpm),
    averageAccuracy: round(totals?.averageAccuracy, 1),
    keys,
    progress: recent.reverse().map((point) => ({ at: point.at.toISOString(), wpm: point.wpm, accuracy: point.accuracy })),
  };
}

export type PlayerStats = NonNullable<Awaited<ReturnType<typeof playerStats>>>;

// HIST-01 : l'historique des courses du compte connecté, paginé (GET /api/history?page=N).
// Le joueur vient de la session, jamais de la requête ; un invité n'a pas d'historique (AUTH-03).
// HIST-02 : le détail d'une de ses courses (GET /api/history/<id>), de quoi réafficher sa page de résultats.
import { asc, count, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../../db/client";
import { players, raceConfigs, raceResults, races, raceSamples } from "../../db/schema";
import type { Auth } from "./auth";
import { guestSecret, readGuest } from "./guest";

export const HISTORY_PAGE_SIZE = 10;

const json = (body: unknown, status = 200) => Response.json(body, { status });

/** Page à partir de 1, écrite en chiffres sans zéro devant ; au-delà de 9 chiffres, refusée. */
const PageSchema = z.string().regex(/^[1-9]\d{0,8}$/).transform(Number);

/** Une page de l'historique d'un joueur, de la plus récente à la plus ancienne. Une page au-delà de la fin est vide. */
export async function listHistory(db: Db, playerId: number, page: number, pageSize = HISTORY_PAGE_SIZE) {
  const [totals] = await db.select({ total: count() }).from(raceResults).where(eq(raceResults.playerId, playerId));
  const total = totals?.total ?? 0;
  const rows = await db
    .select({
      id: races.id,
      at: races.startedAt,
      rank: raceResults.rank,
      wpm: raceResults.wpm,
      accuracy: raceResults.accuracy,
      seconds: raceResults.seconds,
      finished: raceResults.finished,
      eliminated: raceResults.eliminated,
      textType: raceConfigs.textType,
      language: raceConfigs.language,
      wordCount: raceConfigs.wordCount,
    })
    .from(raceResults)
    .innerJoin(races, eq(races.id, raceResults.raceId))
    .innerJoin(raceConfigs, eq(raceConfigs.id, races.configId))
    .where(eq(raceResults.playerId, playerId))
    .orderBy(desc(races.startedAt), desc(races.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  // le nombre de participants enregistrés de chaque course de la page
  const ids = rows.map((row) => row.id);
  const counted = ids.length
    ? await db.select({ raceId: raceResults.raceId, size: count() }).from(raceResults).where(inArray(raceResults.raceId, ids)).groupBy(raceResults.raceId)
    : [];
  const sizes = new Map(counted.map((row) => [row.raceId, row.size]));
  return {
    page,
    pageSize,
    total,
    pages: Math.ceil(total / pageSize),
    races: rows.map((row) => ({ ...row, at: row.at.toISOString(), players: sizes.get(row.id) ?? 1 })),
  };
}

export type HistoryPage = Awaited<ReturnType<typeof listHistory>>;

/** Identifiant de course : un entier positif de la colonne integer de Postgres, écrit sans zéro devant. */
const RaceIdSchema = z.string().regex(/^[1-9]\d{0,9}$/).transform(Number).pipe(z.number().max(2_147_483_647));

/** Course inexistante ou course d'un autre : même refus, pour qu'on ne puisse pas deviner quels ids existent. */
export class HistoryRefused extends Error {
  readonly reason = "not_found";
  constructor() {
    super("not_found");
  }
}

/**
 * Une course de l'historique, au format des résultats que le jeu confie au podium (RaceResults) :
 * les participants enregistrés dans l'ordre d'arrivée, toutes les colonnes de RES-02 et les séries par seconde (RES-03).
 * Refusée de la même façon si la course n'existe pas ou si le joueur n'y a pas participé.
 */
export async function raceDetail(db: Db, playerId: number, raceId: number) {
  const [race] = await db
    .select({
      at: races.startedAt,
      language: raceConfigs.language,
      botSpeed: raceConfigs.botSpeed,
      botAccuracy: raceConfigs.botAccuracy,
      textType: raceConfigs.textType,
      length: raceConfigs.length,
      wordCount: raceConfigs.wordCount,
      duration: raceConfigs.duration,
      level: raceConfigs.level,
      punctuation: raceConfigs.punctuation,
      numbers: raceConfigs.numbers,
      specials: raceConfigs.specials,
      accents: raceConfigs.accents,
      mistakes: raceConfigs.mistakes,
      excluded: raceConfigs.excluded,
    })
    .from(races)
    .innerJoin(raceConfigs, eq(raceConfigs.id, races.configId))
    .where(eq(races.id, raceId));
  if (!race) throw new HistoryRefused();
  const rows = await db
    .select({ result: raceResults, name: players.name, bot: players.isBot })
    .from(raceResults)
    .innerJoin(players, eq(players.id, raceResults.playerId))
    .where(eq(raceResults.raceId, raceId))
    .orderBy(asc(raceResults.rank));
  const mine = rows.find((row) => row.result.playerId === playerId);
  if (!mine) throw new HistoryRefused();
  const samples = await db
    .select({ playerId: raceSamples.playerId, wpm: raceSamples.wpm, raw: raceSamples.raw, errors: raceSamples.errors })
    .from(raceSamples)
    .where(eq(raceSamples.raceId, raceId))
    .orderBy(asc(raceSamples.playerId), asc(raceSamples.second));

  const { at, ...config } = race;
  return {
    id: raceId,
    at: at.toISOString(),
    summary: { ...config, sessionSeconds: mine.result.sessionSeconds },
    players: rows.map(({ result, name, bot }) => {
      const series = samples.filter((sample) => sample.playerId === result.playerId);
      return {
        name,
        me: result.playerId === playerId,
        bot,
        rank: result.rank,
        wpm: result.wpm,
        raw: result.raw,
        accuracy: result.accuracy,
        seconds: result.seconds,
        chars: [result.correctChars, result.wrongChars, result.extraChars, result.missedChars],
        consistency: result.consistency,
        idle: result.idle,
        finished: result.finished,
        eliminated: result.eliminated,
        wpmSeries: series.map((sample) => sample.wpm),
        rawSeries: series.map((sample) => sample.raw),
        errorSeries: series.map((sample) => sample.errors),
        keys: result.keys,
      };
    }),
  };
}

export type RaceDetail = Awaited<ReturnType<typeof raceDetail>>;

/** Le joueur du compte de la session ; "guest" pour un invité signé ; null sans session. */
async function accountOf(req: Request, auth: Auth, secret: string): Promise<number | "guest" | "none" | null> {
  const session = await auth.api.getSession({ headers: req.headers }).catch(() => null);
  if (session) return (session.user as { playerId?: number | null }).playerId ?? "none";
  return readGuest(req.headers, secret) ? "guest" : null;
}

/** GET /api/history?page=N (HIST-01) et GET /api/history/<id> (HIST-02). */
export async function handleHistory(req: Request, db: Db, auth: Auth, secret = guestSecret()): Promise<Response> {
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  const who = await accountOf(req, auth, secret);
  if (who === null) return json({ error: "unauthorized" }, 401);
  if (who === "guest") return json({ error: "account_required" }, 403);
  const url = new URL(req.url);
  const detail = url.pathname.match(/^\/api\/history\/([^/]+)\/?$/);
  if (detail) {
    const raceId = RaceIdSchema.safeParse(detail[1]);
    if (!raceId.success) return json({ error: "invalid_race" }, 400);
    if (who === "none") return json({ error: "not_found" }, 404);
    try {
      return json(await raceDetail(db, who, raceId.data));
    } catch (error) {
      if (error instanceof HistoryRefused) return json({ error: error.reason }, 404);
      throw error;
    }
  }
  const raw = url.searchParams.get("page");
  const page = PageSchema.safeParse(raw ?? "1");
  if (!page.success) return json({ error: "invalid_page" }, 400);
  if (who === "none") return json({ page: page.data, pageSize: HISTORY_PAGE_SIZE, total: 0, pages: 0, races: [] });
  return json(await listHistory(db, who, page.data));
}

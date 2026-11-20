// HIST-01 : l'historique des courses du compte connecté, paginé (GET /api/history?page=N).
// Le joueur vient de la session, jamais de la requête ; un invité n'a pas d'historique (AUTH-03).
// HIST-02 : le détail d'une de ses courses (GET /api/history/<id>), de quoi réafficher sa page de résultats.
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../../db/client";
import { players, raceConfigs, raceResults, races, raceSamples, roomMembers, rooms } from "../../db/schema";
import { raceClock } from "../rooms/race-clock";
import { memberKey, RoomRefused, type Identity } from "./rooms";
import type { Auth } from "./auth";
import { guestSecret, readGuest } from "./guest";
import { recordFlags } from "./records";

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
      others: sql<number>`jsonb_array_length(${races.others})`,
      ...recordFlags, // RES-04
    })
    .from(raceResults)
    .innerJoin(races, eq(races.id, raceResults.raceId))
    .innerJoin(raceConfigs, eq(raceConfigs.id, races.configId))
    .where(eq(raceResults.playerId, playerId))
    .orderBy(desc(races.startedAt), desc(races.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  // le nombre de participants de chaque course de la page : ceux qui ont un historique, plus les autres (invités, humains)
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
    races: rows.map(({ others, ...row }) => ({ ...row, at: row.at.toISOString(), players: (sizes.get(row.id) ?? 1) + Number(others) })),
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
 * tous les participants dans l'ordre d'arrivée, chacun à son rang (ceux qui ont un historique et les autres), toutes les colonnes de RES-02 et les séries par seconde (RES-03).
 * Refusée de la même façon si la course n'existe pas ou si le joueur n'y a pas participé.
 */
export async function raceDetail(db: Db, playerId: number, raceId: number) {
  return raceDetailFor(db, raceId, { playerId }, true);
}

/**
 * La course au format RaceResults, vue par `viewer` : « moi » est son joueur, ou son nom (un invité, COURSE-10).
 * `participant` : refusée si le viewer n'y a pas de ligne enregistrée (HIST-02) ; sinon servie à tout membre du salon.
 */
async function raceDetailFor(db: Db, raceId: number, viewer: { playerId?: number | null; name?: string | null }, participant: boolean) {
  const named = (name: string) => !!viewer.name && name.toLowerCase() === viewer.name.toLowerCase();
  const [race] = await db
    .select({
      at: races.startedAt,
      others: races.others,
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
      capitals: raceConfigs.capitals,
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
  const isMe = (playerId: number, name: string) => (viewer.playerId ? playerId === viewer.playerId : named(name));
  const mine = rows.find((row) => isMe(row.result.playerId, row.name));
  if (participant && !mine) throw new HistoryRefused();
  const samples = await db
    .select({ playerId: raceSamples.playerId, wpm: raceSamples.wpm, raw: raceSamples.raw, errors: raceSamples.errors })
    .from(raceSamples)
    .where(eq(raceSamples.raceId, raceId))
    .orderBy(asc(raceSamples.playerId), asc(raceSamples.second));

  const { at, others, ...config } = race;
  const recorded = rows.map(({ result, name, bot }) => {
    const series = samples.filter((sample) => sample.playerId === result.playerId);
    return {
      name,
      me: isMe(result.playerId, name),
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
      abandoned: result.abandoned, // COURSE-10
      wpmSeries: series.map((sample) => sample.wpm),
      rawSeries: series.map((sample) => sample.raw),
      errorSeries: series.map((sample) => sample.errors),
      keys: result.keys,
    };
  });
  // sans historique : jamais « moi », jamais un bot (le flag venait du navigateur)
  const unrecorded = others.map(({ correctChars, wrongChars, extraChars, missedChars, ...other }) => ({
    ...other,
    me: named(other.name),
    bot: false,
    chars: [correctChars, wrongChars, extraChars, missedChars],
  }));
  return {
    id: raceId,
    at: at.toISOString(),
    summary: { ...config, sessionSeconds: mine?.result.sessionSeconds ?? 0 },
    players: [...recorded, ...unrecorded].sort((a, b) => a.rank - b.rank),
  };
}

/**
 * COURSE-10 : GET /api/rooms/:code/results, la dernière course enregistrée par un membre pour le lancement en cours de
 * ce salon (races.room_id, départ serveur), vue par ce membre. Le podium d'un joueur qui a abandonné puis rechargé y relit
 * l'état final des autres. not_found : pas membre (SALLE-10), salon inconnu, ou rien d'enregistré pour ce lancement.
 */
export async function roomRaceResults(db: Db, code: string, who: Identity): Promise<RaceDetail> {
  const [row] = await db
    .select({ roomId: rooms.id, launchedAt: rooms.launchedAt, duration: raceConfigs.duration })
    .from(rooms)
    .innerJoin(raceConfigs, eq(raceConfigs.id, rooms.configId))
    .innerJoin(roomMembers, and(eq(roomMembers.roomId, rooms.id), eq(roomMembers.memberKey, memberKey(who))))
    .where(eq(rooms.code, code));
  const { startsAt } = raceClock(row?.launchedAt ?? null, row?.duration ?? null);
  if (!row || startsAt === null) throw new RoomRefused("not_found");
  const [race] = await db
    .select({ id: races.id })
    .from(races)
    .where(and(eq(races.roomId, row.roomId), eq(races.startedAt, new Date(startsAt))))
    .orderBy(desc(races.id))
    .limit(1);
  if (!race) throw new RoomRefused("not_found");
  const detail = await raceDetailFor(db, race.id, { playerId: who.kind === "account" ? who.playerId : null, name: who.name }, false);
  const own = await ownMeasures(db, row.roomId, new Date(startsAt));
  // RES-02 : un humain n'est mesuré que par sa propre course ; sans elle (pas encore envoyée), sa ligne reste sans mesure
  const players = detail.players.map((p) => (p.bot ? p : { ...p, ...(own.get(p.name.toLowerCase()) ?? UNMEASURED) }));
  return { ...detail, players };
}

type Measures = { raw: number; accuracy: number; chars: number[] };
const UNMEASURED: Measures = { raw: 0, accuracy: 0, chars: [0, 0, 0, 0] };

/**
 * RES-02 : ce que chaque humain d'un lancement a lui-même envoyé (POST /api/races), par nom en minuscules. Un compte :
 * sa ligne de race_results, gardée sous sa session. Un invité n'a pas de ligne à lui : sa ligne dans la course qu'il a
 * envoyée (races.guest, tiré de son cookie signé). La ligne qu'un membre écrit pour un autre n'est jamais crue.
 */
async function ownMeasures(db: Db, roomId: number, startedAt: Date): Promise<Map<string, Measures>> {
  const launch = await db.select({ id: races.id, guest: races.guest, others: races.others }).from(races).where(and(eq(races.roomId, roomId), eq(races.startedAt, startedAt)));
  const own = new Map<string, Measures>();
  if (!launch.length) return own;
  const accounts = await db
    .select({ name: players.name, raw: raceResults.raw, accuracy: raceResults.accuracy, correct: raceResults.correctChars, wrong: raceResults.wrongChars, extra: raceResults.extraChars, missed: raceResults.missedChars })
    .from(raceResults)
    .innerJoin(players, eq(players.id, raceResults.playerId))
    .where(and(inArray(raceResults.raceId, launch.map((r) => r.id)), eq(players.isBot, false)));
  for (const { guest, others } of launch) {
    const o = guest ? others.find((other) => other.name.toLowerCase() === guest.toLowerCase()) : undefined;
    if (o) own.set(o.name.toLowerCase(), { raw: o.raw, accuracy: o.accuracy, chars: [o.correctChars, o.wrongChars, o.extraChars, o.missedChars] });
  }
  // un compte n'est mesuré que par sa ligne de race_results, même si un invité porte son nom
  for (const a of accounts) own.set(a.name.toLowerCase(), { raw: a.raw, accuracy: a.accuracy, chars: [a.correct, a.wrong, a.extra, a.missed] });
  return own;
}

export type RaceDetail = Awaited<ReturnType<typeof raceDetail>>;

/** Le joueur du compte de la session ; "guest" pour un invité signé ; null sans session. */
async function accountOf(headers: Headers, auth: Auth, secret: string): Promise<number | "guest" | "none" | null> {
  const session = await auth.api.getSession({ headers }).catch(() => null);
  if (session) return (session.user as { playerId?: number | null }).playerId ?? "none";
  return readGuest(headers, secret) ? "guest" : null;
}

const HTTP_STATUS = { unauthorized: 401, account_required: 403, invalid_race: 400, not_found: 404 } as const;
export type RaceLoad = { results: RaceDetail } | { error: keyof typeof HTTP_STATUS };

/**
 * HIST-02 : une course de l'historique pour ces en-têtes, ou le refus. Partagé par GET /api/history/<id>
 * et par la page /podium?race=<id>, rendue côté serveur (TECH-01) : mêmes contrôles, mêmes codes, dans le même ordre.
 */
export async function loadHistoryRace(headers: Headers, auth: Auth, db: Db, rawId: string, secret = guestSecret()): Promise<RaceLoad> {
  const who = await accountOf(headers, auth, secret);
  if (who === null) return { error: "unauthorized" };
  if (who === "guest") return { error: "account_required" };
  const raceId = RaceIdSchema.safeParse(rawId);
  if (!raceId.success) return { error: "invalid_race" };
  if (who === "none") return { error: "not_found" };
  try {
    return { results: await raceDetail(db, who, raceId.data) };
  } catch (error) {
    if (error instanceof HistoryRefused) return { error: error.reason };
    throw error;
  }
}

/** GET /api/history?page=N (HIST-01) et GET /api/history/<id> (HIST-02). */
export async function handleHistory(req: Request, db: Db, auth: Auth, secret = guestSecret()): Promise<Response> {
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  const url = new URL(req.url);
  const detail = url.pathname.match(/^\/api\/history\/([^/]+)\/?$/);
  if (detail) {
    const loaded = await loadHistoryRace(req.headers, auth, db, detail[1]!, secret);
    return "results" in loaded ? json(loaded.results) : json({ error: loaded.error }, HTTP_STATUS[loaded.error]);
  }
  const who = await accountOf(req.headers, auth, secret);
  if (who === null) return json({ error: "unauthorized" }, 401);
  if (who === "guest") return json({ error: "account_required" }, 403);
  const raw = url.searchParams.get("page");
  const page = PageSchema.safeParse(raw ?? "1");
  if (!page.success) return json({ error: "invalid_page" }, 400);
  if (who === "none") return json({ page: page.data, pageSize: HISTORY_PAGE_SIZE, total: 0, pages: 0, races: [] });
  return json(await listHistory(db, who, page.data));
}

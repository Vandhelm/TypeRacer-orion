// Enregistrer une course terminée et lire les statistiques d'un joueur (AUTH-06).
// Qui envoie la course vient de sa session (compte ou cookie d'invité signé), jamais du corps de la requête.
// COURSE-06 : la course doit avoir été lancée par le serveur, dans un salon dont l'expéditeur est membre ; un résultat
// qui contredit le serveur (plus long que la course, plus rapide qu'un humain) est refusé ; l'arrivée et le départ
// sont ceux du serveur (corrigés) ; un seul enregistrement par membre et par lancement.
import { and, avg, count, desc, eq, inArray, max, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../../db/client";
import type { Auth } from "./auth";
import { guestSecret } from "./guest";
import { storedAvatar } from "../players/avatar";
import { BOT_NAMES, isBotName } from "../players/bots";
import { KeysSchema, type KeyCounts } from "../players/keys";
import { DurationSchema, MAX_DURATION } from "../rooms/settings";
import { CODE_PATTERN } from "../rooms/access";
import { raceClock } from "../rooms/race-clock";
import { effectiveComposition } from "../rooms/text";
import { MAX_HUMAN_WPM } from "../realtime/referee";
import { players, raceConfigs, raceResults, races, raceSamples, roomMembers, rooms, user, type RaceOther } from "../../db/schema";
import { readGuestSession } from "./guest";
import { memberKey } from "./rooms";

const LANGUAGES = ["fr", "en"] as const;
const BOT_SPEEDS = ["slow", "medium", "fast", "mixed"] as const;
const BOT_ACCURACIES = ["shaky", "decent", "high"] as const;
const TEXT_TYPES = ["coherent", "quote", "words", "custom"] as const;
const TEXT_LENGTHS = ["very-short", "short", "medium", "long", "other"] as const;
const LEVELS = ["common", "rich", "expert"] as const;
const MISTAKE_MODES = ["fix", "carry-on", "fatal"] as const;
/**
 * CONF-01 : sans limite de temps, une course reçue peut durer jusqu'à une heure (garde-fou de taille du corps :
 * 8 joueurs × 3 séries de 3 600 points restent sous MAX_BODY_BYTES). Une course chronométrée, jusqu'à MAX_DURATION.
 */
const UNLIMITED_SECONDS = 3600;
/** Points du graphique de progression : les dernières courses. */
export const PROGRESS_LIMIT = 50;

/**
 * Taille maximale du corps de POST /api/races, en octets. Un corps réel : 8 joueurs, 3 séries de 600 points (~3 Ko chacune)
 * et 200 touches (~6 Ko) soit ~120 Ko, plus le texte (10 Ko). 512 Ko laisse une marge large ; au-delà : 413, avant tout parse.
 */
export const MAX_BODY_BYTES = 512 * 1024;

class BodyTooLarge extends Error {}

/** Lit le corps en s'arrêtant dès que la limite est dépassée : l'en-tête content-length n'est pas cru seul. */
async function readBody(req: Request) {
  if (Number(req.headers.get("content-length")) > MAX_BODY_BYTES) throw new BodyTooLarge();
  const reader = req.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    size += chunk.value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new BodyTooLarge();
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
  return text + decoder.decode();
}

export class InvalidRace extends Error {}
/** La même course, déjà reçue (même identifiant) : un rejeu. */
export class DuplicateRace extends Error {}
/** COURSE-06 : la course n'a pas été lancée par le serveur, ou la contredit. */
export class RaceRefused extends Error {
  constructor(readonly reason: "race_not_launched" | "race_contradicted") {
    super(reason);
  }
}

const fail = (what: string): never => {
  throw new InvalidRace(`Invalid race: ${what}`);
};

// TECH-07 : le corps de POST /api/races passe par ce schéma, rien d'autre n'entre en base.
// Un champ inconnu est ignoré (retiré), pas refusé : le navigateur envoie aussi `me` et d'autres réglages de la salle,
// et rien de ce qui n'est pas lu ici n'atteint la base.
const int = (min = 0, high = 100_000) => z.number().finite().min(min).max(high).transform(Math.round);
const decimal = (min = 0, high = 100) => z.number().finite().min(min).max(high);
const series = z.array(int(0, 10_000)).max(UNLIMITED_SECONDS);
const flag = z.boolean().default(false);

const SummarySchema = z.object({
  language: z.enum(LANGUAGES),
  botSpeed: z.enum(BOT_SPEEDS),
  botAccuracy: z.enum(BOT_ACCURACIES),
  textType: z.enum(TEXT_TYPES),
  length: z.enum(TEXT_LENGTHS),
  wordCount: int(1, 1000),
  duration: DurationSchema,
  level: z.enum(LEVELS),
  punctuation: flag,
  numbers: flag,
  specials: flag,
  accents: flag,
  // CONF-06 : sans l'option (client d'avant), le texte avait ses majuscules
  capitals: z.boolean().default(true),
  mistakes: z.enum(MISTAKE_MODES),
  excluded: z.string().default("").transform((value) => value.slice(0, 20)),
  sessionSeconds: int(0, 10_000_000).default(0),
});

const PlayerSchema = z.object({
  name: z.string().trim().min(1).max(20),
  bot: flag,
  wpm: int(0, 500),
  raw: int(0, 1000),
  accuracy: decimal(),
  seconds: decimal(0, UNLIMITED_SECONDS),
  chars: z.tuple([int(), int(), int(), int()]),
  consistency: int(0, 100),
  idle: decimal(),
  finished: flag,
  eliminated: flag,
  wpmSeries: series,
  rawSeries: series,
  errorSeries: series,
  keys: KeysSchema.default({}),
});

const RaceSchema = z.object({
  // l'identifiant de la course (AUTH-06) : facultatif ici, exigé par la route
  id: z.uuid().optional(),
  // COURSE-06 : le salon de la course, lancé par le serveur : facultatif ici, exigé par la route
  room: z.string().regex(new RegExp(CODE_PATTERN)).optional(),
  summary: SummarySchema,
  content: z.string().default("").transform((value) => value.slice(0, 10_000)),
  players: z.array(PlayerSchema).min(1).max(8),
}).superRefine(({ summary, players: list }, ctx) => {
  // CONF-01 : une course chronométrée ne dure pas plus que la durée maximale ; seule une course sans limite va au-delà
  const limit = summary.duration === null ? UNLIMITED_SECONDS : MAX_DURATION;
  list.forEach((player, index) => {
    const longest = Math.max(player.seconds, player.wpmSeries.length, player.rawSeries.length, player.errorSeries.length);
    if (longest > limit) ctx.addIssue({ code: "custom", path: ["players", index, "seconds"], message: "longer than the race" });
  });
});

/** Le champ en cause, pour le message d'erreur : la dernière clé nommée du chemin (« players.0.chars.1 » → « chars »). */
const fieldOf = (path: PropertyKey[]) => [...path].reverse().find((key): key is string => typeof key === "string") ?? "body";

/** Vérifie ce que le navigateur envoie. Toute forme invalide lève InvalidRace (400), jamais une autre erreur. */
export function parseRace(body: unknown) {
  const parsed = RaceSchema.safeParse(body);
  if (!parsed.success) return fail(fieldOf(parsed.error.issues[0]?.path ?? []));
  const { id, room, summary, content, players: list } = parsed.data;
  // CONF-07 : le résumé vient du navigateur ; une option sans effet sur ce type de texte est enregistrée « non »
  const { sessionSeconds, ...config } = effectiveComposition(summary);
  const results = list.map(({ chars: [correctChars, wrongChars, extraChars, missedChars], ...player }, index) => ({
    ...player,
    rank: index + 1,
    correctChars,
    wrongChars,
    extraChars,
    missedChars,
  }));
  return { id: id ?? null, room: room ?? null, config, content, sessionSeconds, results };
}

type ParsedRace = ReturnType<typeof parseRace>;

/** Le joueur d'un bot : créé à sa première course, seulement pour un nom de la liste des bots. Un nom pris par un humain n'est jamais repris. */
async function botPlayer(db: Db, name: string) {
  if (!isBotName(name)) return null;
  await db.insert(players).values({ name, isBot: true }).onConflictDoNothing();
  const [row] = await db.select({ id: players.id, isBot: players.isBot }).from(players).where(sql`lower(${players.name}) = lower(${name})`);
  return row?.isBot ? row.id : null;
}

/** Qui envoie la course, d'après sa session : le joueur de son compte, ou son pseudonyme d'invité. */
export type Requester = { playerId?: number | null; guest?: string | null };

const sameName = (a: string, b: string | null | undefined) => !!b && a.toLowerCase() === b.toLowerCase();

/**
 * Enregistre la course. Gardés : le résultat du compte connecté (repéré par le nom de son joueur, jamais par le flag « bot »)
 * et les bots. Un invité n'a pas d'historique (AUTH-03), même s'il se dit bot, et les autres humains non plus :
 * ils sont seulement gardés avec la course (`others`, sans le flag « bot »), pour la réafficher en entier (HIST-02).
 * Renvoie l'id de la course, ou null s'il n'y avait rien à garder.
 */
/** COURSE-06 : la place d'un membre participant au classement du serveur (temps réel, room_members). */
/** COURSE-07 : abandonedAt, l'abandon de ce membre ; progress est alors celle validée au moment de l'abandon. */
export type ServerStanding = { finishedAt: Date | null; progress: number; abandonedAt?: Date | null };
/** COURSE-06 : ce que le serveur sait de la course : son départ, si l'expéditeur est arrivé, et le classement des humains (par nom en minuscules). */
/** COURSE-07 : abandoned, l'expéditeur a abandonné (vu par le serveur, jamais par le corps). */
export type ServerRace = { startedAt: Date; finished: boolean; abandoned?: boolean; standings?: Map<string, ServerStanding>; bots?: Set<string> };

/**
 * COURSE-06 : les rangs du corps refaits d'après le serveur. `bots` : les bots du salon, décidés par le serveur (jamais
 * le drapeau du corps) ; tout le reste est humain. Ordre : les humains que le serveur a vus arriver (par heure
 * d'arrivée), puis les bots (simulés par le navigateur, BOT-* : dans l'ordre du corps, que le serveur ne peut pas encore
 * vérifier), puis les humains non arrivés selon le serveur (par progression validée), puis les humains inconnus du
 * serveur. Ainsi un client ne gagne rien en plaçant les bots : aucun bot devant un humain arrivé, aucun humain non
 * arrivé devant un bot.
 */
export function rankByServer<T extends { name: string; rank: number }>(results: T[], server: Map<string, ServerStanding>, bots: Set<string> = new Set()): T[] {
  const isBot = (r: T) => bots.has(r.name.toLowerCase());
  const standing = (r: T) => server.get(r.name.toLowerCase());
  const humans = results.filter((r) => !isBot(r));
  const arrived = humans.filter((r) => standing(r)?.finishedAt).sort((a, b) => standing(a)!.finishedAt!.getTime() - standing(b)!.finishedAt!.getTime());
  const racing = humans.filter((r) => standing(r) && !standing(r)!.finishedAt).sort((a, b) => standing(b)!.progress - standing(a)!.progress);
  const unknown = humans.filter((r) => !standing(r));
  return [...arrived, ...results.filter(isBot), ...racing, ...unknown].map((r, index) => ({ ...r, rank: index + 1 }));
}

export async function recordRace(db: Db, parsed: ParsedRace, requester: Requester = {}, server?: ServerRace) {
  // COURSE-06 : avec le serveur, le statut bot vient de lui (les bots du salon), jamais du corps ; le rang aussi
  const serverBots = server?.bots;
  // COURSE-07 : l'abandon d'un humain est celui que le serveur a noté (room_members.abandoned_at), jamais le corps ;
  // un abandon n'est pas une arrivée
  const abandonedOf = (name: string) => !!server?.standings?.get(name.toLowerCase())?.abandonedAt;
  const results = (serverBots ? parsed.results.map((r) => ({ ...r, bot: serverBots.has(r.name.toLowerCase()) })) : parsed.results).map((r) => {
    const abandoned = !r.bot && abandonedOf(r.name);
    return { ...r, abandoned, finished: r.finished && !abandoned };
  });
  const race = server?.standings ? { ...parsed, results: rankByServer(results, server.standings, serverBots) } : { ...parsed, results };
  const [account] = requester.playerId
    ? await db.select({ id: players.id, name: players.name }).from(players).where(eq(players.id, requester.playerId))
    : [];
  const kept: (ParsedRace["results"][number] & { playerId: number })[] = [];
  const others: RaceOther[] = [];
  let accountKept = false;
  for (const result of race.results) {
    let playerId: number | null = null;
    if (account && sameName(result.name, account.name)) {
      if (accountKept) continue;
      accountKept = true;
      playerId = account.id;
      if (server) result.finished = server.finished; // COURSE-06 : l'arrivée est celle que le serveur a vue
      if (server) result.abandoned = !!server.abandoned;
    } else if (result.bot && !sameName(result.name, requester.guest)) playerId = await botPlayer(db, result.name);
    if (playerId) kept.push({ ...result, playerId });
    else {
      const { bot: _bot, ...other } = result;
      others.push(other);
    }
  }
  if (!kept.length) return null;

  return db.transaction(async (tx) => {
    const [config] = await tx.insert(raceConfigs).values(race.config).returning({ id: raceConfigs.id });
    const longest = Math.max(...kept.map((result) => result.seconds));
    const startedAt = server?.startedAt ?? new Date(Date.now() - longest * 1000);
    const [row] = await tx
      .insert(races)
      .values({ clientId: race.id, configId: config!.id, content: race.content, others, startedAt, finishedAt: new Date() })
      .onConflictDoNothing({ target: races.clientId })
      .returning({ id: races.id });
    if (!row) throw new DuplicateRace("Race already recorded");
    const raceId = row.id;
    for (const { playerId, wpmSeries, rawSeries, errorSeries, name: _name, bot: _bot, ...result } of kept) {
      await tx.insert(raceResults).values({ ...result, raceId, playerId, sessionSeconds: race.sessionSeconds });
      if (wpmSeries.length) {
        await tx.insert(raceSamples).values(wpmSeries.map((wpm, second) => ({ raceId, playerId, second, wpm, raw: rawSeries[second] ?? 0, errors: errorSeries[second] ?? 0 })));
      }
    }
    return raceId;
  });
}

/** Écart toléré entre le temps de course déclaré et le temps écoulé depuis le départ serveur (réseau, horloges). */
export const ELAPSED_TOLERANCE_SECONDS = 2;

/**
 * COURSE-06 : la course de ce membre, telle que le serveur l'a lancée. Refus « race_not_launched » : pas de salon, pas
 * membre, jamais lancé (ou fermé) ; « race_contradicted » : un joueur du corps a couru plus longtemps que la course du
 * serveur, ou plus vite qu'un humain (MAX_HUMAN_WPM) ; DuplicateRace : ce membre a déjà enregistré ce lancement
 * (réservé ici, sous une écriture conditionnelle : deux envois simultanés n'en gardent qu'un).
 * Renvoie le départ serveur, l'arrivée vue par le temps réel, et de quoi annuler la réservation si l'écriture échoue.
 */
export async function claimServerRace(db: Db, race: ParsedRace, key: string | null): Promise<ServerRace & { release: () => Promise<void> }> {
  if (!race.room || !key) throw new RaceRefused("race_not_launched");
  const [row] = await db
    .select({ roomId: rooms.id, launchedAt: rooms.launchedAt, duration: raceConfigs.duration, progress: roomMembers.progress, abandonedAt: roomMembers.abandonedAt, bots: rooms.bots, guests: rooms.guests })
    .from(rooms)
    .innerJoin(raceConfigs, eq(raceConfigs.id, rooms.configId))
    .innerJoin(roomMembers, and(eq(roomMembers.roomId, rooms.id), eq(roomMembers.memberKey, key)))
    .where(and(eq(rooms.code, race.room), inArray(rooms.status, ["racing", "results"])));
  const { startsAt } = raceClock(row?.launchedAt ?? null, row?.duration ?? null);
  if (!row || startsAt === null) throw new RaceRefused("race_not_launched");
  const elapsed = (Date.now() - startsAt) / 1000 + ELAPSED_TOLERANCE_SECONDS;
  if (race.results.some((result) => result.seconds > elapsed || result.wpm > MAX_HUMAN_WPM)) throw new RaceRefused("race_contradicted");
  const member = and(eq(roomMembers.roomId, row.roomId), eq(roomMembers.memberKey, key));
  const claimed = await db.update(roomMembers).set({ raceRecorded: true }).where(and(member, eq(roomMembers.raceRecorded, false))).returning({ key: roomMembers.memberKey });
  if (!claimed.length) throw new DuplicateRace("Race already recorded");
  const runners = await db
    .select({ name: sql<string>`coalesce(${players.name}, ${roomMembers.guestName})`, isBot: sql<boolean>`coalesce(${players.isBot}, false)`, finishedAt: roomMembers.finishedAt, progress: roomMembers.progress, abandonedAt: roomMembers.abandonedAt })
    .from(roomMembers)
    .leftJoin(players, eq(players.id, roomMembers.playerId))
    .where(and(eq(roomMembers.roomId, row.roomId), eq(roomMembers.role, "player")));
  // les bots du salon : ses membres bots, puis les places libres remplies par la liste fermée, comme la page salle
  // (seatsOf) ; jamais un nom porté par un membre humain
  const humans = runners.filter((r) => !r.isBot);
  const humanNames = new Set(humans.map((r) => r.name.toLowerCase()));
  const seatBots = row.bots ? BOT_NAMES.slice(0, Math.max(0, row.guests - runners.length)) : [];
  const bots = new Set([...runners.filter((r) => r.isBot).map((r) => r.name), ...seatBots].map((name) => name.toLowerCase()).filter((name) => !humanNames.has(name)));
  return {
    startedAt: new Date(startsAt),
    finished: row.progress >= 1 && row.abandonedAt === null,
    abandoned: row.abandonedAt !== null,
    standings: new Map(humans.map((r) => [r.name.toLowerCase(), { finishedAt: r.finishedAt, progress: r.progress, abandonedAt: r.abandonedAt }])),
    bots,
    release: async () => void (await db.update(roomMembers).set({ raceRecorded: false }).where(member)),
  };
}

/**
 * POST /api/races : refusé sans session (compte ou invité signé) ; le compte est celui de la session.
 * Chaque course porte un identifiant unique tiré par le navigateur : le même envoi rejoué est refusé (409).
 * COURSE-06 : la course doit venir d'un salon lancé par le serveur (claimServerRace) ; un seul envoi par membre et par lancement.
 * Limite : le MPM et le rang restent ceux du navigateur, bornés par le serveur (durée de la course, MPM humain).
 */
export async function handleRace(req: Request, db: Db, auth: Auth, secret = guestSecret()): Promise<Response> {
  if (req.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 });
  const session = await auth.api.getSession({ headers: req.headers }).catch(() => null);
  const playerId = (session?.user as { playerId?: number | null } | undefined)?.playerId ?? null;
  const guestSession = session ? null : readGuestSession(req.headers, secret);
  const guest = guestSession?.nickname ?? null;
  if (!session && !guest) return Response.json({ error: "unauthorized" }, { status: 401 });
  // la clé de membre de l'expéditeur, comme dans les salons (memberKey) ; un invité sans id de session n'en a pas
  const key = playerId ? memberKey({ playerId }) : guestSession?.id ? `guest:${guestSession.id}` : null;
  try {
    const race = parseRace(JSON.parse(await readBody(req)));
    if (!race.id) fail("id");
    const { release, ...server } = await claimServerRace(db, race, key);
    let raceId: number | null;
    try {
      raceId = await recordRace(db, race, { playerId, guest }, server);
    } catch (error) {
      await release();
      throw error;
    }
    return Response.json({ raceId }, { status: raceId ? 201 : 200 });
  } catch (error) {
    if (error instanceof RaceRefused) return Response.json({ error: error.reason }, { status: error.reason === "race_contradicted" ? 422 : 409 });
    if (error instanceof BodyTooLarge) return Response.json({ error: "payload_too_large" }, { status: 413 });
    if (error instanceof DuplicateRace) return Response.json({ error: "duplicate_race" }, { status: 409 });
    if (error instanceof InvalidRace || error instanceof SyntaxError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
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
    image: storedAvatar(account?.image),
    races: totals?.races ?? 0,
    wins: totals?.wins ?? 0,
    bestWpm: totals?.best ?? null,
    averageWpm: round(totals?.averageWpm),
    averageAccuracy: round(totals?.averageAccuracy, 1),
    keys,
    progress: recent.reverse().map((point) => ({ at: point.at.toISOString(), wpm: point.wpm, accuracy: point.accuracy })),
  };
}

// TECH-07 : l'identifiant de /api/players/:name/stats vient de l'URL ; un nom reste court et sans caractère de contrôle.
const PlayerName = z.string().min(1).max(64).regex(/^[^\u0000-\u001f\u007f]+$/);

/** GET /api/players/:name/stats : `raw` est le segment d'URL encore encodé. Mal encodé ou mal formé : 400 ; inconnu : 404. */
export async function handleStats(raw: string, db: Db): Promise<Response> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return Response.json({ error: "bad_name" }, { status: 400 });
  }
  const name = PlayerName.safeParse(decoded);
  if (!name.success) return Response.json({ error: "bad_name" }, { status: 400 });
  const stats = await playerStats(db, name.data);
  return stats ? Response.json(stats) : Response.json({ error: "not_found" }, { status: 404 });
}

export type PlayerStats = NonNullable<Awaited<ReturnType<typeof playerStats>>>;

// Salons, côté serveur (SALLE-01, 02, 03, 09). Indépendant du transport : les routes HTTP (api.ts) et le temps réel
// (realtime.ts) appellent ces fonctions ; rien ici ne connaît Request, WebSocket ou Next.js.
import { and, asc, desc, eq, gt, gte, inArray, isNotNull, isNull, ne, notInArray, sql, type SQL } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import type { z } from "zod";
import type { Db } from "../../db/client";
import { players, raceConfigs, roomBans, roomMembers, rooms, user } from "../../db/schema";
import { storedAvatar } from "../players/avatar";
import { allows, canJoin, isListed, newRoomCode } from "../rooms/access";
import { CHECKPOINTS, MAX_BONUSES } from "../rooms/bonus";
import { BONUS_KINDS, type BonusKind } from "../rooms/bonus-effects";
import type { BotBonus } from "../rooms/bot-engine";
import { resolveBots } from "../rooms/bots";
import { launchBlocker } from "../rooms/launch";
import { follow, raceState, storedStatus, type RaceEvent, type RaceState } from "../rooms/race-state";
import { concealText, textRevealed } from "../rooms/conceal";
import { COUNTDOWN_MS, raceClock } from "../rooms/race-clock";
import { ABANDON_AFTER_MS } from "../rooms/reconnect";
import { CLOCK_TOLERANCE_MS } from "../realtime/referee";
import { courseWords, textFingerprint } from "../rooms/course-words";
import type { RoomFilters } from "../rooms/explorer";
import { seatColor } from "../rooms/seats";
import { wordTarget } from "../rooms/text";
import { composePassage, pickPassage } from "./corpus";
import { launchStandings, rerankLaunch } from "./ranking";
import { claimInvite, revokeInvitesOf, roomOfInvite } from "./room-invites";
import { DEFAULT_SETTINGS, normalizeSettings, type CreateRoomSchema, type Role, type RoomSettings, type UpdateRoomSchema } from "../rooms/settings";

export type CreateRoomInput = z.infer<typeof CreateRoomSchema>;
export type UpdateRoomInput = z.infer<typeof UpdateRoomSchema>;

/** Trop de collisions de suite : l'espace des codes est saturé (ou le tirage est cassé). */
export class CodeExhausted extends Error {}

const CODE_ATTEMPTS = 8;

/** Une violation de cette contrainte d'unicité, quel que soit le pilote (postgres-js, PGlite) et l'enveloppe de Drizzle. */
function isUniqueViolation(error: unknown, name: string): boolean {
  for (let e: unknown = error; e && typeof e === "object"; e = (e as { cause?: unknown }).cause) {
    const { code, constraint, constraint_name } = e as { code?: string; constraint?: string; constraint_name?: string };
    if (code === "23505" && (constraint ?? constraint_name) === name) return true;
  }
  return false;
}
const isCodeCollision = (error: unknown) => isUniqueViolation(error, "rooms_code_unique");

/**
 * SALLE-02 : insère avec un code neuf ; si la base le refuse parce qu'il existe déjà, on en tire un autre.
 * L'unicité vient de la contrainte en base, pas d'une lecture préalable (qui laisserait passer deux créations simultanées).
 */
export async function withFreshCode<T>(insert: (code: string) => Promise<T>, draw: () => string = newRoomCode, attempts = CODE_ATTEMPTS): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await insert(draw());
    } catch (error) {
      if (!isCodeCollision(error)) throw error;
    }
  }
  throw new CodeExhausted(`No free room code after ${attempts} attempts`);
}

// ---------------------------------------------------------------------------------------------------------------------
// Membres et vues

/** Qui agit, d'après sa session vérifiée par le serveur (jamais d'après le corps de la requête). */
export type Identity = { kind: "account"; playerId: number; name: string } | { kind: "guest"; name: string; sessionId: string };

/**
 * La clé d'un membre : la même personne a la même clé dans tous les salons (SALLE-06 : unique en base, room_members_member_unique).
 * Un invité est sa session signée (id aléatoire du cookie), jamais son pseudonyme, que n'importe qui peut reprendre.
 */
export function memberKey(who: Identity | { playerId: number }): string {
  if ("playerId" in who) return `player:${who.playerId}`;
  return `guest:${who.sessionId}`;
}

/** finished (SALLE-09) : ce membre a fini (ou abandonné) la course en cours ; son retour au salon ne le renvoie pas courir. */
/** abandoned (COURSE-07) : ce membre a abandonné la course en cours. */
/** image (COURSE-05) : la photo du compte, réduite par le serveur (AUTH-04) ; null pour un invité ou sans photo. */
export type MemberView = { key: string; name: string; guest: boolean; host: boolean; role: Role; seat: number | null; color: string | null; finished: boolean; abandoned?: boolean; image?: string | null };
export type RoomView = {
  code: string;
  status: RoomStatus;
  /** Clé du membre hôte. */
  host: string;
  settings: RoomSettings;
  /** Par ordre d'arrivée. */
  members: MemberView[];
  /** CONF-03 : le passage tiré par le serveur au lancement (mode cohérent), le même pour tous ; null sinon. */
  passage: { body: string; source: string | null } | null;
  /** CONF-03 : la graine tirée par le serveur au lancement ; chaque client en tire les mêmes mots. Null avant. */
  seed: number | null;
  /** COURSE-06 : le départ de la course décidé par le serveur (lancement + décompte), en ms epoch ; null avant. */
  startsAt: number | null;
  /** COURSE-06 : la fin de la course (départ + durée), en ms epoch ; null sans limite de temps ou avant le lancement. */
  endsAt: number | null;
  /** COURSE-06 : l'empreinte des mots tirés au lancement (src/rooms/course-words.ts) ; null avant. */
  textHash: string | null;
  /** COURSE-03 : l'heure de la base (même horloge que startsAt) au moment de la lecture, en ms epoch : le client en déduit son décalage. */
  serverNow: number;
  /** COURSE-10 : qui a abandonné la dernière course lancée, et à quelle progression, même parti depuis ; vidé au lancement suivant. */
  abandoned?: { name: string; progress: number }[];
  /** BOT-04 : les effets de bonus reçus par les bots de la course lancée, datés depuis le départ ; vidé au lancement. */
  botBonuses?: BotBonus[];
};
export type RoomStatus = (typeof rooms.$inferSelect)["status"];
/** Ce que renvoie une action réussie : l'état du salon, et la clé de celui qui l'a demandée. */
export type RoomResult = { room: RoomView; you: string };

/**
 * SALLE-05 : une place pour un participant, aucune pour un spectateur (il ne compte pas dans la capacité).
 * `taken` : les places des participants déjà assis ; `capacity` : rooms.guests, lu sous le verrou du salon.
 * Plein quand il y a déjà `capacity` participants ; sinon la première place libre.
 */
function placeFor(role: Role, taken: (number | null)[], capacity: number) {
  if (role === "spectator") return { seat: null, color: null };
  const seats = taken.filter((seat) => seat !== null);
  if (seats.length >= capacity) throw new RoomRefused("full");
  let seat = 0;
  while (seats.includes(seat)) seat++;
  return { seat, color: seatColor(seat) };
}

/** Un refus attendu (pas une panne) : la route le traduit en statut HTTP, le temps réel en message. */
export class RoomRefused extends Error {
  /** room : pour « already_in_room », le code du salon où la personne est déjà (SALLE-06 : on lui propose d'en sortir). */
  constructor(
    readonly reason: RefusalReason,
    readonly room?: string,
  ) {
    super(`Room refused: ${reason}`);
  }
}
/** invite_taken : lien déjà lié à une autre IP ou une autre personne (SALLE-04) ; invite_limit : trop de liens dans ce salon. */
export type RefusalReason = "not_found" | "not_member" | "not_host" | "full" | "in_race" | "closed" | "already_in_room" | "kicked" | "invalid_target" | "unknown_member" | "invite_taken" | "invite_limit" | "not_enough_players" | "no_room" | "not_results" | "not_racing" | "not_player" | "already_finished";

/** SALLE-07 : cette personne a été expulsée de ce salon. L'IP compte pour un invité et pour un compte plus récent que le bannissement (voir ipBan). */
async function isKicked(db: Db, who: Identity, roomId: number, key: string, ip: string | null): Promise<boolean> {
  const keys = [key, nameBan(who.name), ...(who.kind === "guest" && ip ? [ipBan(ip)] : [])];
  if ((await db.$count(roomBans, and(eq(roomBans.roomId, roomId), inArray(roomBans.memberKey, keys)))) > 0) return true;
  if (who.kind !== "account" || !ip) return false;
  const [fresh] = await db
    .select({ roomId: roomBans.roomId })
    .from(roomBans)
    .innerJoin(players, eq(players.id, who.playerId))
    .where(and(eq(roomBans.roomId, roomId), eq(roomBans.memberKey, ipBan(ip)), gt(players.createdAt, roomBans.createdAt)))
    .limit(1);
  return !!fresh;
}

/**
 * SALLE-07 : un invité expulsé obtient sans peine une nouvelle session (POST /api/guest). Son pseudonyme est donc
 * banni aussi (une ligne « name:<pseudonyme en minuscules> » dans room_bans), ainsi que l'IP d'entrée de la personne
 * expulsée (« ip:<adresse> », voir ipBan) : un compte ne revient pas en invité sous son nom, et personne ne revient
 * en invité ni avec un compte neuf depuis la même adresse sous un autre nom.
 */
const nameBan = (name: string) => `name:${name.toLowerCase()}`;

/**
 * Choix : le bannissement par IP touche les invités et les comptes créés après l'expulsion (un nouveau compte ouvert
 * pour revenir). Un compte plus ancien n'en dépend pas : un réseau partagé (école, NAT) ne bloque pas les comptes de
 * ses voisins. IP inconnue : pas de bannissement par IP.
 */
const ipBan = (ip: string) => `ip:${ip}`;

/** SALLE-06 : le code du salon dont cette personne est membre, s'il y en a un (au plus un, par la contrainte en base). */
async function currentRoomOf(db: Db, key: string): Promise<string | null> {
  const [row] = await db.select({ code: rooms.code }).from(roomMembers).innerJoin(rooms, eq(rooms.id, roomMembers.roomId)).where(eq(roomMembers.memberKey, key));
  return row?.code ?? null;
}

/**
 * SALLE-06 : la contrainte room_members_member_unique a refusé une deuxième salle (deux demandes simultanées vers deux
 * salons) ; c'est un refus attendu, avec le salon actuel, jamais une erreur 500.
 */
async function refuseSecondRoom(db: Db, key: string, error: unknown): Promise<never> {
  if (!isUniqueViolation(error, "room_members_member_unique")) throw error;
  throw new RoomRefused("already_in_room", (await currentRoomOf(db, key)) ?? undefined);
}

const settingsOf = (room: typeof rooms.$inferSelect, config: typeof raceConfigs.$inferSelect): RoomSettings => ({
  name: room.name,
  autoName: room.autoName,
  visibility: room.visibility,
  guests: room.guests,
  bots: room.bots,
  botList: room.botList,
  language: config.language,
  botSpeed: config.botSpeed,
  botAccuracy: config.botAccuracy,
  textType: config.textType,
  length: config.length,
  wordCount: config.wordCount,
  duration: config.duration,
  level: config.level,
  punctuation: config.punctuation,
  numbers: config.numbers,
  specials: config.specials,
  accents: config.accents,
  capitals: config.capitals,
  mistakes: config.mistakes,
  excluded: config.excluded,
  text: config.customText,
  catchUpBonus: config.catchUpBonus,
});

/** Les réglages de course d'un salon, en ligne de race_configs. */
const configOf = (s: RoomSettings) => ({
  language: s.language,
  botSpeed: s.botSpeed,
  botAccuracy: s.botAccuracy,
  textType: s.textType,
  length: s.length,
  wordCount: s.wordCount,
  duration: s.duration,
  level: s.level,
  punctuation: s.punctuation,
  numbers: s.numbers,
  specials: s.specials,
  accents: s.accents,
  capitals: s.capitals,
  mistakes: s.mistakes,
  excluded: s.excluded,
  customText: s.text,
  catchUpBonus: s.catchUpBonus,
});

const roomColumnsOf = (s: RoomSettings) => ({ name: s.autoName ? "" : s.name, autoName: s.autoName || !s.name, visibility: s.visibility, guests: s.guests, bots: s.bots, botList: s.botList });

/** COURSE-03 : pour chaque vue, l'écart entre l'horloge de la base et celle de ce processus, mesuré à sa lecture. */
const dbClockSkew = new WeakMap<RoomView, number>();

/** COURSE-03 : l'heure de la base (ms epoch) à l'heure `appTime` de ce processus, d'après la lecture de `view` ; null si inconnue. */
export function dbClockAt(view: RoomView, appTime: number): number | null {
  const skew = dbClockSkew.get(view);
  return skew === undefined ? null : appTime + skew;
}

/**
 * L'état d'un salon tel que le voit `viewer`. Sans lien d'invitation : l'hôte les lit à part (room-invites.ts, SALLE-04).
 * COURSE-03 : sans `viewer`, la vue complète, pour le serveur seulement (tirage au lancement, temps réel, qui la filtre
 * pour chaque suiveur avec concealText) ; avec, le texte personnalisé n'est donné qu'à l'hôte avant le lancement.
 */
export async function roomView(db: Db, roomId: number, viewer?: string): Promise<RoomView> {
  const [row] = await db
    // COURSE-03 : clock_timestamp() et non now(), figé au début de la transaction
    .select({ rooms, race_configs: raceConfigs, serverNow: sql<number>`extract(epoch from clock_timestamp()) * 1000`.mapWith(Number) })
    .from(rooms)
    .innerJoin(raceConfigs, eq(raceConfigs.id, rooms.configId))
    .where(eq(rooms.id, roomId));
  const readAt = Date.now();
  if (!row) throw new RoomRefused("not_found");
  // COURSE-03 : le texte (passage, graine, empreinte) n'est révélé qu'au début du décompte, donc une fois le salon lancé
  const revealed = textRevealed(row.rooms.status);
  const members = await db
    .select({ key: roomMembers.memberKey, playerId: roomMembers.playerId, guestName: roomMembers.guestName, playerName: players.name, role: roomMembers.role, seat: roomMembers.seat, color: roomMembers.color, finishedAt: roomMembers.finishedAt, abandonedAt: roomMembers.abandonedAt, image: user.image })
    .from(roomMembers)
    .leftJoin(players, eq(players.id, roomMembers.playerId))
    .leftJoin(user, eq(user.playerId, roomMembers.playerId))
    .where(eq(roomMembers.roomId, roomId))
    .orderBy(asc(roomMembers.joinedAt), asc(roomMembers.memberKey));
  const host = memberKey({ playerId: row.rooms.hostId });
  const textId = revealed ? row.rooms.textId : null;
  const passage = textId === null ? null : await composePassage(db, { language: row.race_configs.language, words: wordTarget(row.race_configs), startId: textId });
  const full: RoomView = {
    code: row.rooms.code,
    status: row.rooms.status,
    host,
    settings: settingsOf(row.rooms, row.race_configs),
    members: members.map((m) => ({ key: m.key, name: m.playerName ?? m.guestName ?? "", guest: m.playerId === null, host: m.key === host, role: m.role, seat: m.seat, color: m.color, finished: m.finishedAt !== null || m.abandonedAt !== null, abandoned: m.abandonedAt !== null, image: storedAvatar(m.image) })),
    passage: passage && { body: passage.body, source: passage.source },
    seed: revealed ? row.rooms.textSeed : null,
    ...raceClock(row.rooms.launchedAt, row.race_configs.duration),
    textHash: revealed ? row.rooms.textHash : null,
    serverNow: Math.round(row.serverNow),
    abandoned: row.rooms.abandons.map(({ name, progress }) => ({ name, progress })),
    // BOT-04 : une page rechargée rejoue les bonus déjà reçus par les bots
    ...(revealed ? { botBonuses: row.rooms.botBonuses } : {}),
  };
  const view = viewer === undefined ? full : concealText(full, viewer);
  dbClockSkew.set(view, row.serverNow - readAt);
  return view;
}

/** Le salon de ce code, ou un refus « not_found ». */
async function roomByCode(db: Db, code: string) {
  const [row] = await db.select().from(rooms).where(eq(rooms.code, code));
  if (!row) throw new RoomRefused("not_found");
  return row;
}

async function membership(db: Db, roomId: number, key: string) {
  const [row] = await db.select().from(roomMembers).where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.memberKey, key)));
  return row ?? null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Actions

/**
 * SALLE-01 : un compte crée un salon et en devient l'hôte, participant ou spectateur.
 * Seul un compte (playerId) peut créer : la route refuse avant d'arriver ici un invité ou une requête sans session.
 */
export async function createRoom(db: Db, host: { playerId: number; ip?: string | null }, input: CreateRoomInput, draw: () => string = newRoomCode): Promise<RoomResult> {
  const chosen = normalizeSettings({ ...DEFAULT_SETTINGS, ...input.settings });
  // CONF-10 : la liste envoyée, sinon un bot par place libre si les bots sont activés (réglage par défaut)
  const bots = resolveBots({ ...chosen, bots: false, botList: [] }, { ...input.settings, bots: chosen.bots }, input.role === "player" ? 1 : 0);
  if (bots === "full") throw new RoomRefused("full");
  const settings = { ...chosen, ...bots };
  const key = memberKey({ playerId: host.playerId });
  // SALLE-06 : déjà membre d'un salon, on ne crée pas le deuxième ; la page propose de quitter le premier
  await settleCurrentRoom(db, key);
  const current = await currentRoomOf(db, key);
  if (current) throw new RoomRefused("already_in_room", current);
  const roomId = await withFreshCode(
    (code) =>
      db.transaction(async (tx) => {
        const [config] = await tx.insert(raceConfigs).values(configOf(settings)).returning({ id: raceConfigs.id });
        const [room] = await tx
          .insert(rooms)
          .values({ code, ...roomColumnsOf(settings), hostId: host.playerId, configId: config!.id })
          .returning({ id: rooms.id });
        await tx.insert(roomMembers).values({ roomId: room!.id, memberKey: key, playerId: host.playerId, role: input.role, ...placeFor(input.role, [], settings.guests), ip: host.ip ?? null });
        return room!.id;
      }),
    draw,
  ).catch((error: unknown) => refuseSecondRoom(db, key, error));
  return { room: await roomView(db, roomId, key), you: key };
}

/** L'état d'un salon pour l'un de ses membres (rechargement de la page, reconnexion). */
export async function readRoom(db: Db, code: string, who: Identity): Promise<RoomResult> {
  const room = await roomByCode(db, code);
  const key = memberKey(who);
  // SALLE-08 : lire son salon (la page le relit, /game et /podium aussi) est le signe de vie du membre
  const member = await db.transaction(async (tx) => {
    await sweep(tx, room.id, key);
    return membership(tx, room.id, key);
  });
  if (!member) {
    // SALLE-07 : la page d'un expulsé le lui dit ; il connaissait déjà le salon, rien n'est révélé (SALLE-10)
    if (room.status !== "closed" && (await isKicked(db, who, room.id, key, null))) throw new RoomRefused("kicked");
    throw new RoomRefused("not_found"); // SALLE-10 : un non-membre ne sait pas si le salon existe
  }
  return { room: await roomView(db, room.id, key), you: key };
}

/**
 * Un membre change son rôle ; l'hôte change les réglages. Dans ce groupe, seul l'hôte peut changer son rôle (SALLE-01).
 * Changer un réglage de course crée une nouvelle ligne race_configs : les courses passées gardent les leurs.
 */
export async function updateRoom(db: Db, code: string, who: Identity, input: UpdateRoomInput): Promise<RoomResult> {
  const { id } = await roomByCode(db, code);
  const key = memberKey(who);
  await db.transaction(async (tx) => {
    await sweep(tx, id, key);
    // sous le verrou du salon, comme joinRoom : les places prises et les réglages ne bougent pas pendant le changement
    const [room] = await tx.select().from(rooms).where(eq(rooms.id, id)).for("update");
    if (!room) throw new RoomRefused("not_found");
    const member = await membership(tx, id, key);
    if (!member) throw new RoomRefused("not_found"); // SALLE-10 : un non-membre ne sait pas si le salon existe
    if (key !== memberKey({ playerId: room.hostId })) throw new RoomRefused("not_host");
    // SALLE-09 : pendant la course, ni place prise par l'hôte spectateur, ni réglage changé
    if (room.status === "closed") throw new RoomRefused("not_found");
    if (!canJoin(room.status)) throw new RoomRefused("in_race");
    const taken = (await tx.select({ seat: roomMembers.seat }).from(roomMembers).where(eq(roomMembers.roomId, id))).map((m) => m.seat);
    let capacity = room.guests;
    if (input.settings) {
      const [config] = await tx.select().from(raceConfigs).where(eq(raceConfigs.id, room.configId));
      const current = settingsOf(room, config!);
      const seated = taken.filter((seat) => seat !== null).length;
      // CONF-10 : un bot de plus seulement dans une place libre (capacité moins les humains assis et les bots)
      const bots = resolveBots(current, input.settings, seated);
      if (bots === "full") throw new RoomRefused("full");
      const settings = normalizeSettings({ ...current, ...input.settings, ...bots });
      // SALLE-05 : la capacité ne descend pas sous le nombre de participants déjà assis
      if (settings.guests < seated) throw new RoomRefused("full");
      capacity = settings.guests;
      const [next] = await tx.insert(raceConfigs).values(configOf(settings)).returning({ id: raceConfigs.id });
      await tx.update(rooms).set({ ...roomColumnsOf(settings), configId: next!.id }).where(eq(rooms.id, id));
    }
    if (input.role && input.role !== member.role) {
      await tx.update(roomMembers).set({ role: input.role, ...placeFor(input.role, taken, capacity) }).where(and(eq(roomMembers.roomId, id), eq(roomMembers.memberKey, key)));
    }
  });
  return { room: await roomView(db, id, key), you: key };
}

// ---------------------------------------------------------------------------------------------------------------------
// SALLE-03 : liste et entrée

/**
 * Ce que montre l'explorateur d'un salon public. Ni lien d'invitation, ni clé de membre : seulement le nom de l'hôte.
 * JOIN-02 : participants et capacité (guests), langue du texte, complexité (level), hôte et état.
 */
export type ListedRoom = { code: string; name: string; autoName: boolean; language: RoomSettings["language"]; level: RoomSettings["level"]; guests: number; bots: boolean; players: number; host: string; status: RoomStatus };

/** Les salons publics ouverts, les plus récents d'abord. Un salon « sur code » ou privé n'y est jamais. JOIN-02 : filtres langue et complexité. */
export async function listPublicRooms(db: Db, filters: RoomFilters = {}, limit = 50): Promise<ListedRoom[]> {
  await sweepAll(db);
  const playerCount = sql<number>`(select count(*) from ${roomMembers} where ${roomMembers.roomId} = ${rooms.id} and ${roomMembers.role} = 'player')`.mapWith(Number);
  return db
    .select({ code: rooms.code, name: rooms.name, autoName: rooms.autoName, language: raceConfigs.language, level: raceConfigs.level, guests: rooms.guests, bots: rooms.bots, players: playerCount, host: players.name, status: rooms.status })
    .from(rooms)
    .innerJoin(raceConfigs, eq(raceConfigs.id, rooms.configId))
    .innerJoin(players, eq(players.id, rooms.hostId))
    .where(
      and(
        eq(rooms.visibility, "public"),
        ne(rooms.status, "closed"),
        filters.language ? eq(raceConfigs.language, filters.language) : undefined,
        filters.level ? eq(raceConfigs.level, filters.level) : undefined,
      ),
    )
    .orderBy(desc(rooms.createdAt), desc(rooms.id))
    .limit(limit);
}

/** Comment on entre : par le code du salon, ou par un lien d'invitation. */
export type JoinVia = ({ code: string } | { invite: string }) & { role?: Role };

/**
 * Le salon visé par ce code ou ce lien. La visibilité se vérifie ensuite, sous le verrou, après l'appartenance :
 * un membre retrouve son salon par son code même s'il est privé (SALLE-03).
 */
async function roomFor(db: Db, via: JoinVia): Promise<number> {
  // SALLE-04 : un lien par invité (room_invites) ; il est vérifié et pris sous le verrou, dans joinRoom
  if ("invite" in via) return roomOfInvite(db, via.invite);
  // SALLE-10 : les essais sont limités par IP avant cette lecture, dans la route (rate-limit.ts).
  const [room] = await db.select({ id: rooms.id }).from(rooms).where(eq(rooms.code, via.code));
  if (!room) throw new RoomRefused("not_found");
  return room.id;
}

/**
 * Entrer dans un salon comme participant, ou comme spectateur (SALLE-05 : il ne prend pas de place). Un membre qui revient (rechargement, autre onglet) le retrouve sans doublon.
 * SALLE-05 : la capacité (rooms.guests) est lue sous le verrou. SALLE-06 : une salle à la fois (contrainte en base,
 * refus « already_in_room » avec le salon actuel). SALLE-07 : un expulsé est refusé (« kicked »). SALLE-09 (état du
 * salon) se vérifie aussi ici, avant l'insertion. ip : l'IP du client (client-ip.ts), à laquelle un lien
 * d'invitation est lié (SALLE-04).
 */
export async function joinRoom(db: Db, who: Identity, via: JoinVia, ip: string | null = null): Promise<RoomResult> {
  const id = await roomFor(db, via);
  const key = memberKey(who);
  await settleCurrentRoom(db, key, id);
  const entered = db.transaction(async (tx) => {
    await sweep(tx, id, key);
    // Verrou sur la ligne du salon : les entrées simultanées et le lancement passent l'un après l'autre.
    // L'état (SALLE-09) et les places prises (SALLE-03) sont lus sous ce verrou, jamais avant.
    const [room] = await tx.select({ status: rooms.status, visibility: rooms.visibility, guests: rooms.guests }).from(rooms).where(eq(rooms.id, id)).for("update");
    // SALLE-10 : un salon fermé répond comme un code inconnu, pour ne pas révéler qu'un code a servi
    if (!room || room.status === "closed") throw new RoomRefused("not_found");
    // un membre qui revient (rechargement, autre onglet) n'est pas un nouvel arrivant, même pendant la course,
    // et il retrouve son salon par son code même si l'hôte l'a rendu privé (SALLE-03)
    const isMember = !!(await membership(tx, id, key));
    // SALLE-07 : un expulsé ne revient pas, ni par code ni par lien, quel que soit le rôle demandé
    if (!isMember && (await isKicked(tx, who, id, key, ip))) throw new RoomRefused("kicked");
    // SALLE-04 : le lien doit être libre, ou déjà lié à cette personne et à cette IP ; une entrée refusée plus bas
    // annule la transaction, et le lien reste libre
    if ("invite" in via) await claimInvite(tx, id, via.invite, who, ip, isMember);
    if (isMember) return;
    // la visibilité est lue sous le verrou : l'hôte a pu rendre le salon privé entre-temps
    if ("code" in via && !allows(room.visibility, "code")) throw new RoomRefused("not_found");
    if (!canJoin(room.status)) throw new RoomRefused("in_race");
    // SALLE-06 : membre d'un autre salon ; vérifié après l'accès, pour ne rien dire d'un salon qu'on ne peut pas ouvrir
    const current = await currentRoomOf(tx, key);
    if (current) throw new RoomRefused("already_in_room", current);
    const taken = (await tx.select({ seat: roomMembers.seat }).from(roomMembers).where(eq(roomMembers.roomId, id))).map((m) => m.seat);
    const identity = who.kind === "account" ? { playerId: who.playerId } : { guestName: who.name };
    const role = via.role ?? "player";
    await tx.insert(roomMembers).values({ roomId: id, memberKey: key, ...identity, role, ...placeFor(role, taken, room.guests), ip });
  });
  await entered.catch((error: unknown) => refuseSecondRoom(db, key, error));
  return { room: await roomView(db, id, key), you: key };
}

/** JOIN-03 : salons candidats lus par lot ; un lot épuisé sans entrée, on lit le suivant. */
const QUICK_BATCH = 20;

/**
 * JOIN-03 : « Faire une course ». Parmi les salons publics joignables (en attente ou résultats, SALLE-09) et non
 * pleins, le plus proche de sa capacité (le moins de places libres) ; à égalité, le plus ancien. Le choix est
 * revérifié sous le verrou du salon, dans la transaction qui y fait entrer la personne : un salon rempli, lancé ou
 * rendu privé entre la lecture et l'entrée est passé, et le suivant est essayé. Un salon dont la personne a été
 * expulsée (SALLE-07) est passé aussi. Aucun salon : refus « no_room » (la route dit si la personne peut en créer un).
 */
export async function quickJoin(db: Db, who: Identity, ip: string | null = null): Promise<RoomResult> {
  const key = memberKey(who);
  // SALLE-06 : une salle à la fois ; la page propose de rouvrir la sienne
  await settleCurrentRoom(db, key);
  const current = await currentRoomOf(db, key);
  if (current) throw new RoomRefused("already_in_room", current);
  await sweepAll(db);
  const seated = sql<number>`(select count(*) from ${roomMembers} where ${roomMembers.roomId} = ${rooms.id} and ${roomMembers.seat} is not null)`;
  // par lots, jusqu'à épuisement : un salon essayé et refusé est exclu des lots suivants
  const tried: number[] = [];
  for (;;) {
    const candidates = await db
      .select({ id: rooms.id })
      .from(rooms)
      .where(and(eq(rooms.visibility, "public"), inArray(rooms.status, ["waiting", "results"]), sql`${seated} < ${rooms.guests}`, tried.length ? notInArray(rooms.id, tried) : undefined))
      .orderBy(sql`${rooms.guests} - ${seated}`, asc(rooms.createdAt), asc(rooms.id))
      .limit(QUICK_BATCH);
    if (!candidates.length) throw new RoomRefused("no_room");
    for (const { id } of candidates) {
      tried.push(id);
      if (await enterQuick(db, who, key, id, ip)) return { room: await roomView(db, id, key), you: key };
    }
  }
}

/** JOIN-03 : sous le verrou du salon, revérifie qu'il est toujours public, joignable et non plein, puis y fait entrer. False s'il ne l'est plus. */
async function enterQuick(db: Db, who: Identity, key: string, id: number, ip: string | null): Promise<boolean> {
  return db
    .transaction(async (tx) => {
      await sweep(tx, id);
      const [room] = await tx.select({ status: rooms.status, visibility: rooms.visibility, guests: rooms.guests }).from(rooms).where(eq(rooms.id, id)).for("update");
      if (!room || !isListed(room.visibility) || !canJoin(room.status)) return false;
      const taken = (await tx.select({ seat: roomMembers.seat }).from(roomMembers).where(eq(roomMembers.roomId, id))).map((m) => m.seat);
      if (taken.filter((seat) => seat !== null).length >= room.guests) return false;
      if (await isKicked(tx, who, id, key, ip)) return false;
      const current = await currentRoomOf(tx, key);
      if (current) throw new RoomRefused("already_in_room", current);
      const identity = who.kind === "account" ? { playerId: who.playerId } : { guestName: who.name };
      await tx.insert(roomMembers).values({ roomId: id, memberKey: key, ...identity, role: "player", ...placeFor("player", taken, room.guests), ip });
      return true;
    })
    .catch((error: unknown) => refuseSecondRoom(db, key, error));
}

/**
 * SALLE-09 : l'hôte lance la course ; le salon passe en « racing » et n'accepte plus de nouvel arrivant.
 * Sous le même verrou que joinRoom : une entrée simultanée est soit faite avant le lancement, soit refusée.
 * À BRANCHER (COURSE-*) : le texte et le départ de la course. La fin : finishRoom.
 */
export async function launchRoom(db: Db, code: string, who: Identity): Promise<RoomResult> {
  const { id } = await roomByCode(db, code);
  const key = memberKey(who);
  await db.transaction(async (tx) => {
    await sweep(tx, id, key);
    const [room] = await tx.select({ status: rooms.status, hostId: rooms.hostId, configId: rooms.configId, guests: rooms.guests, bots: rooms.bots, botList: rooms.botList }).from(rooms).where(eq(rooms.id, id)).for("update");
    if (!room) throw new RoomRefused("not_found");
    if (!(await membership(tx, id, key))) throw new RoomRefused("not_found"); // SALLE-10 : un non-membre ne sait pas si le salon existe
    if (key !== memberKey({ playerId: room.hostId })) throw new RoomRefused("not_host");
    if (room.status === "closed") throw new RoomRefused("not_found");
    if (!canJoin(room.status)) throw new RoomRefused("in_race");
    const from = await stateOf(tx, id);
    // COURSE-02 : les membres et les réglages lus sous le verrou, jamais le corps de la requête
    if (launchBlocker(room, await tx.select({ role: roomMembers.role }).from(roomMembers).where(eq(roomMembers.roomId, id)))) throw new RoomRefused("not_enough_players");
    // CONF-03 : le serveur tire le texte. En mode cohérent, un passage du corpus dans la langue du salon (suivi d'autres
    // jusqu'à la longueur voulue) ; dans tous les modes, une graine, pour que chaque membre tire les mêmes mots.
    const [config] = await tx.select().from(raceConfigs).where(eq(raceConfigs.id, room.configId));
    const passage = config!.textType === "coherent" ? await pickPassage(tx, { language: config!.language, words: wordTarget(config!) }) : null;
    const textSeed = crypto.getRandomValues(new Int32Array(1))[0]!;
    // COURSE-01 : une relance repasse par EN_ATTENTE (results → waiting → countdown)
    await moveRoom(tx, id, from, from === "results" ? ["reopen", "launch"] : ["launch"], { launchedAt: sql`now()`, textId: passage?.id ?? null, textSeed, abandons: [], departed: [], botBonuses: [], bonusCheckpoints: 0 });
    await tx.update(roomMembers).set({ finishedAt: null, abandonedAt: null, eliminatedAt: null, progress: 0, raceRecorded: false, bonusWords: null, receivedBonuses: [] }).where(eq(roomMembers.roomId, id));
    // COURSE-06 : l'empreinte des mots que la page de course va retirer, vérifiée par le serveur temps réel
    const words = courseWords(await roomView(tx, id));
    await tx.update(rooms).set({ textHash: words && textFingerprint(words) }).where(eq(rooms.id, id));
  });
  return { room: await roomView(db, id, key), you: key };
}

/**
 * COURSE-09 / SALLE-09 : marge après endsAt avant de clore la course d'office. Le temps réel accepte encore une progression
 * jusqu'à endsAt + CLOCK_TOLERANCE_MS (referee.ts) ; la seconde de plus couvre son écriture en base (recordProgress).
 */
export const RACE_GRACE_MS = CLOCK_TOLERANCE_MS + 1000;
/** COURSE-09 : l'échéance d'une course, depuis son lancement : décompte, durée (race_configs.duration, en secondes), marge. */
export const raceDeadlineMs = (durationSeconds: number) => COUNTDOWN_MS + durationSeconds * 1000 + RACE_GRACE_MS;
/**
 * SALLE-08 : sans signe de vie (lecture du salon, action) depuis ce délai, un membre est parti, socket ou pas.
 * Les pages relisent le salon toutes les 3 à 15 s ; la marge couvre un onglet en arrière-plan, que le navigateur
 * ralentit (une minuterie par minute au pire).
 */
export const MEMBER_AWAY_MS = 90_000;
/**
 * COURSE-08 : pendant la course, un coureur sans signe de vie depuis ABANDON_AFTER_MS (RECONNECT_MS = 30 s depuis sa
 * coupure, plus RACE_PRESENCE_MS, l'écart au pire entre son dernier signe de vie et la coupure) a abandonné. Mesuré par
 * l'heure de la base, depuis room_members.last_seen_at (lecture du salon : /game la relit toutes les RACE_PRESENCE_MS ;
 * progression acceptée par le temps réel), au plus tôt depuis le départ ; appliqué à chaque balayage du salon (sweep :
 * lecture ou action d'un membre, balayage du temps réel toutes les 5 s). Voir docs/ARCHITECTURE.md.
 */
export { ABANDON_AFTER_MS, RECONNECT_MS } from "../rooms/reconnect";

/**
 * Le salon à jour, sous son verrou (pris ici) : l'heure de la base décide, sans minuterie de processus (Next.js, Vercel).
 * - `actor` (qui agit) donne signe de vie ;
 * - COURSE-09 / SALLE-09 : une course passée son échéance (endsAt, plus RACE_GRACE_MS) passe aux résultats ;
 * - SALLE-08 : un membre silencieux depuis MEMBER_AWAY_MS est retiré, puis afterDeparture (hôte, fermeture, course).
 * Renvoie true si quelque chose a changé.
 */
async function sweep(tx: Db, roomId: number, actor?: string | string[]): Promise<boolean> {
  await tx.select({ id: rooms.id }).from(rooms).where(eq(rooms.id, roomId)).for("update");
  // COURSE-08 : avant le signe de vie de qui revient, pour qu'un retour après le délai trouve l'abandon
  const timedOut = await abandonSilentRunners(tx, roomId);
  const present = actor === undefined ? [] : [actor].flat();
  if (present.length) await tx.update(roomMembers).set({ lastSeenAt: sql`now()` }).where(and(eq(roomMembers.roomId, roomId), inArray(roomMembers.memberKey, present)));
  const deadline = sql`${rooms.launchedAt} + ${COUNTDOWN_MS} * interval '1 millisecond' + (select ${raceConfigs.duration} from ${raceConfigs} where ${raceConfigs.id} = ${rooms.configId}) * interval '1 second' + ${RACE_GRACE_MS} * interval '1 millisecond'`;
  const ended = (await stateOf(tx, roomId)) === "racing" ? await moveRoom(tx, roomId, "racing", ["finish"], {}, sql`${deadline} <= now()`) : [];
  // BOT-05 : les humains déjà tous arrivés, l'arrivée du dernier bot (calculée par le serveur) termine la course
  const botsDone = !ended.length && (await stateOf(tx, roomId)) === "racing" && (await endIfAllFinished(tx, roomId));
  const silent = sql`${roomMembers.lastSeenAt} < now() - ${MEMBER_AWAY_MS} * interval '1 millisecond'`;
  await keepDeparted(tx, roomId, (await tx.select({ key: roomMembers.memberKey }).from(roomMembers).where(and(eq(roomMembers.roomId, roomId), silent))).map((m) => m.key));
  const gone = await tx
    .delete(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), silent))
    .returning({ key: roomMembers.memberKey });
  if (gone.length) await afterDeparture(tx, roomId);
  if (ended.length) await rerankLaunch(tx, roomId); // COURSE-10 : la course échue est reclassée
  return timedOut || ended.length > 0 || gone.length > 0 || botsDone;
}

/**
 * COURSE-08 : les coureurs (participants ni arrivés ni ayant abandonné) silencieux depuis ABANDON_AFTER_MS, comptés au plus
 * tôt depuis le départ, ont abandonné : même effet que abandonRace (abandoned_at, progression validée gardée, une fin
 * pour COURSE-09). Le silence compte jusqu'à la fin de la course (endsAt), pas au-delà : un coureur déjà silencieux depuis
 * le délai à endsAt a abandonné, même balayé pendant la marge d'après (SALLE-09) ; un silence commencé trop tard pour
 * l'atteindre avant endsAt laisse le coureur classé par sa progression. Sans limite de temps, jusqu'à maintenant.
 * Seulement tant que la salle est en course (décompte exclu). Sous le verrou.
 */
async function abandonSilentRunners(tx: Db, roomId: number): Promise<boolean> {
  if ((await stateOf(tx, roomId)) !== "racing") return false;
  const startsAt = sql`(select ${rooms.launchedAt} + ${COUNTDOWN_MS} * interval '1 millisecond' from ${rooms} where ${rooms.id} = ${roomId})`;
  // least() ignore un null : sans durée (CONF-01), la fin est maintenant
  const until = sql`least(now(), (select ${rooms.launchedAt} + ${COUNTDOWN_MS} * interval '1 millisecond' + ${raceConfigs.duration} * interval '1 second' from ${rooms} join ${raceConfigs} on ${raceConfigs.id} = ${rooms.configId} where ${rooms.id} = ${roomId}))`;
  const gone = await tx
    .update(roomMembers)
    .set({ abandonedAt: sql`now()` })
    .where(
      and(
        eq(roomMembers.roomId, roomId),
        eq(roomMembers.role, "player"),
        isNull(roomMembers.finishedAt),
        isNull(roomMembers.abandonedAt),
        isNull(roomMembers.eliminatedAt), // COURSE-06 : un éliminé a fini sa course, il n'abandonne plus
        sql`greatest(${roomMembers.lastSeenAt}, ${startsAt}) < ${until} - ${ABANDON_AFTER_MS} * interval '1 millisecond'`,
      ),
    )
    .returning({ key: roomMembers.memberKey });
  if (gone.length) await endIfAllFinished(tx, roomId);
  return gone.length > 0;
}

/** Tous les salons qui ont une course échue ou un membre silencieux (explorateur, temps réel), chacun sous son verrou. */
async function sweepAll(db: Db): Promise<void> {
  const due = await db
    .selectDistinct({ id: rooms.id })
    .from(rooms)
    .leftJoin(roomMembers, eq(roomMembers.roomId, rooms.id))
    .where(and(ne(rooms.status, "closed"), sql`(${roomMembers.lastSeenAt} < now() - ${MEMBER_AWAY_MS} * interval '1 millisecond' or ${rooms.status} = 'racing')`));
  for (const { id } of due) await db.transaction((tx) => sweep(tx, id));
}

/** SALLE-08 / SALLE-06 : avant de refuser un deuxième salon, on met à jour l'actuel : un membre parti n'y est plus. */
async function settleCurrentRoom(db: Db, key: string, exceptRoomId?: number): Promise<void> {
  const [row] = await db.select({ roomId: roomMembers.roomId }).from(roomMembers).where(eq(roomMembers.memberKey, key));
  if (row && row.roomId !== exceptRoomId) await db.transaction((tx) => sweep(tx, row.roomId));
}

/**
 * SALLE-08 : après un départ (quitter, déconnexion, silence, expulsion), sous le verrou du salon.
 * - L'hôte parti : le rôle passe à la personne humaine connectée présente depuis le plus longtemps (participant ou
 *   spectateur, par ordre d'arrivée). Humaine : un compte (host_id pointe vers players), jamais un bot ni un invité.
 *   Connectée : les membres silencieux ont déjà été retirés (sweep).
 * - Plus personne pour être hôte : le salon est fermé et ses derniers membres (invités, bots) libérés (SALLE-06).
 * - Pendant une course, un coureur parti ne la retient pas (SALLE-09).
 * Renvoie l'état du salon après coup.
 */
async function afterDeparture(tx: Db, roomId: number): Promise<RoomStatus> {
  const [room] = await tx.select({ hostId: rooms.hostId, status: rooms.status }).from(rooms).where(eq(rooms.id, roomId));
  if (!room || room.status === "closed") return "closed";
  const left = await tx
    .select({ key: roomMembers.memberKey, playerId: roomMembers.playerId, isBot: players.isBot })
    .from(roomMembers)
    .leftJoin(players, eq(players.id, roomMembers.playerId))
    .where(eq(roomMembers.roomId, roomId))
    .orderBy(asc(roomMembers.joinedAt), asc(roomMembers.memberKey));
  if (!left.some((m) => m.key === memberKey({ playerId: room.hostId }))) {
    const next = left.find((m) => m.playerId !== null && !m.isBot);
    if (!next) {
      await tx.delete(roomMembers).where(eq(roomMembers.roomId, roomId));
      await moveRoom(tx, roomId, await stateOf(tx, roomId), ["abandon"]);
      return "closed";
    }
    await tx.update(rooms).set({ hostId: next.playerId! }).where(eq(rooms.id, roomId));
  }
  if (room.status === "racing") await endIfAllFinished(tx, roomId);
  return room.status;
}

/**
 * SALLE-08 / SALLE-09 : met un salon à jour (échéance de course, membres silencieux, hôte) sans qu'aucun membre n'agisse.
 * Le temps réel l'appelle à intervalle régulier pour annoncer ces changements à ses sockets ; `present` : les membres
 * dont une socket est ouverte, qui donnent ainsi signe de vie. True si quelque chose a changé.
 */
export async function refreshRoom(db: Db, code: string, present: string[] = []): Promise<boolean> {
  const id = await roomIdByCode(db, code);
  return id === null ? false : db.transaction((tx) => sweep(tx, id, present));
}

/**
 * SALLE-09 / COURSE-09 : plus aucun participant humain en course (fini, abandonné, éliminé ou parti) et, BOT-05, plus aucun bot
 * assis en course (arrivé selon le moteur, ou arrêté par la fin de la course) : le salon passe aux résultats. Le dernier
 * bot arrivé, c'est le balayage (sweep) qui l'y fait passer. Sous le verrou. True si le salon est passé aux résultats.
 */
async function endIfAllFinished(tx: Db, roomId: number): Promise<boolean> {
  // COURSE-06 : un coureur éliminé par le serveur (mode fatal) a fini, comme un abandon
  const racing = await tx.$count(roomMembers, and(eq(roomMembers.roomId, roomId), eq(roomMembers.role, "player"), isNull(roomMembers.finishedAt), isNull(roomMembers.abandonedAt), isNull(roomMembers.eliminatedAt)));
  if (racing) return false;
  // COURSE-01 : pendant le décompte (fin déclarée par le client, COURSE-06 pas encore là), le départ est avancé
  const from = await stateOf(tx, roomId);
  if (from !== "countdown" && from !== "racing") return false;
  if ((await launchStandings(tx, roomId)).botsRunning) return false;
  await moveRoom(tx, roomId, from, from === "countdown" ? ["start", "finish"] : ["finish"]);
  // COURSE-10 : une course envoyée plus tôt (à l'abandon) prend son rang final
  await rerankLaunch(tx, roomId);
  return true;
}

/**
 * COURSE-10 : la progression validée d'un coureur déjà parti (bouton « Quitter ») arrive souvent après son départ : le
 * temps réel ne l'écrit qu'à la fermeture de sa socket, quand sa ligne room_members n'existe plus. Elle complète alors
 * son entrée de rooms.departed (jamais en recul, jamais pour un arrivé). Sous le verrou du salon.
 */
async function keepDepartedProgress(tx: Db, roomId: number, key: string, progress: number) {
  const [room] = await tx.select({ departed: rooms.departed }).from(rooms).where(eq(rooms.id, roomId));
  const entry = room?.departed.find((d) => d.key === key);
  if (!entry || entry.finishedAt || entry.progress >= progress) return;
  await tx.update(rooms).set({ departed: room!.departed.map((d) => (d.key === key ? { ...d, progress } : d)) }).where(eq(rooms.id, roomId));
  // une course du lancement déjà enregistrée prend en compte cette progression
  await rerankLaunch(tx, roomId);
}

/**
 * COURSE-10 : avant de retirer ces membres, garde dans rooms.departed les coureurs (participants humains, pas les
 * abandons, déjà dans rooms.abandons) qui partent pendant la course ou ses résultats : leur progression validée et leur
 * arrivée, pour les classer parmi les non-terminés (ou les terminés) même après leur départ.
 */
async function keepDeparted(tx: Db, roomId: number, keys: string[]) {
  if (!keys.length) return;
  const [room] = await tx.select({ status: rooms.status, departed: rooms.departed }).from(rooms).where(eq(rooms.id, roomId));
  if (!room || (room.status !== "racing" && room.status !== "results")) return;
  const leaving = await tx
    .select({ key: roomMembers.memberKey, name: sql<string>`coalesce(${players.name}, ${roomMembers.guestName})`, progress: roomMembers.progress, seat: roomMembers.seat, finishedAt: roomMembers.finishedAt })
    .from(roomMembers)
    .leftJoin(players, eq(players.id, roomMembers.playerId))
    .where(and(eq(roomMembers.roomId, roomId), inArray(roomMembers.memberKey, keys), eq(roomMembers.role, "player"), isNull(roomMembers.abandonedAt), sql`coalesce(${players.isBot}, false) = false`));
  if (!leaving.length) return;
  const known = new Map(room.departed.map((d) => [d.key, d]));
  for (const m of leaving) known.set(m.key, { ...m, finishedAt: m.finishedAt?.toISOString() ?? null });
  await tx.update(rooms).set({ departed: [...known.values()] }).where(eq(rooms.id, roomId));
}

/** COURSE-01 : l'état d'un salon (le décompte dérivé de launched_at et de l'horloge de la base), null s'il n'existe pas. */
async function stateOf(db: Db, roomId: number): Promise<RaceState | null> {
  const [row] = await db
    .select({ status: rooms.status, sinceLaunchMs: sql<number | null>`extract(epoch from now() - ${rooms.launchedAt}) * 1000`.mapWith((v) => (v === null ? null : Number(v))) })
    .from(rooms)
    .where(eq(rooms.id, roomId));
  return row ? raceState(row.status, row.sinceLaunchMs) : null;
}

/** COURSE-01 : l'état d'un salon par son code (fermé compris), null si le code est inconnu. */
export async function roomRaceState(db: Db, code: string): Promise<RaceState | null> {
  const [row] = await db.select({ id: rooms.id }).from(rooms).where(eq(rooms.code, code));
  return row ? stateOf(db, row.id) : null;
}

/**
 * COURSE-01 : la seule écriture de rooms.status. `events` doit mener de `from` à un état permis (follow lève
 * InvalidTransition sinon) ; l'écriture n'a lieu que si le statut stocké est encore celui de `from` (et `where`).
 */
async function moveRoom(tx: Db, roomId: number, from: RaceState | null, events: RaceEvent[], extra: Omit<PgUpdateSetSource<typeof rooms>, "status"> = {}, where?: SQL) {
  if (from === null) return [];
  const to = follow(from, events);
  return tx
    .update(rooms)
    .set({ ...extra, status: storedStatus(to) })
    .where(and(eq(rooms.id, roomId), eq(rooms.status, storedStatus(from)), where))
    .returning({ id: rooms.id });
}

/**
 * SALLE-09 : ce membre a fini la course. Le salon passe aux résultats (et accepte de nouveau des arrivants) quand
 * chaque participant humain a fini ou est parti ; les spectateurs ne comptent pas. COURSE-06 : l'arrivée est celle
 * que le serveur temps réel a validée (recordProgress) ; un membre qui se déclare fini sans 100 % validé est ignoré.
 * Hors course, rien ne change (appel répété sans effet).
 */
export async function finishRoom(db: Db, code: string, who: Identity): Promise<RoomResult> {
  const { id } = await roomByCode(db, code);
  const key = memberKey(who);
  await db.transaction(async (tx) => {
    await sweep(tx, id, key);
    const [room] = await tx.select({ status: rooms.status }).from(rooms).where(eq(rooms.id, id)).for("update");
    if (!room) throw new RoomRefused("not_found");
    if (!(await membership(tx, id, key))) throw new RoomRefused("not_found"); // SALLE-10 : un non-membre ne sait pas si le salon existe
    if (room.status !== "racing") return;
    // COURSE-06 : seule une arrivée validée par le serveur temps réel (progress = 1) compte ; sinon l'appel est ignoré
    await tx.update(roomMembers).set({ finishedAt: sql`now()` }).where(and(eq(roomMembers.roomId, id), eq(roomMembers.memberKey, key), isNull(roomMembers.finishedAt), gte(roomMembers.progress, 1)));
    await endIfAllFinished(tx, id);
  });
  return { room: await roomView(db, id, key), you: key };
}

/**
 * COURSE-06 : la progression validée par le serveur temps réel (src/realtime/referee.ts), jamais par une route HTTP.
 * À 100 %, le coureur a fini (finished_at, heure de la base) et la course se termine si c'était le dernier (SALLE-09).
 * Hors course, ou pour un non-membre, rien ne change. Vrai si l'état du salon a changé (un coureur est arrivé).
 */
export async function recordProgress(db: Db, code: string, key: string, progress: number): Promise<boolean> {
  const id = await roomIdByCode(db, code);
  if (id === null) return false;
  return db.transaction(async (tx) => {
    const [room] = await tx.select({ status: rooms.status }).from(rooms).where(eq(rooms.id, id)).for("update");
    const value = Math.min(1, Math.max(0, progress));
    // COURSE-10 : le dernier coureur parti a fait passer le salon aux résultats ; sa progression, écrite par le temps réel
    // à la fermeture de sa socket, complète encore son entrée de rooms.departed (celle du lancement en cours : vidée au
    // lancement suivant). Rien d'autre ne change hors course.
    if (room?.status === "results" && value < 1) {
      await keepDepartedProgress(tx, id, key, value);
      return false;
    }
    if (room?.status !== "racing") return false;
    // COURSE-07 : la progression d'un membre qui a abandonné reste celle de l'abandon ; COURSE-06 : de même à l'élimination
    const member = and(eq(roomMembers.roomId, id), eq(roomMembers.memberKey, key), isNull(roomMembers.abandonedAt), isNull(roomMembers.eliminatedAt));
    if (value < 1) {
      const kept = await tx.update(roomMembers).set({ progress: sql`greatest(${roomMembers.progress}, ${value})` }).where(member).returning({ key: roomMembers.memberKey });
      if (!kept.length) await keepDepartedProgress(tx, id, key, value);
      return false;
    }
    const arrived = await tx.update(roomMembers).set({ progress: 1, finishedAt: sql`now()` }).where(and(member, isNull(roomMembers.finishedAt))).returning({ key: roomMembers.memberKey });
    if (!arrived.length) {
      await tx.update(roomMembers).set({ progress: 1 }).where(member);
      return false;
    }
    await endIfAllFinished(tx, id);
    return true;
  });
}

/**
 * COURSE-07 : ce participant abandonne la course en cours (abandoned_at, heure de la base). Sa progression est celle que
 * le serveur temps réel a validée : il l'écrit en base dès qu'il apprend l'abandon (keepProgress) ; recordProgress ne la
 * touche plus ensuite. Refusé hors course : décompte, ou temps écoulé même si la salle n'est pas encore aux résultats
 * (not_racing) ; pour un spectateur (not_player) ; après l'arrivée (already_finished).
 * Un second appel ne change rien. COURSE-09 : un abandon compte comme une fin ; le dernier coureur termine la course.
 */
export async function abandonRace(db: Db, code: string, who: Identity): Promise<RoomResult> {
  const { id } = await roomByCode(db, code);
  const key = memberKey(who);
  await db.transaction(async (tx) => {
    await sweep(tx, id, key);
    const [room] = await tx
      .select({ timeUp: sql<boolean>`coalesce(${rooms.launchedAt} + ${COUNTDOWN_MS} * interval '1 millisecond' + (select ${raceConfigs.duration} from ${raceConfigs} where ${raceConfigs.id} = ${rooms.configId}) * interval '1 second' <= now(), false)` })
      .from(rooms)
      .where(eq(rooms.id, id))
      .for("update");
    if (!room) throw new RoomRefused("not_found");
    const [member] = await tx.select({ role: roomMembers.role, finishedAt: roomMembers.finishedAt, abandonedAt: roomMembers.abandonedAt }).from(roomMembers).where(and(eq(roomMembers.roomId, id), eq(roomMembers.memberKey, key)));
    if (!member) throw new RoomRefused("not_found"); // SALLE-10 : un non-membre ne sait pas si le salon existe
    if (member.abandonedAt) return;
    if ((await stateOf(tx, id)) !== "racing" || room.timeUp) throw new RoomRefused("not_racing");
    if (member.role !== "player") throw new RoomRefused("not_player");
    if (member.finishedAt) throw new RoomRefused("already_finished");
    await tx.update(roomMembers).set({ abandonedAt: sql`now()` }).where(and(eq(roomMembers.roomId, id), eq(roomMembers.memberKey, key)));
    await keepAbandons(tx, id);
    await endIfAllFinished(tx, id);
  });
  return { room: await roomView(db, id, key), you: key };
}

/**
 * COURSE-06 : en mode fatal, la page annonce l'élimination de ce coureur au temps réel, qui l'écrit ici : eliminated_at
 * à l'heure de la base, et la progression validée par l'arbitre à ce moment (jamais en recul, jamais une arrivée). Une
 * fois, pour la course partie à `startsAt`, en course seulement, pour un participant ni arrivé, ni en abandon. Ensuite
 * sa progression est gelée (recordProgress, keepProgress). Hors mode fatal, rien. Vrai si l'élimination est notée.
 */
export async function eliminateRunner(db: Db, code: string, startsAt: number, key: string, progress: number): Promise<boolean> {
  const id = await roomIdByCode(db, code);
  if (id === null) return false;
  return db.transaction(async (tx) => {
    const [room] = await tx.select({ launchedAt: rooms.launchedAt, status: rooms.status, configId: rooms.configId }).from(rooms).where(eq(rooms.id, id)).for("update");
    if (!room?.launchedAt || room.status !== "racing" || room.launchedAt.getTime() + COUNTDOWN_MS !== startsAt) return false;
    const [config] = await tx.select({ mistakes: raceConfigs.mistakes }).from(raceConfigs).where(eq(raceConfigs.id, room.configId));
    if (config?.mistakes !== "fatal") return false;
    const value = Math.min(0.9999, Math.max(0, progress));
    const noted = await tx
      .update(roomMembers)
      .set({ eliminatedAt: sql`now()`, progress: sql`greatest(${roomMembers.progress}, ${value})` })
      .where(and(eq(roomMembers.roomId, id), eq(roomMembers.memberKey, key), eq(roomMembers.role, "player"), isNull(roomMembers.finishedAt), isNull(roomMembers.abandonedAt), isNull(roomMembers.eliminatedAt)))
      .returning({ key: roomMembers.memberKey });
    if (!noted.length) return false;
    // COURSE-09 : une élimination compte comme une fin ; le dernier coureur termine la course
    await endIfAllFinished(tx, id);
    return true;
  });
}

/**
 * COURSE-07 : le serveur temps réel garde en base la dernière progression validée de ces coureurs (à l'abandon, à la fin
 * de la course), abandons compris ; jamais une arrivée (moins de 100 %) ni pour un coureur arrivé, jamais en recul.
 * Seulement pour la course partie à `startsAt` : une relance entre-temps (progression remise à 0) n'est pas touchée.
 * Appelée par le temps réel (src/realtime/room-backend.ts), jamais par une route HTTP.
 */
export async function keepProgress(db: Db, code: string, startsAt: number, rows: { key: string; progress: number }[]): Promise<void> {
  const id = await roomIdByCode(db, code);
  if (id === null || !rows.length) return;
  await db.transaction(async (tx) => {
    const [room] = await tx.select({ launchedAt: rooms.launchedAt, status: rooms.status }).from(rooms).where(eq(rooms.id, id)).for("update");
    if (!room?.launchedAt || (room.status !== "racing" && room.status !== "results")) return;
    if (room.launchedAt.getTime() + COUNTDOWN_MS !== startsAt) return;
    for (const { key, progress } of rows) {
      const value = Math.min(0.9999, Math.max(0, progress));
      await tx
        .update(roomMembers)
        .set({ progress: sql`greatest(${roomMembers.progress}, ${value})` })
        .where(and(eq(roomMembers.roomId, id), eq(roomMembers.memberKey, key), isNull(roomMembers.finishedAt), isNull(roomMembers.eliminatedAt)));
    }
    await keepAbandons(tx, id); // COURSE-10 : la progression gardée à l'abandon
  });
}

/**
 * BONUS-04 : garde le texte d'un coureur changé par un bonus et sa progression recomptée sur ce texte (elle peut baisser :
 * +3 mots), pour la course partie à `startsAt` seulement, s'il n'est ni arrivé ni en abandon. Écrit par le serveur temps
 * réel ; relu à sa reprise (createRoomBackend) et à l'enregistrement de la course (claimServerRace).
 */
export async function keepBonusText(db: Db, code: string, startsAt: number, key: string, words: string[], progress: number): Promise<void> {
  const id = await roomIdByCode(db, code);
  if (id === null || !words.length) return;
  await db.transaction(async (tx) => {
    const [room] = await tx.select({ launchedAt: rooms.launchedAt, status: rooms.status }).from(rooms).where(eq(rooms.id, id)).for("update");
    if (!room?.launchedAt || room.status !== "racing" || room.launchedAt.getTime() + COUNTDOWN_MS !== startsAt) return;
    const value = Math.min(0.9999, Math.max(0, progress));
    // un coureur déjà noté arrivé (arrivée en vol, effet annulé) garde son arrivée : seul son texte change
    await tx
      .update(roomMembers)
      .set({ bonusWords: words, progress: sql`case when ${roomMembers.finishedAt} is null then ${value} else ${roomMembers.progress} end` })
      .where(and(eq(roomMembers.roomId, id), eq(roomMembers.memberKey, key), isNull(roomMembers.abandonedAt), isNull(roomMembers.eliminatedAt)));
  });
}

/**
 * BOT-04 : ajoute un effet de bonus reçu par un bot à la liste de la course partie à `startsAt` (rooms.bot_bonuses), dans
 * l'ordre où le serveur temps réel l'a décidé. Relu par la fin de course et le classement (launchBots) et par les pages.
 */
export async function keepBotBonus(db: Db, code: string, startsAt: number, bonus: BotBonus): Promise<void> {
  const id = await roomIdByCode(db, code);
  if (id === null) return;
  await db.transaction(async (tx) => {
    const [room] = await tx.select({ launchedAt: rooms.launchedAt, status: rooms.status }).from(rooms).where(eq(rooms.id, id)).for("update");
    if (!room?.launchedAt || room.status !== "racing" || room.launchedAt.getTime() + COUNTDOWN_MS !== startsAt) return;
    // deux écritures concurrentes peuvent passer dans le désordre : la liste est rangée par (at, seq), l'ordre du serveur
    const list = sql`${rooms.botBonuses} || ${JSON.stringify([bonus])}::jsonb`;
    await tx
      .update(rooms)
      .set({ botBonuses: sql`(select coalesce(jsonb_agg(e order by (e->>'at')::bigint, coalesce((e->>'seq')::bigint, 0), n), '[]'::jsonb) from jsonb_array_elements(${list}) with ordinality as t(e, n))` })
      .where(eq(rooms.id, id));
  });
}

/**
 * HIST-02 : ajoute un bonus reçu par ce membre (son type, null : sans effet) à ceux de la course partie à `startsAt`
 * (room_members.received_bonuses), au plus MAX_BONUSES, en course seulement. Écrit par le serveur temps réel ; relu à
 * l'enregistrement de la course (launchStandings), qui garde ces bonus avec elle pour l'historique (RES-02).
 */
export async function keepReceivedBonus(db: Db, code: string, startsAt: number, key: string, kind: BonusKind | null): Promise<void> {
  const id = await roomIdByCode(db, code);
  if (id === null || (kind !== null && !BONUS_KINDS.includes(kind))) return;
  await db.transaction(async (tx) => {
    const [room] = await tx.select({ launchedAt: rooms.launchedAt, status: rooms.status }).from(rooms).where(eq(rooms.id, id)).for("update");
    if (!room?.launchedAt || room.status !== "racing" || room.launchedAt.getTime() + COUNTDOWN_MS !== startsAt) return;
    await tx
      .update(roomMembers)
      .set({ receivedBonuses: sql`${roomMembers.receivedBonuses} || ${JSON.stringify([kind])}::jsonb` })
      .where(and(eq(roomMembers.roomId, id), eq(roomMembers.memberKey, key), sql`jsonb_array_length(${roomMembers.receivedBonuses}) < ${MAX_BONUSES}`));
  });
}

/**
 * BONUS-01 : garde le nombre de points de contrôle franchis (1 à 3) de la course partie à `startsAt` (rooms.bonus_checkpoints),
 * jamais en recul : deux écritures dans le désordre gardent la plus grande. Relu par un serveur temps réel redémarré, qui
 * ne redonne pas les bonus de ces points (même franchis par un bot meneur, dont la progression n'est pas en base).
 */
export async function keepCheckpoints(db: Db, code: string, startsAt: number, passed: number): Promise<void> {
  const id = await roomIdByCode(db, code);
  if (id === null || !Number.isInteger(passed) || passed < 1) return;
  const value = Math.min(CHECKPOINTS.length, passed);
  await db.transaction(async (tx) => {
    const [room] = await tx.select({ launchedAt: rooms.launchedAt, status: rooms.status }).from(rooms).where(eq(rooms.id, id)).for("update");
    if (!room?.launchedAt || room.status !== "racing" || room.launchedAt.getTime() + COUNTDOWN_MS !== startsAt) return;
    await tx.update(rooms).set({ bonusCheckpoints: sql`greatest(${rooms.bonusCheckpoints}, ${value})` }).where(eq(rooms.id, id));
  });
}

/**
 * COURSE-10 : recopie dans rooms.abandons les membres présents qui ont abandonné (nom, progression validée, place) ;
 * ceux déjà notés et partis depuis y restent. Ainsi l'abandon survit au départ du membre (podium, enregistrement).
 */
async function keepAbandons(tx: Db, roomId: number) {
  const present = await tx
    .select({ key: roomMembers.memberKey, name: sql<string>`coalesce(${players.name}, ${roomMembers.guestName})`, progress: roomMembers.progress, seat: roomMembers.seat })
    .from(roomMembers)
    .leftJoin(players, eq(players.id, roomMembers.playerId))
    .where(and(eq(roomMembers.roomId, roomId), isNotNull(roomMembers.abandonedAt)));
  const [room] = await tx.select({ abandons: rooms.abandons }).from(rooms).where(eq(rooms.id, roomId));
  const known = new Map((room?.abandons ?? []).map((a) => [a.key, a]));
  for (const row of present) known.set(row.key, row);
  await tx.update(rooms).set({ abandons: [...known.values()] }).where(eq(rooms.id, roomId));
}

/**
 * SALLE-07 : l'hôte expulse un participant ou un spectateur. Le membre est retiré et noté dans room_bans, sous le
 * verrou du salon : il ne peut plus y entrer (joinRoom), et sa page reçoit « kicked » (readRoom). Pendant une course,
 * le retrait d'un coureur ne la retient pas. Seul l'hôte expulse, jamais lui-même.
 */
export async function kickMember(db: Db, code: string, who: Identity, target: string): Promise<RoomResult> {
  const { id } = await roomByCode(db, code);
  const key = memberKey(who);
  await db.transaction(async (tx) => {
    await sweep(tx, id, key);
    const [room] = await tx.select({ status: rooms.status, hostId: rooms.hostId }).from(rooms).where(eq(rooms.id, id)).for("update");
    if (!room || room.status === "closed") throw new RoomRefused("not_found");
    if (!(await membership(tx, id, key))) throw new RoomRefused("not_found"); // SALLE-10 : un non-membre ne sait pas si le salon existe
    if (key !== memberKey({ playerId: room.hostId })) throw new RoomRefused("not_host");
    if (target === key) throw new RoomRefused("invalid_target");
    await keepDeparted(tx, id, [target]);
    const [removed] = await tx.delete(roomMembers).where(and(eq(roomMembers.roomId, id), eq(roomMembers.memberKey, target))).returning({ playerId: roomMembers.playerId, guestName: roomMembers.guestName, ip: roomMembers.ip });
    if (!removed) throw new RoomRefused("unknown_member");
    const [account] = removed.playerId === null ? [] : await tx.select({ name: players.name }).from(players).where(eq(players.id, removed.playerId));
    const name = removed.guestName ?? account?.name;
    const bans = [target, ...(name ? [nameBan(name)] : []), ...(removed.ip ? [ipBan(removed.ip)] : [])];
    await tx.insert(roomBans).values(bans.map((memberKey) => ({ roomId: id, memberKey }))).onConflictDoNothing();
    // SALLE-04 : son lien d'invitation personnel est révoqué dans la même transaction. room_bans suffit déjà à le
    // refuser à l'entrée, quel que soit le lien ; la révocation retire le jeton et l'hôte le voit « révoqué ».
    await revokeInvitesOf(tx, id, target);
    await afterDeparture(tx, id);
  });
  return { room: await roomView(db, id, key), you: key };
}

/**
 * COURSE-11 : sur l'écran des résultats, l'hôte ferme la salle. Sous le verrou du salon : il passe à « closed » et tous
 * ses membres en sortent (libres d'entrer ailleurs, SALLE-06). Seul l'hôte ferme ; pendant une course, c'est refusé.
 */
export async function closeRoom(db: Db, code: string, who: Identity): Promise<{ closed: true }> {
  const { id } = await roomByCode(db, code);
  const key = memberKey(who);
  await db.transaction(async (tx) => {
    await sweep(tx, id, key);
    const [room] = await tx.select({ status: rooms.status, hostId: rooms.hostId }).from(rooms).where(eq(rooms.id, id)).for("update");
    if (!room || room.status === "closed") throw new RoomRefused("not_found");
    if (!(await membership(tx, id, key))) throw new RoomRefused("not_found"); // SALLE-10 : un non-membre ne sait pas si le salon existe
    if (key !== memberKey({ playerId: room.hostId })) throw new RoomRefused("not_host");
    if (room.status === "racing") throw new RoomRefused("in_race");
    // COURSE-01 : « close » n'est permis que depuis RÉSULTATS (COURSE-11 : sur l'écran des résultats).
    if (room.status !== "results") throw new RoomRefused("not_results");
    await tx.delete(roomMembers).where(eq(roomMembers.roomId, id));
    await moveRoom(tx, id, "results", ["close"]);
  });
  return { closed: true };
}

/**
 * Quitter un salon. SALLE-08 : si l'hôte part, le rôle passe à la personne humaine connectée la plus ancienne ;
 * sans personne pour le reprendre, le salon est fermé (afterDeparture).
 */
export async function leaveRoom(db: Db, code: string, who: Identity, options: { unlessRacing?: boolean; unlessLaunchedWithinMs?: number } = {}): Promise<{ left: boolean }> {
  const { id } = await roomByCode(db, code);
  // sous le verrou du salon, comme joinRoom et launchRoom : l'état lu et la fermeture ne croisent ni entrée ni lancement
  return db.transaction(async (tx) => {
    // sans signe de vie pour celui qui part : une déconnexion ne doit pas le garder présent
    await sweep(tx, id);
    const within = options.unlessLaunchedWithinMs ?? 0;
    const [room] = await tx
      .select({ status: rooms.status, launchedRecently: sql<boolean>`coalesce(${rooms.launchedAt} > now() - ${within} * interval '1 millisecond', false)` })
      .from(rooms)
      .where(eq(rooms.id, id))
      .for("update");
    // SALLE-10 : un salon fermé, ou dont on n'est pas membre, répond comme un code inconnu
    if (!room || room.status === "closed") throw new RoomRefused("not_found");
    if (options.unlessRacing && room.status === "racing") return { left: false };
    if (within > 0 && room.launchedRecently) return { left: false };
    await keepDeparted(tx, id, [memberKey(who)]);
    const removed = await tx.delete(roomMembers).where(and(eq(roomMembers.roomId, id), eq(roomMembers.memberKey, memberKey(who)))).returning({ key: roomMembers.memberKey });
    if (!removed.length) throw new RoomRefused("not_found");
    await afterDeparture(tx, id);
    return { left: true };
  });
}

/**
 * Départ constaté par le temps réel (plus aucune socket depuis `awayMs`) : pendant une course, les membres sont sur
 * /game, sans socket de salon ; ils restent membres et le salon reste ouvert. Une course lancée pendant cette absence,
 * ou juste avant (la socket s'est fermée en partant courir), garde aussi sa place à un membre, même si elle est déjà
 * finie. Sinon, c'est un départ (leaveRoom). L'horloge est celle de la base, comme launched_at.
 */
export function leaveAfterDisconnect(db: Db, code: string, who: Identity, awayMs = 0): Promise<{ left: boolean }> {
  return leaveRoom(db, code, who, { unlessRacing: true, unlessLaunchedWithinMs: 2 * awayMs });
}

/** L'id d'un salon ouvert, ou null s'il n'existe pas ou est fermé. */
export async function roomIdByCode(db: Db, code: string): Promise<number | null> {
  const [row] = await db.select({ id: rooms.id }).from(rooms).where(and(eq(rooms.code, code), ne(rooms.status, "closed")));
  return row?.id ?? null;
}

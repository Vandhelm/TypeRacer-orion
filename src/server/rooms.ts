// Salons, côté serveur (SALLE-01, 02, 03, 09). Indépendant du transport : les routes HTTP (api.ts) et le temps réel
// (realtime.ts) appellent ces fonctions ; rien ici ne connaît Request, WebSocket ou Next.js.
import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { z } from "zod";
import type { Db } from "../../db/client";
import { players, raceConfigs, roomBans, roomMembers, rooms } from "../../db/schema";
import { allows, canJoin, newInviteToken, newRoomCode } from "../rooms/access";
import { seatColor } from "../rooms/seats";
import { DEFAULT_SETTINGS, type CreateRoomSchema, type Role, type RoomSettings, type UpdateRoomSchema } from "../rooms/settings";

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
 * La clé d'un membre : la même personne a la même clé dans tous les salons (SALLE-06 pourra la rendre unique).
 * Un invité est sa session signée (id aléatoire du cookie), jamais son pseudonyme, que n'importe qui peut reprendre.
 */
export function memberKey(who: Identity | { playerId: number }): string {
  if ("playerId" in who) return `player:${who.playerId}`;
  return `guest:${who.sessionId}`;
}

/** finished (SALLE-09) : ce membre a fini la course en cours ; son retour au salon ne le renvoie pas courir. */
export type MemberView = { key: string; name: string; guest: boolean; host: boolean; role: Role; seat: number | null; color: string | null; finished: boolean };
export type RoomView = {
  code: string;
  status: RoomStatus;
  /** Clé du membre hôte. */
  host: string;
  settings: RoomSettings;
  /** Le lien d'invitation, montré à l'hôte seulement. À BRANCHER (SALLE-04) : un lien par invité. */
  invite: string | null;
  /** Par ordre d'arrivée. */
  members: MemberView[];
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
export type RefusalReason = "not_found" | "not_member" | "not_host" | "full" | "in_race" | "closed" | "already_in_room" | "kicked" | "invalid_target" | "unknown_member";

/** SALLE-07 : cette personne a été expulsée de ce salon. */
async function isKicked(db: Db, roomId: number, key: string, name?: string): Promise<boolean> {
  const keys = name ? [key, nameBan(name)] : [key];
  return (await db.$count(roomBans, and(eq(roomBans.roomId, roomId), inArray(roomBans.memberKey, keys)))) > 0;
}

/**
 * SALLE-07 : un invité expulsé obtient sans peine une nouvelle session (POST /api/guest) ; son pseudonyme, lui, est
 * banni aussi (une ligne « name:<pseudonyme en minuscules> » dans room_bans), et un compte ne revient pas en invité
 * sous son nom. Limite : sous un autre pseudonyme, rien ne le reconnaît (pas de bannissement par IP).
 */
const nameBan = (name: string) => `name:${name.toLowerCase()}`;

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
  mistakes: config.mistakes,
  excluded: config.excluded,
  text: config.customText,
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
  mistakes: s.mistakes,
  excluded: s.excluded,
  customText: s.text,
});

const roomColumnsOf = (s: RoomSettings) => ({ name: s.autoName ? "" : s.name, autoName: s.autoName || !s.name, visibility: s.visibility, guests: s.guests, bots: s.bots });

/** L'état d'un salon tel que le voit `viewer` (seul l'hôte reçoit le lien d'invitation). */
export async function roomView(db: Db, roomId: number, viewer?: string): Promise<RoomView> {
  const [row] = await db.select().from(rooms).innerJoin(raceConfigs, eq(raceConfigs.id, rooms.configId)).where(eq(rooms.id, roomId));
  if (!row) throw new RoomRefused("not_found");
  const members = await db
    .select({ key: roomMembers.memberKey, playerId: roomMembers.playerId, guestName: roomMembers.guestName, playerName: players.name, role: roomMembers.role, seat: roomMembers.seat, color: roomMembers.color, finishedAt: roomMembers.finishedAt })
    .from(roomMembers)
    .leftJoin(players, eq(players.id, roomMembers.playerId))
    .where(eq(roomMembers.roomId, roomId))
    .orderBy(asc(roomMembers.joinedAt), asc(roomMembers.memberKey));
  const host = memberKey({ playerId: row.rooms.hostId });
  return {
    code: row.rooms.code,
    status: row.rooms.status,
    host,
    settings: settingsOf(row.rooms, row.race_configs),
    invite: viewer === host ? row.rooms.inviteToken : null,
    members: members.map((m) => ({ key: m.key, name: m.playerName ?? m.guestName ?? "", guest: m.playerId === null, host: m.key === host, role: m.role, seat: m.seat, color: m.color, finished: m.finishedAt !== null })),
  };
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
export async function createRoom(db: Db, host: { playerId: number }, input: CreateRoomInput, draw: () => string = newRoomCode): Promise<RoomResult> {
  const settings = { ...DEFAULT_SETTINGS, ...input.settings };
  const key = memberKey(host);
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
          .values({ code, inviteToken: newInviteToken(), ...roomColumnsOf(settings), hostId: host.playerId, configId: config!.id })
          .returning({ id: rooms.id });
        await tx.insert(roomMembers).values({ roomId: room!.id, memberKey: key, playerId: host.playerId, role: input.role, ...placeFor(input.role, [], settings.guests) });
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
    if (room.status !== "closed" && (await isKicked(db, room.id, key, who.name))) throw new RoomRefused("kicked");
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
      const settings = { ...settingsOf(room, config!), ...input.settings };
      // SALLE-05 : la capacité ne descend pas sous le nombre de participants déjà assis
      if (settings.guests < taken.filter((seat) => seat !== null).length) throw new RoomRefused("full");
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

/** Ce que montre l'explorateur d'un salon public. Ni lien d'invitation, ni membres nommés. */
export type ListedRoom = { code: string; name: string; autoName: boolean; language: RoomSettings["language"]; guests: number; bots: boolean; players: number; status: RoomStatus };

/** Les salons publics ouverts, les plus récents d'abord. Un salon « sur code » ou privé n'y est jamais. */
export async function listPublicRooms(db: Db, limit = 50): Promise<ListedRoom[]> {
  await sweepAll(db);
  const playerCount = sql<number>`(select count(*) from ${roomMembers} where ${roomMembers.roomId} = ${rooms.id} and ${roomMembers.role} = 'player')`.mapWith(Number);
  return db
    .select({ code: rooms.code, name: rooms.name, autoName: rooms.autoName, language: raceConfigs.language, guests: rooms.guests, bots: rooms.bots, players: playerCount, status: rooms.status })
    .from(rooms)
    .innerJoin(raceConfigs, eq(raceConfigs.id, rooms.configId))
    .where(and(eq(rooms.visibility, "public"), ne(rooms.status, "closed")))
    .orderBy(desc(rooms.createdAt), desc(rooms.id))
    .limit(limit);
}

/** Comment on entre : par le code du salon, ou par un lien d'invitation. */
export type JoinVia = ({ code: string } | { invite: string }) & { role?: Role };

/**
 * Le salon visé par ce code ou ce lien. La visibilité se vérifie ensuite, sous le verrou, après l'appartenance :
 * un membre retrouve son salon par son code même s'il est privé (SALLE-03).
 */
async function roomFor(db: Db, via: JoinVia) {
  // À BRANCHER (SALLE-04) : un jeton par invité, lié à son IP ; ici, le jeton unique du salon.
  const [room] = await db.select().from(rooms).where("code" in via ? eq(rooms.code, via.code) : eq(rooms.inviteToken, via.invite));
  // À BRANCHER (SALLE-10) : limiter les essais de code par IP, avant cette lecture, dans la route.
  if (!room) throw new RoomRefused("not_found");
  return room;
}

/**
 * Entrer dans un salon comme participant, ou comme spectateur (SALLE-05 : il ne prend pas de place). Un membre qui revient (rechargement, autre onglet) le retrouve sans doublon.
 * SALLE-05 : la capacité (rooms.guests) est lue sous le verrou. SALLE-06 : une salle à la fois (contrainte en base,
 * refus « already_in_room » avec le salon actuel). SALLE-07 : un expulsé est refusé (« kicked »). SALLE-09 (état du
 * salon) se vérifie aussi ici, avant l'insertion.
 */
export async function joinRoom(db: Db, who: Identity, via: JoinVia): Promise<RoomResult> {
  const { id } = await roomFor(db, via);
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
    if (await membership(tx, id, key)) return;
    // SALLE-07 : un expulsé ne revient pas, ni par code ni par lien, quel que soit le rôle demandé
    if (await isKicked(tx, id, key, who.name)) throw new RoomRefused("kicked");
    // la visibilité est lue sous le verrou : l'hôte a pu rendre le salon privé entre-temps
    if ("code" in via && !allows(room.visibility, "code")) throw new RoomRefused("not_found");
    if (!canJoin(room.status)) throw new RoomRefused("in_race");
    // SALLE-06 : membre d'un autre salon ; vérifié après l'accès, pour ne rien dire d'un salon qu'on ne peut pas ouvrir
    const current = await currentRoomOf(tx, key);
    if (current) throw new RoomRefused("already_in_room", current);
    const taken = (await tx.select({ seat: roomMembers.seat }).from(roomMembers).where(eq(roomMembers.roomId, id))).map((m) => m.seat);
    const identity = who.kind === "account" ? { playerId: who.playerId } : { guestName: who.name };
    const role = via.role ?? "player";
    await tx.insert(roomMembers).values({ roomId: id, memberKey: key, ...identity, role, ...placeFor(role, taken, room.guests) });
  });
  await entered.catch((error: unknown) => refuseSecondRoom(db, key, error));
  return { room: await roomView(db, id, key), you: key };
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
    const [room] = await tx.select({ status: rooms.status, hostId: rooms.hostId }).from(rooms).where(eq(rooms.id, id)).for("update");
    if (!room) throw new RoomRefused("not_found");
    if (!(await membership(tx, id, key))) throw new RoomRefused("not_found"); // SALLE-10 : un non-membre ne sait pas si le salon existe
    if (key !== memberKey({ playerId: room.hostId })) throw new RoomRefused("not_host");
    if (room.status === "closed") throw new RoomRefused("not_found");
    if (!canJoin(room.status)) throw new RoomRefused("in_race");
    await tx.update(rooms).set({ status: "racing", launchedAt: sql`now()` }).where(eq(rooms.id, id));
    await tx.update(roomMembers).set({ finishedAt: null }).where(eq(roomMembers.roomId, id));
  });
  return { room: await roomView(db, id, key), you: key };
}

/** SALLE-09 : marge après la durée de la course (décompte de 3 s, réseau, envoi de la fin) avant de la clore d'office. */
export const RACE_GRACE_MS = 30_000;
/** SALLE-09 : l'échéance d'une course, depuis son lancement : sa durée (race_configs.duration, en secondes) plus la marge. */
export const raceDeadlineMs = (durationSeconds: number) => durationSeconds * 1000 + RACE_GRACE_MS;
/**
 * SALLE-08 : sans signe de vie (lecture du salon, action) depuis ce délai, un membre est parti, socket ou pas.
 * Les pages relisent le salon toutes les 3 à 15 s ; la marge couvre un onglet en arrière-plan, que le navigateur
 * ralentit (une minuterie par minute au pire).
 */
export const MEMBER_AWAY_MS = 90_000;

/**
 * Le salon à jour, sous son verrou (pris ici) : l'heure de la base décide, sans minuterie de processus (Next.js, Vercel).
 * - `actor` (qui agit) donne signe de vie ;
 * - SALLE-09 : une course passée son échéance (sa propre durée) passe aux résultats ;
 * - SALLE-08 : un membre silencieux depuis MEMBER_AWAY_MS est retiré, puis afterDeparture (hôte, fermeture, course).
 * Renvoie true si quelque chose a changé.
 */
async function sweep(tx: Db, roomId: number, actor?: string | string[]): Promise<boolean> {
  await tx.select({ id: rooms.id }).from(rooms).where(eq(rooms.id, roomId)).for("update");
  const present = actor === undefined ? [] : [actor].flat();
  if (present.length) await tx.update(roomMembers).set({ lastSeenAt: sql`now()` }).where(and(eq(roomMembers.roomId, roomId), inArray(roomMembers.memberKey, present)));
  const deadline = sql`${rooms.launchedAt} + (select ${raceConfigs.duration} from ${raceConfigs} where ${raceConfigs.id} = ${rooms.configId}) * interval '1 second' + ${RACE_GRACE_MS} * interval '1 millisecond'`;
  const ended = await tx.update(rooms).set({ status: "results" }).where(and(eq(rooms.id, roomId), eq(rooms.status, "racing"), sql`${deadline} <= now()`)).returning({ id: rooms.id });
  const gone = await tx
    .delete(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), sql`${roomMembers.lastSeenAt} < now() - ${MEMBER_AWAY_MS} * interval '1 millisecond'`))
    .returning({ key: roomMembers.memberKey });
  if (gone.length) await afterDeparture(tx, roomId);
  return ended.length > 0 || gone.length > 0;
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
      await tx.update(rooms).set({ status: "closed" }).where(eq(rooms.id, roomId));
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

/** SALLE-09 : plus aucun participant humain en course (fini ou parti) : le salon passe aux résultats. Sous le verrou. */
async function endIfAllFinished(tx: Db, roomId: number) {
  const racing = await tx.$count(roomMembers, and(eq(roomMembers.roomId, roomId), eq(roomMembers.role, "player"), isNull(roomMembers.finishedAt)));
  if (!racing) await tx.update(rooms).set({ status: "results" }).where(and(eq(rooms.id, roomId), eq(rooms.status, "racing")));
}

/**
 * SALLE-09 : ce membre a fini la course. Le salon passe aux résultats (et accepte de nouveau des arrivants) quand
 * chaque participant humain a fini ou est parti ; les spectateurs ne comptent pas. La course se joue dans chaque
 * navigateur (COURSE-* pas encore côté serveur) : un membre ne peut déclarer fini que lui-même, jamais les autres.
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
    await tx.update(roomMembers).set({ finishedAt: sql`now()` }).where(and(eq(roomMembers.roomId, id), eq(roomMembers.memberKey, key), isNull(roomMembers.finishedAt)));
    await endIfAllFinished(tx, id);
  });
  return { room: await roomView(db, id, key), you: key };
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
    const [removed] = await tx.delete(roomMembers).where(and(eq(roomMembers.roomId, id), eq(roomMembers.memberKey, target))).returning({ playerId: roomMembers.playerId, guestName: roomMembers.guestName });
    if (!removed) throw new RoomRefused("unknown_member");
    const [account] = removed.playerId === null ? [] : await tx.select({ name: players.name }).from(players).where(eq(players.id, removed.playerId));
    const name = removed.guestName ?? account?.name;
    await tx.insert(roomBans).values([{ roomId: id, memberKey: target }, ...(name ? [{ roomId: id, memberKey: nameBan(name) }] : [])]).onConflictDoNothing();
    // À BRANCHER (SALLE-04) : révoquer ici, dans la même transaction, le lien d'invitation personnel de `target`.
    // room_bans suffit déjà à le refuser à l'entrée, quel que soit le lien ; la révocation nettoie le jeton.
    await afterDeparture(tx, id);
  });
  return { room: await roomView(db, id, key), you: key };
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

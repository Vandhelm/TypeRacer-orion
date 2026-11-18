// Salons, côté serveur (SALLE-01, 02, 03, 09). Indépendant du transport : les routes HTTP (api.ts) et le temps réel
// (realtime.ts) appellent ces fonctions ; rien ici ne connaît Request, WebSocket ou Next.js.
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import type { z } from "zod";
import type { Db } from "../../db/client";
import { players, raceConfigs, roomMembers, rooms } from "../../db/schema";
import { allows, canJoin, newInviteToken, newRoomCode } from "../rooms/access";
import { SEAT_COLORS } from "../rooms/seats";
import { DEFAULT_SETTINGS, type CreateRoomSchema, type Role, type RoomSettings, type UpdateRoomSchema } from "../rooms/settings";

export type CreateRoomInput = z.infer<typeof CreateRoomSchema>;
export type UpdateRoomInput = z.infer<typeof UpdateRoomSchema>;

/** Trop de collisions de suite : l'espace des codes est saturé (ou le tirage est cassé). */
export class CodeExhausted extends Error {}

const CODE_ATTEMPTS = 8;

/** Une violation d'unicité sur le code du salon, quel que soit le pilote (postgres-js, PGlite) et l'enveloppe de Drizzle. */
function isCodeCollision(error: unknown): boolean {
  for (let e: unknown = error; e && typeof e === "object"; e = (e as { cause?: unknown }).cause) {
    const { code, constraint, constraint_name } = e as { code?: string; constraint?: string; constraint_name?: string };
    if (code === "23505" && (constraint ?? constraint_name) === "rooms_code_unique") return true;
  }
  return false;
}

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

export type MemberView = { key: string; name: string; guest: boolean; host: boolean; role: Role; seat: number | null; color: string | null };
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

/** La première place libre (0 à 7) ; null si le salon est plein. */
function freeSeat(taken: (number | null)[]): number | null {
  for (let seat = 0; seat < SEAT_COLORS.length; seat++) if (!taken.includes(seat)) return seat;
  return null;
}

/** Une place pour un participant, aucune pour un spectateur. */
function placeFor(role: Role, taken: (number | null)[]) {
  if (role === "spectator") return { seat: null, color: null };
  const seat = freeSeat(taken);
  if (seat === null) throw new RoomRefused("full");
  return { seat, color: SEAT_COLORS[seat]! };
}

/** Un refus attendu (pas une panne) : la route le traduit en statut HTTP, le temps réel en message. */
export class RoomRefused extends Error {
  constructor(readonly reason: RefusalReason) {
    super(`Room refused: ${reason}`);
  }
}
export type RefusalReason = "not_found" | "not_member" | "not_host" | "full" | "in_race" | "closed";

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
    .select({ key: roomMembers.memberKey, playerId: roomMembers.playerId, guestName: roomMembers.guestName, playerName: players.name, role: roomMembers.role, seat: roomMembers.seat, color: roomMembers.color })
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
    members: members.map((m) => ({ key: m.key, name: m.playerName ?? m.guestName ?? "", guest: m.playerId === null, host: m.key === host, role: m.role, seat: m.seat, color: m.color })),
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
  const roomId = await withFreshCode(
    (code) =>
      db.transaction(async (tx) => {
        const [config] = await tx.insert(raceConfigs).values(configOf(settings)).returning({ id: raceConfigs.id });
        const [room] = await tx
          .insert(rooms)
          .values({ code, inviteToken: newInviteToken(), ...roomColumnsOf(settings), hostId: host.playerId, configId: config!.id })
          .returning({ id: rooms.id });
        await tx.insert(roomMembers).values({ roomId: room!.id, memberKey: key, playerId: host.playerId, role: input.role, ...placeFor(input.role, []) });
        return room!.id;
      }),
    draw,
  );
  return { room: await roomView(db, roomId, key), you: key };
}

/** L'état d'un salon pour l'un de ses membres (rechargement de la page, reconnexion). */
export async function readRoom(db: Db, code: string, who: Identity): Promise<RoomResult> {
  const room = await roomByCode(db, code);
  const key = memberKey(who);
  if (!(await membership(db, room.id, key))) throw new RoomRefused("not_member");
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
    // sous le verrou du salon, comme joinRoom : les places prises et les réglages ne bougent pas pendant le changement
    const [room] = await tx.select().from(rooms).where(eq(rooms.id, id)).for("update");
    if (!room) throw new RoomRefused("not_found");
    const member = await membership(tx, id, key);
    if (!member) throw new RoomRefused("not_member");
    if (key !== memberKey({ playerId: room.hostId })) throw new RoomRefused("not_host");
    if (input.settings) {
      const [config] = await tx.select().from(raceConfigs).where(eq(raceConfigs.id, room.configId));
      const settings = { ...settingsOf(room, config!), ...input.settings };
      const [next] = await tx.insert(raceConfigs).values(configOf(settings)).returning({ id: raceConfigs.id });
      await tx.update(rooms).set({ ...roomColumnsOf(settings), configId: next!.id }).where(eq(rooms.id, id));
    }
    if (input.role && input.role !== member.role) {
      const taken = (await tx.select({ seat: roomMembers.seat }).from(roomMembers).where(eq(roomMembers.roomId, id))).map((m) => m.seat);
      await tx.update(roomMembers).set({ role: input.role, ...placeFor(input.role, taken) }).where(and(eq(roomMembers.roomId, id), eq(roomMembers.memberKey, key)));
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
export type JoinVia = { code: string } | { invite: string };

/** Le salon visé, seulement si ce moyen d'entrée l'ouvre (SALLE-03). Un refus ne dit pas si le salon existe. */
async function roomFor(db: Db, via: JoinVia) {
  // À BRANCHER (SALLE-04) : un jeton par invité, lié à son IP ; ici, le jeton unique du salon.
  const [room] = await db.select().from(rooms).where("code" in via ? eq(rooms.code, via.code) : eq(rooms.inviteToken, via.invite));
  if (!room) throw new RoomRefused("not_found");
  // À BRANCHER (SALLE-10) : limiter les essais de code par IP, avant cette lecture, dans la route.
  if ("code" in via && !allows(room.visibility, "code")) throw new RoomRefused("not_found");
  return room;
}

/**
 * Entrer dans un salon comme participant. Un membre qui revient (rechargement, autre onglet) le retrouve sans doublon.
 * Points d'extension : SALLE-05 (capacité), SALLE-06 (une salle à la fois), SALLE-07 (expulsés) se vérifient ici,
 * avant l'insertion ; SALLE-09 (état du salon) aussi.
 */
export async function joinRoom(db: Db, who: Identity, via: JoinVia): Promise<RoomResult> {
  const { id } = await roomFor(db, via);
  const key = memberKey(who);
  await db.transaction(async (tx) => {
    // Verrou sur la ligne du salon : les entrées simultanées et le lancement passent l'un après l'autre.
    // L'état (SALLE-09) et les places prises (SALLE-03) sont lus sous ce verrou, jamais avant.
    const [room] = await tx.select({ status: rooms.status, visibility: rooms.visibility }).from(rooms).where(eq(rooms.id, id)).for("update");
    if (!room) throw new RoomRefused("not_found");
    // la visibilité aussi : l'hôte a pu rendre le salon privé entre-temps
    if ("code" in via && !allows(room.visibility, "code")) throw new RoomRefused("not_found");
    if (room.status === "closed") throw new RoomRefused("closed");
    // un membre qui revient (rechargement, autre onglet) n'est pas un nouvel arrivant, même pendant la course
    if (await membership(tx, id, key)) return;
    if (!canJoin(room.status)) throw new RoomRefused("in_race");
    const taken = (await tx.select({ seat: roomMembers.seat }).from(roomMembers).where(eq(roomMembers.roomId, id))).map((m) => m.seat);
    const identity = who.kind === "account" ? { playerId: who.playerId } : { guestName: who.name };
    await tx.insert(roomMembers).values({ roomId: id, memberKey: key, ...identity, role: "player", ...placeFor("player", taken) });
  });
  return { room: await roomView(db, id, key), you: key };
}

/**
 * SALLE-09 : l'hôte lance la course ; le salon passe en « racing » et n'accepte plus de nouvel arrivant.
 * Sous le même verrou que joinRoom : une entrée simultanée est soit faite avant le lancement, soit refusée.
 * À BRANCHER (COURSE-*) : le texte, le départ et la fin de la course (passage en « results »).
 */
export async function launchRoom(db: Db, code: string, who: Identity): Promise<RoomResult> {
  const { id } = await roomByCode(db, code);
  const key = memberKey(who);
  await db.transaction(async (tx) => {
    const [room] = await tx.select({ status: rooms.status, hostId: rooms.hostId }).from(rooms).where(eq(rooms.id, id)).for("update");
    if (!room) throw new RoomRefused("not_found");
    if (!(await membership(tx, id, key))) throw new RoomRefused("not_member");
    if (key !== memberKey({ playerId: room.hostId })) throw new RoomRefused("not_host");
    if (room.status === "closed") throw new RoomRefused("closed");
    if (!canJoin(room.status)) throw new RoomRefused("in_race");
    await tx.update(rooms).set({ status: "racing" }).where(eq(rooms.id, id));
  });
  return { room: await roomView(db, id, key), you: key };
}

/**
 * Quitter un salon. Le dernier qui part le ferme.
 * À BRANCHER (SALLE-08) : si l'hôte part, passer le rôle au membre humain présent depuis le plus longtemps.
 */
export async function leaveRoom(db: Db, code: string, who: Identity, options: { unlessRacing?: boolean } = {}): Promise<{ left: boolean }> {
  const { id } = await roomByCode(db, code);
  // sous le verrou du salon, comme joinRoom et launchRoom : l'état lu et la fermeture ne croisent ni entrée ni lancement
  return db.transaction(async (tx) => {
    const [room] = await tx.select({ status: rooms.status }).from(rooms).where(eq(rooms.id, id)).for("update");
    if (!room || (options.unlessRacing && room.status === "racing")) return { left: false };
    const removed = await tx.delete(roomMembers).where(and(eq(roomMembers.roomId, id), eq(roomMembers.memberKey, memberKey(who)))).returning({ key: roomMembers.memberKey });
    if (removed.length && !(await tx.$count(roomMembers, eq(roomMembers.roomId, id)))) {
      await tx.update(rooms).set({ status: "closed" }).where(eq(rooms.id, id));
    }
    return { left: removed.length > 0 };
  });
}

/**
 * Départ constaté par le temps réel (plus aucune socket) : pendant une course, les membres sont sur /game, sans
 * socket de salon ; ils restent membres et le salon reste ouvert. Hors course, c'est un départ (leaveRoom).
 */
export function leaveAfterDisconnect(db: Db, code: string, who: Identity): Promise<{ left: boolean }> {
  return leaveRoom(db, code, who, { unlessRacing: true });
}

/** L'id d'un salon ouvert, ou null s'il n'existe pas ou est fermé. */
export async function roomIdByCode(db: Db, code: string): Promise<number | null> {
  const [row] = await db.select({ id: rooms.id }).from(rooms).where(and(eq(rooms.code, code), ne(rooms.status, "closed")));
  return row?.id ?? null;
}

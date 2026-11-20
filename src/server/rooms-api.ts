// Routes HTTP des salons : /api/rooms…. Une fine couche autour de rooms.ts : session → identité, corps → schéma Zod (TECH-07),
// refus → statut HTTP. Toute règle (hôte, accès, état) est dans rooms.ts, appliquée par le serveur (SEC-01).
import { z } from "zod";
import type { Db } from "../../db/client";
import { isRoomCode } from "../rooms/access";
import { parseRoomFilters } from "../rooms/explorer";
import { CreateRoomSchema, JoinRoomSchema, KickSchema, UpdateRoomSchema } from "../rooms/settings";
import type { Auth } from "./auth";
import { clientIp, type IpContext } from "./client-ip";
import type { Guard } from "./rate-limit";
import { guestSecret } from "./guest";
import { createInvite, listInvites } from "./room-invites";
import { roomIdentity } from "./room-gate";
import { closeRoom, CodeExhausted, createRoom, finishRoom, joinRoom, kickMember, launchRoom, leaveRoom, listPublicRooms, quickJoin, readRoom, RoomRefused, updateRoom, type RefusalReason, type RoomResult } from "./rooms";

const STATUS: Record<RefusalReason, number> = { not_found: 404, not_member: 403, not_host: 403, full: 409, in_race: 409, closed: 410, already_in_room: 409, kicked: 403, invalid_target: 400, unknown_member: 404, invite_taken: 403, invite_limit: 409, not_enough_players: 409, no_room: 404 };

/** Un refus attendu, en réponse HTTP. SALLE-06 : « already_in_room » donne le salon actuel, pour proposer d'en sortir. */
const refusal = (error: RoomRefused) => json(error.room ? { error: error.reason, room: error.room } : { error: error.reason }, STATUS[error.reason]);

const json = (body: unknown, status = 200) => Response.json(body, { status });

async function bodyOf(req: Request): Promise<unknown> {
  return req.json().catch(() => undefined);
}

/** JOIN-03 : « Faire une course » ne prend aucun paramètre : ni salon imposé, ni rôle (on y entre comme participant). */
const QuickRaceSchema = z.object({}).strict();
/** COURSE-11 : fermer la salle ne prend aucun paramètre (corps vide ou {}) ; l'hôte est lu de la session. */
const CloseRoomSchema = z.object({}).strict();

/** Un corps vide vaut {} ; un JSON cassé reste invalide (undefined), pour que le schéma le refuse. */
async function optionalBodyOf(req: Request): Promise<unknown> {
  const text = await req.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** Exécute une action ; un refus attendu devient son statut HTTP, une erreur inattendue remonte. */
async function run<T = RoomResult>(action: () => Promise<T>, status = 200, done?: (result: T) => void | Promise<void>): Promise<Response> {
  try {
    const result = await action();
    await done?.(result);
    return json(result, status);
  } catch (error) {
    if (error instanceof RoomRefused) return refusal(error);
    if (error instanceof CodeExhausted) return json({ error: "no_free_code" }, 503);
    throw error;
  }
}

/** Notifié après chaque changement d'un salon : le temps réel s'y abonne pour pousser le nouvel état aux membres. */
export type RoomChanged = (code: string) => void | Promise<void>;

/** `joinLimit` (SALLE-10) : la limite de tentatives par IP sur /join ; api.ts la branche toujours, les tests la passent. */
export async function handleRoomsApi(req: Request, db: Db, auth: Auth, secret = guestSecret(), changed: RoomChanged = () => {}, joinLimit?: Guard, ip: IpContext = {}): Promise<Response> {
  const { pathname } = new URL(req.url);
  const parts = pathname.replace(/\/$/, "").split("/").slice(3); // après /api/rooms
  const who = await roomIdentity(req.headers, auth, secret);

  // POST /api/rooms — SALLE-01 : création, compte seulement (AUTH-03 : un invité ne crée pas de salon)
  if (parts.length === 0 && req.method === "POST") {
    if (!who) return json({ error: "unauthorized" }, 401);
    if (who.kind !== "account") return json({ error: "account_required" }, 403);
    const input = CreateRoomSchema.safeParse(await bodyOf(req));
    if (!input.success) return json({ error: "invalid_body" }, 400);
    return run(() => createRoom(db, { playerId: who.playerId, ip: clientIp(req.headers, ip) }, input.data), 201);
  }

  // GET /api/rooms — SALLE-03 : les salons publics seulement, pour l'explorateur et « Faire une course ».
  // JOIN-02 : filtres ?language= et ?level=, validés (TECH-07) ; tout autre paramètre est refusé.
  if (parts.length === 0 && req.method === "GET") {
    const filters = parseRoomFilters(new URL(req.url).searchParams);
    if (!filters) return json({ error: "invalid_query" }, 400);
    return json({ rooms: await listPublicRooms(db, filters) });
  }

  // POST /api/rooms/join — SALLE-03 : par code (public, sur code) ou par lien d'invitation (toutes visibilités)
  if (parts.length === 1 && parts[0] === "join" && req.method === "POST") {
    // SALLE-10 : chaque tentative compte, avant tout contrôle, pour que la réponse ne dise rien d'un code une fois la limite atteinte
    const limited = await joinLimit?.(req);
    if (limited) return limited;
    if (!who) return json({ error: "unauthorized" }, 401);
    const input = JoinRoomSchema.safeParse(await bodyOf(req));
    if (!input.success) return json({ error: "invalid_body" }, 400);
    // SALLE-04 : un lien d'invitation est lié à l'IP du client (client-ip.ts : proxy connu ou socket)
    return run(() => joinRoom(db, who, input.data, clientIp(req.headers, ip)), 200, (result) => changed(result.room.code));
  }

  // POST /api/rooms/quick — JOIN-03 : le serveur choisit le salon et y fait entrer, sous le même verrou que /join.
  // Aucun salon : 404 « no_room » ; canCreate dit si la personne peut en créer un (un compte, AUTH-03), lu de la session.
  if (parts.length === 1 && parts[0] === "quick" && req.method === "POST") {
    if (!who) return json({ error: "unauthorized" }, 401);
    const input = QuickRaceSchema.safeParse(await optionalBodyOf(req));
    if (!input.success) return json({ error: "invalid_body" }, 400);
    try {
      const result = await quickJoin(db, who, clientIp(req.headers, ip));
      await changed(result.room.code);
      return json(result);
    } catch (error) {
      if (error instanceof RoomRefused && error.reason === "no_room") return json({ error: "no_room", canCreate: who.kind === "account" }, 404);
      if (error instanceof RoomRefused) return refusal(error);
      throw error;
    }
  }

  const [code, action] = parts;
  // POST /api/rooms/:code/leave
  if (code && isRoomCode(code) && action === "leave" && req.method === "POST") {
    if (!who) return json({ error: "unauthorized" }, 401);
    try {
      const result = await leaveRoom(db, code, who);
      if (result.left) await changed(code);
      return json(result);
    } catch (error) {
      if (error instanceof RoomRefused) return refusal(error);
      throw error;
    }
  }
  // POST /api/rooms/:code/kick — SALLE-07 : l'hôte expulse un membre, qui ne peut plus revenir
  if (code && isRoomCode(code) && action === "kick" && req.method === "POST") {
    if (!who) return json({ error: "unauthorized" }, 401);
    const input = KickSchema.safeParse(await bodyOf(req));
    if (!input.success) return json({ error: "invalid_body" }, 400);
    return run(() => kickMember(db, code, who, input.data.member), 200, () => changed(code));
  }
  // GET / POST /api/rooms/:code/invites — SALLE-04 : l'hôte liste et génère les liens d'invitation, un par invité
  if (code && isRoomCode(code) && action === "invites" && (req.method === "GET" || req.method === "POST")) {
    if (!who) return json({ error: "unauthorized" }, 401);
    if (req.method === "GET") return run(async () => ({ invites: await listInvites(db, code, who) }));
    return run(async () => ({ invite: await createInvite(db, code, who) }), 201);
  }
  // POST /api/rooms/:code/launch — SALLE-09 : l'hôte lance la course ; le salon n'accepte plus d'arrivant
  if (code && isRoomCode(code) && action === "launch" && req.method === "POST") {
    if (!who) return json({ error: "unauthorized" }, 401);
    return run(() => launchRoom(db, code, who), 200, () => changed(code));
  }
  // POST /api/rooms/:code/close — COURSE-11 : l'hôte ferme la salle ; tous les membres en sortent
  if (code && isRoomCode(code) && action === "close" && req.method === "POST") {
    if (!who) return json({ error: "unauthorized" }, 401);
    const input = CloseRoomSchema.safeParse(await optionalBodyOf(req));
    if (!input.success) return json({ error: "invalid_body" }, 400);
    return run(() => closeRoom(db, code, who), 200, () => changed(code));
  }
  // POST /api/rooms/:code/finish — SALLE-09 : la course est finie, le salon passe aux résultats
  if (code && isRoomCode(code) && action === "finish" && req.method === "POST") {
    if (!who) return json({ error: "unauthorized" }, 401);
    return run(() => finishRoom(db, code, who), 200, () => changed(code));
  }
  if (code && isRoomCode(code) && !action) {
    if (!who) return json({ error: "unauthorized" }, 401);
    // GET /api/rooms/:code — l'état du salon, pour ses membres
    if (req.method === "GET") return run(() => readRoom(db, code, who));
    // PATCH /api/rooms/:code — réglages et rôle de l'hôte
    if (req.method === "PATCH") {
      const input = UpdateRoomSchema.safeParse(await bodyOf(req));
      if (!input.success) return json({ error: "invalid_body" }, 400);
      return run(() => updateRoom(db, code, who, input.data), 200, () => changed(code));
    }
  }
  return json({ error: "not_found" }, 404);
}

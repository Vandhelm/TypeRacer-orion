// Routes HTTP des salons : /api/rooms…. Une fine couche autour de rooms.ts : session → identité, corps → schéma Zod (TECH-07),
// refus → statut HTTP. Toute règle (hôte, accès, état) est dans rooms.ts, appliquée par le serveur (SEC-01).
import type { Db } from "../../db/client";
import { isRoomCode } from "../rooms/access";
import { CreateRoomSchema, JoinRoomSchema, UpdateRoomSchema } from "../rooms/settings";
import type { Auth } from "./auth";
import { clientIp } from "./client-ip";
import { guestSecret } from "./guest";
import { createInvite, listInvites } from "./room-invites";
import { roomIdentity } from "./room-gate";
import { CodeExhausted, createRoom, finishRoom, joinRoom, launchRoom, leaveRoom, listPublicRooms, readRoom, RoomRefused, updateRoom, type RefusalReason, type RoomResult } from "./rooms";

const STATUS: Record<RefusalReason, number> = { not_found: 404, not_member: 403, not_host: 403, full: 409, in_race: 409, closed: 410, invite_taken: 403, invite_limit: 409 };

const json = (body: unknown, status = 200) => Response.json(body, { status });

async function bodyOf(req: Request): Promise<unknown> {
  return req.json().catch(() => undefined);
}

/** Exécute une action ; un refus attendu devient son statut HTTP, une erreur inattendue remonte. */
async function run<T = RoomResult>(action: () => Promise<T>, status = 200, done?: (result: T) => void): Promise<Response> {
  try {
    const result = await action();
    done?.(result);
    return json(result, status);
  } catch (error) {
    if (error instanceof RoomRefused) return json({ error: error.reason }, STATUS[error.reason]);
    if (error instanceof CodeExhausted) return json({ error: "no_free_code" }, 503);
    throw error;
  }
}

/** Notifié après chaque changement d'un salon : le temps réel s'y abonne pour pousser le nouvel état aux membres. */
export type RoomChanged = (code: string) => void;

export async function handleRoomsApi(req: Request, db: Db, auth: Auth, secret = guestSecret(), changed: RoomChanged = () => {}): Promise<Response> {
  const { pathname } = new URL(req.url);
  const parts = pathname.replace(/\/$/, "").split("/").slice(3); // après /api/rooms
  const who = await roomIdentity(req.headers, auth, secret);

  // POST /api/rooms — SALLE-01 : création, compte seulement (AUTH-03 : un invité ne crée pas de salon)
  if (parts.length === 0 && req.method === "POST") {
    if (!who) return json({ error: "unauthorized" }, 401);
    if (who.kind !== "account") return json({ error: "account_required" }, 403);
    const input = CreateRoomSchema.safeParse(await bodyOf(req));
    if (!input.success) return json({ error: "invalid_body" }, 400);
    return run(() => createRoom(db, { playerId: who.playerId }, input.data), 201);
  }

  // GET /api/rooms — SALLE-03 : les salons publics seulement, pour l'explorateur et « Faire une course »
  if (parts.length === 0 && req.method === "GET") return json({ rooms: await listPublicRooms(db) });

  // POST /api/rooms/join — SALLE-03 : par code (public, sur code) ou par lien d'invitation (toutes visibilités)
  if (parts.length === 1 && parts[0] === "join" && req.method === "POST") {
    if (!who) return json({ error: "unauthorized" }, 401);
    const input = JoinRoomSchema.safeParse(await bodyOf(req));
    if (!input.success) return json({ error: "invalid_body" }, 400);
    // SALLE-04 : un lien d'invitation est lié à l'IP du client, lue derrière le proxy
    return run(() => joinRoom(db, who, input.data, clientIp(req.headers)), 200, (result) => changed(result.room.code));
  }

  const [code, action] = parts;
  // POST /api/rooms/:code/leave
  if (code && isRoomCode(code) && action === "leave" && req.method === "POST") {
    if (!who) return json({ error: "unauthorized" }, 401);
    try {
      const result = await leaveRoom(db, code, who);
      if (result.left) changed(code);
      return json(result);
    } catch (error) {
      if (error instanceof RoomRefused) return json({ error: error.reason }, STATUS[error.reason]);
      throw error;
    }
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

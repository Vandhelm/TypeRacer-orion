// Routes HTTP des salons : /api/rooms…. Une fine couche autour de rooms.ts : session → identité, corps → schéma Zod (TECH-07),
// refus → statut HTTP. Toute règle (hôte, accès, état) est dans rooms.ts, appliquée par le serveur (SEC-01).
import type { Db } from "../../db/client";
import { isRoomCode } from "../rooms/access";
import { CreateRoomSchema, UpdateRoomSchema } from "../rooms/settings";
import type { Auth } from "./auth";
import { guestSecret } from "./guest";
import { roomIdentity } from "./room-gate";
import { CodeExhausted, createRoom, readRoom, RoomRefused, updateRoom, type RefusalReason, type RoomResult } from "./rooms";

const STATUS: Record<RefusalReason, number> = { not_found: 404, not_member: 403, not_host: 403, full: 409, in_race: 409, closed: 410 };

const json = (body: unknown, status = 200) => Response.json(body, { status });

async function bodyOf(req: Request): Promise<unknown> {
  return req.json().catch(() => undefined);
}

/** Exécute une action ; un refus attendu devient son statut HTTP, une erreur inattendue remonte. */
async function run(action: () => Promise<RoomResult>, status = 200): Promise<Response> {
  try {
    return json(await action(), status);
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

  const [code, action] = parts;
  if (code && isRoomCode(code) && !action) {
    if (!who) return json({ error: "unauthorized" }, 401);
    // GET /api/rooms/:code — l'état du salon, pour ses membres
    if (req.method === "GET") return run(() => readRoom(db, code, who));
    // PATCH /api/rooms/:code — réglages et rôle de l'hôte
    if (req.method === "PATCH") {
      const input = UpdateRoomSchema.safeParse(await bodyOf(req));
      if (!input.success) return json({ error: "invalid_body" }, 400);
      const response = await run(() => updateRoom(db, code, who, input.data));
      if (response.ok) changed(code);
      return response;
    }
  }
  return json({ error: "not_found" }, 404);
}

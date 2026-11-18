// Appels du salon vers le serveur (/api/rooms…). Le serveur décide de tout : cette page n'envoie que des demandes.
import type { Role, RoomSettings } from "../../rooms/settings";
import type { RefusalReason, RoomResult } from "../../server/rooms";

export type RoomError = RefusalReason | "unauthorized" | "account_required" | "invalid_body" | "no_free_code" | "network";
export type Answer = { ok: true; result: RoomResult } | { ok: false; error: RoomError };

async function send(method: string, path: string, body?: unknown): Promise<Answer> {
  try {
    const res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as RoomResult & { error?: RoomError };
    return res.ok ? { ok: true, result: data } : { ok: false, error: data.error ?? "network" };
  } catch {
    return { ok: false, error: "network" };
  }
}

export const roomApi = {
  create: (role: Role) => send("POST", "/api/rooms", { role }),
  read: (code: string) => send("GET", `/api/rooms/${code}`),
  update: (code: string, body: { role?: Role; settings?: Partial<RoomSettings> }) => send("PATCH", `/api/rooms/${code}`, body),
};

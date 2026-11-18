// Appels du salon vers le serveur (/api/rooms…). Le serveur décide de tout : cette page n'envoie que des demandes.
import type { Role, RoomSettings } from "../../rooms/settings";
import type { RoomSocketMessage } from "../../server/realtime";
import type { InviteView } from "../../server/room-invites";
import type { RefusalReason, RoomResult, RoomView } from "../../server/rooms";

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

/** Une demande dont la réponse n'est pas un salon (liens d'invitation). */
async function request<T>(method: string, path: string): Promise<{ ok: true; data: T } | { ok: false; error: RoomError }> {
  try {
    const res = await fetch(path, { method, credentials: "same-origin" });
    const data = (await res.json().catch(() => ({}))) as T & { error?: RoomError };
    return res.ok ? { ok: true, data } : { ok: false, error: data.error ?? "network" };
  } catch {
    return { ok: false, error: "network" };
  }
}

/** SALLE-04 : les liens d'invitation, pour l'hôte seulement (le serveur refuse les autres). */
export const inviteApi = {
  list: (code: string) => request<{ invites: InviteView[] }>("GET", `/api/rooms/${code}/invites`),
  create: (code: string) => request<{ invite: InviteView }>("POST", `/api/rooms/${code}/invites`),
};

export const roomApi = {
  create: (role: Role) => send("POST", "/api/rooms", { role }),
  read: (code: string) => send("GET", `/api/rooms/${code}`),
  join: (via: { code: string } | { invite: string }) => send("POST", "/api/rooms/join", via),
  /** keepalive : la demande part même si la page se ferme juste après. */
  leave: (code: string) => fetch(`/api/rooms/${code}/leave`, { method: "POST", credentials: "same-origin", keepalive: true }).catch(() => undefined),
  /** SALLE-09 : l'hôte lance la course ; le serveur ferme alors le salon aux nouveaux arrivants. */
  launch: (code: string) => send("POST", `/api/rooms/${code}/launch`),
  /** SALLE-09 : la course est finie, le salon repasse aux résultats. keepalive : la page part au podium juste après. */
  finish: (code: string) => fetch(`/api/rooms/${code}/finish`, { method: "POST", credentials: "same-origin", keepalive: true }).catch(() => undefined),
  update: (code: string, body: { role?: Role; settings?: Partial<RoomSettings> }) => send("PATCH", `/api/rooms/${code}`, body),
};

/** Sans WebSocket (Next.js, Vercel), on relit l'état à ce rythme. */
const POLL_MS = 3000;

/**
 * Suit un salon en direct : WebSocket si le serveur l'offre (Bun, server.ts), sinon relecture HTTP régulière.
 * Renvoie la fonction qui arrête de suivre.
 */
export function watchRoom(code: string, onRoom: (room: RoomView) => void, onError: (error: RoomError) => void): () => void {
  let stopped = false;
  let poll = 0;
  const startPolling = () => {
    if (stopped || poll) return;
    poll = window.setInterval(async () => {
      const reply = await roomApi.read(code);
      if (stopped) return;
      if (reply.ok) onRoom(reply.result.room);
      else if (reply.error !== "network") onError(reply.error);
    }, POLL_MS);
  };
  let socket: WebSocket | null = null;
  try {
    socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/rooms/${code}`);
    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as RoomSocketMessage;
      if (message.type === "room") onRoom(message.room);
      else onError("closed");
    };
    socket.onclose = startPolling;
  } catch {
    startPolling();
  }
  return () => {
    stopped = true;
    clearInterval(poll);
    if (socket) {
      socket.onclose = null;
      socket.close();
    }
  };
}

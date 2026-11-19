// Appels du salon vers le serveur (/api/rooms…). Le serveur décide de tout : cette page n'envoie que des demandes.
import type { Role, RoomSettings } from "../../rooms/settings";
import { connectRealtime } from "../../realtime/client";
import type { InviteView } from "../../server/room-invites";
import type { RefusalReason, RoomResult, RoomView } from "../../server/rooms";

export type RoomError = RefusalReason | "unauthorized" | "account_required" | "invalid_body" | "no_free_code" | "rate_limited" | "network" | "bad_code";
/** current : SALLE-06, le salon où l'on est déjà quand le serveur répond « already_in_room ». */
export type Answer = { ok: true; result: RoomResult } | { ok: false; error: RoomError; current?: string };

async function send(method: string, path: string, body?: unknown): Promise<Answer> {
  try {
    const res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as RoomResult & { error?: RoomError; room?: unknown };
    if (res.ok) return { ok: true, result: data };
    return { ok: false, error: data.error ?? "network", ...(typeof data.room === "string" ? { current: data.room } : {}) };
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
  /** SALLE-07 : l'hôte expulse un membre (sa clé) ; le serveur vérifie que c'est bien l'hôte. */
  kick: (code: string, member: string) => send("POST", `/api/rooms/${code}/kick`, { member }),
};

/**
 * SALLE-06 : la demande d'arrivée (créer, entrer, relire) part une seule fois par tentative (`key`), même si l'effet
 * de la page tourne deux fois (React StrictMode en dev) : une deuxième création serait refusée, « déjà dans un salon »,
 * avec le salon que la première vient de créer. `holder` : un useRef de la page.
 */
export function arrivalRequest<T>(holder: { current: { key: string; request: Promise<T> } | null }, key: string, make: () => Promise<T>): Promise<T> {
  if (holder.current?.key !== key) holder.current = { key, request: make() };
  return holder.current.request;
}

/** Tant que le temps réel n'est pas joignable, on relit l'état à ce rythme. */
const POLL_MS = 3000;

/**
 * Suit un salon en direct : par le serveur temps réel (TECH-06, follow) quand il répond, sinon relecture HTTP régulière.
 * SALLE-07 : quand le serveur dit que l'on n'est plus membre, la page relit le salon par HTTP et apprend pourquoi (« kicked »).
 * Renvoie la fonction qui arrête de suivre.
 */
export function watchRoom(code: string, onRoom: (room: RoomView) => void, onError: (error: RoomError) => void): () => void {
  let stopped = false;
  let poll = 0;
  const reread = async () => {
    const reply = await roomApi.read(code);
    if (stopped) return;
    if (reply.ok) onRoom(reply.result.room);
    else if (reply.error !== "network") onError(reply.error);
  };
  const startPolling = () => {
    if (stopped || poll) return;
    poll = window.setInterval(() => void reread(), POLL_MS);
  };
  const stopPolling = () => {
    clearInterval(poll);
    poll = 0;
  };
  startPolling();
  const connection = connectRealtime({
    room: code,
    onChange: (state) => (state.status === "open" ? stopPolling() : startPolling()),
    onRoom: (event) => {
      if (stopped) return;
      // le serveur pousse la même vue que GET /api/rooms/:code (roomView), validée par le protocole
      if (event.type === "room") onRoom(event.room as unknown as RoomView);
      else if (event.type === "closed") onError("closed");
      else void reread();
    },
  });
  return () => {
    stopped = true;
    stopPolling();
    connection.close();
  };
}

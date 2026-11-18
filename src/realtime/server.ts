// Serveur temps réel (TECH-06) : Bun.serve + WebSocket, séparé de Next.js, état des salles en mémoire.
// - Connexion : ticket signé à usage unique (src/realtime/ticket.ts) en paramètre `ticket`, Origin autorisée.
//   Un ticket émis avant le démarrage du serveur est refusé : les nonces vus sont perdus au redémarrage.
// - Chaque message reçu est validé par le schéma du protocole (TECH-07) ; un message invalide reçoit
//   une erreur, n'est jamais diffusé et ne ferme pas la connexion. Un déluge de messages la ferme (1008).
// - Progression : diffusée aux autres membres de la salle, au plus 10 fois par seconde par joueur (PERF-02).
//   Les messages en trop sont fusionnés : la dernière valeur part dès que la limite le permet.
import type { Server, ServerWebSocket } from "bun";
import { MAX_MESSAGE_BYTES, parseClientMessage, type Player, PROGRESS_INTERVAL_MS, type ServerMessage } from "./protocol";
import { TICKET_TTL_MS, verifyTicket } from "./ticket";

/** Au-delà, sur une fenêtre d'une seconde, la connexion est fermée : aucun client honnête n'en envoie autant. */
export const MAX_MESSAGES_PER_SECOND = 60;
const POLICY_VIOLATION = 1008;

type Connection = { player: Player; room: string | null; windowStart: number; windowCount: number };
type Socket = ServerWebSocket<Connection>;
type Member = { player: Player; connections: number };
type Throttle = { lastSent: number; pending: { ws: Socket; text: string } | null; timer: ReturnType<typeof setTimeout> | null };

export type RealtimeOptions = {
  port?: number;
  hostname?: string;
  secret: string;
  /** Origines des pages autorisées à se connecter. Vide : pas de contrôle (outils, tests). */
  allowedOrigins?: string[];
};

const topic = (room: string) => `room:${room}`;
const encode = (message: ServerMessage) => JSON.stringify(message);

export function createRealtimeServer({ port = 3001, hostname, secret, allowedOrigins = [] }: RealtimeOptions): Server<Connection> {
  /** Salles en mémoire : code → joueurs présents, dans l'ordre d'arrivée. */
  const rooms = new Map<string, Map<string, Member>>();
  /** Limite de fréquence par salle et par joueur, partagée par ses onglets. */
  const throttles = new Map<string, Throttle>();
  /** Nonces des tickets déjà utilisés, jusqu'à leur expiration. */
  const usedNonces = new Map<string, number>();
  /** Les nonces vivent en mémoire : un ticket émis avant ce démarrage a pu servir avant un redémarrage, il est refusé. */
  const startedAt = Date.now();

  const throttleKey = (room: string, playerId: string) => `${room}\n${playerId}`;

  function presence(room: string) {
    const members = rooms.get(room);
    server.publish(topic(room), encode({ type: "presence", room, players: [...(members?.values() ?? [])].map((m) => m.player) }));
  }

  function leave(ws: Socket) {
    const room = ws.data.room;
    if (!room) return;
    ws.data.room = null;
    if (ws.readyState === 1) ws.unsubscribe(topic(room));
    const members = rooms.get(room);
    const member = members?.get(ws.data.player.id);
    if (members && member) {
      member.connections -= 1;
      if (member.connections <= 0) {
        members.delete(ws.data.player.id);
        const key = throttleKey(room, ws.data.player.id);
        const throttle = throttles.get(key);
        if (throttle?.timer) clearTimeout(throttle.timer);
        throttles.delete(key);
      }
      if (members.size === 0) rooms.delete(room);
    }
    presence(room);
  }

  function join(ws: Socket, room: string) {
    if (ws.data.room === room) return presence(room);
    leave(ws);
    ws.data.room = room;
    ws.subscribe(topic(room));
    const members = rooms.get(room) ?? new Map<string, Member>();
    rooms.set(room, members);
    const member = members.get(ws.data.player.id);
    if (member) member.connections += 1;
    else members.set(ws.data.player.id, { player: ws.data.player, connections: 1 });
    presence(room);
  }

  /** Diffuse aux autres : l'expéditeur ne reçoit pas sa propre progression. */
  function broadcastFrom(ws: Socket, room: string, text: string) {
    if (ws.readyState === 1 && ws.data.room === room) ws.publish(topic(room), text);
    else server.publish(topic(room), text);
  }

  function progress(ws: Socket, room: string, value: number, wpm: number) {
    const text = encode({ type: "progress", playerId: ws.data.player.id, progress: value, wpm });
    const key = throttleKey(room, ws.data.player.id);
    const throttle = throttles.get(key) ?? { lastSent: -Infinity, pending: null, timer: null };
    throttles.set(key, throttle);
    const now = performance.now();
    if (now - throttle.lastSent >= PROGRESS_INTERVAL_MS && !throttle.timer) {
      throttle.lastSent = now;
      broadcastFrom(ws, room, text);
      return;
    }
    throttle.pending = { ws, text };
    throttle.timer ??= setTimeout(() => {
      throttle.timer = null;
      const pending = throttle.pending;
      throttle.pending = null;
      if (!pending || throttles.get(key) !== throttle) return;
      throttle.lastSent = performance.now();
      broadcastFrom(pending.ws, room, pending.text);
    }, Math.max(0, throttle.lastSent + PROGRESS_INTERVAL_MS - now));
  }

  function send(ws: Socket, message: ServerMessage) {
    ws.send(encode(message));
  }

  /** Fenêtre fixe d'une seconde par connexion. Faux si la connexion vient d'être fermée. */
  function withinFloodLimit(ws: Socket) {
    const now = Date.now();
    if (now - ws.data.windowStart >= 1000) {
      ws.data.windowStart = now;
      ws.data.windowCount = 0;
    }
    ws.data.windowCount += 1;
    if (ws.data.windowCount <= MAX_MESSAGES_PER_SECOND) return true;
    ws.close(POLICY_VIOLATION, "too_many_messages");
    return false;
  }

  function useTicket(value: string | null): Player | null {
    if (!value) return null;
    const now = Date.now();
    const ticket = verifyTicket(value, secret, now);
    if (!ticket || usedNonces.has(ticket.nonce) || ticket.expires - TICKET_TTL_MS < startedAt) return null;
    for (const [nonce, expires] of usedNonces) if (expires <= now) usedNonces.delete(nonce);
    usedNonces.set(ticket.nonce, ticket.expires);
    return ticket.player;
  }

  const server: Server<Connection> = Bun.serve<Connection>({
    port,
    hostname,
    fetch(req, srv) {
      const url = new URL(req.url);
      if (url.pathname === "/health") return new Response("ok");
      if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") return new Response("upgrade required", { status: 426 });
      const origin = req.headers.get("origin");
      if (allowedOrigins.length > 0 && (!origin || !allowedOrigins.includes(origin))) return new Response("forbidden origin", { status: 403 });
      const player = useTicket(url.searchParams.get("ticket"));
      if (!player) return new Response("unauthorized", { status: 401 });
      if (srv.upgrade(req, { data: { player, room: null, windowStart: Date.now(), windowCount: 0 } })) return undefined;
      return new Response("upgrade failed", { status: 400 });
    },
    websocket: {
      maxPayloadLength: MAX_MESSAGE_BYTES,
      open(ws) {
        send(ws, { type: "welcome", you: ws.data.player });
      },
      message(ws, data) {
        if (!withinFloodLimit(ws)) return;
        const message = parseClientMessage(data);
        if (!message) return send(ws, { type: "error", code: "invalid_message" });
        switch (message.type) {
          case "join":
            return join(ws, message.room);
          case "leave":
            return leave(ws);
          case "progress":
            if (!ws.data.room) return send(ws, { type: "error", code: "not_in_room" });
            return progress(ws, ws.data.room, message.progress, message.wpm);
        }
      },
      close(ws) {
        leave(ws);
      },
    },
  });
  return server;
}

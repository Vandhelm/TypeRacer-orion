// Temps réel des salons, par WebSocket (Bun.serve). Un adaptateur de transport : la logique reste dans rooms.ts.
// - /ws/rooms/:code : seul un membre du salon (session vérifiée) ouvre la socket ; il reçoit l'état, puis chaque changement.
// - Présence : quand la dernière socket d'un membre se ferme et ne revient pas dans le délai, il quitte le salon,
//   sauf pendant une course ou juste après son lancement (SALLE-09) : les membres sont alors sur /game, sans socket de salon.
// Next.js et Vercel ne gardent pas de socket ouverte : la page y relit l'état par HTTP (voir useRoomLive).
import type { Server, ServerWebSocket, WebSocketHandler } from "bun";
import type { Db } from "../../db/client";
import { isRoomCode } from "../rooms/access";
import type { Auth } from "./auth";
import { roomIdentity } from "./room-gate";
import { leaveAfterDisconnect, readRoom, RoomRefused, roomIdByCode, roomView, type Identity } from "./rooms";

export type SocketData = { code: string; who: Identity; key: string };
export type RoomSocketMessage = { type: "room"; room: Awaited<ReturnType<typeof roomView>> } | { type: "closed" };

type Events = { on(listener: (code: string) => void): () => void; emit(code: string): void };
type Options = { db: Db; auth: Auth; secret?: string; events: Events; leaveAfterMs?: number };

/** Assez long pour un rechargement de page ou une coupure brève du réseau. */
const LEAVE_AFTER_MS = 15_000;
const topic = (code: string) => `room:${code}`;
const PATH = /^\/ws\/rooms\/([^/]+)$/;

export function createRealtime({ db, auth, secret, events, leaveAfterMs = LEAVE_AFTER_MS }: Options) {
  let server: Server<SocketData> | null = null;
  /** Sockets ouvertes par membre et par salon : un deuxième onglet ne compte pas double. */
  const open = new Map<string, number>();
  const leaving = new Map<string, ReturnType<typeof setTimeout>>();
  /** Les sockets ouvertes de chaque salon : celle d'un membre retiré (SALLE-07, expulsé) se ferme. */
  const sockets = new Map<string, Set<ServerWebSocket<SocketData>>>();
  const presence = (data: SocketData) => `${data.code}|${data.key}`;

  /** Pousse l'état courant du salon à toutes ses sockets (sans lien d'invitation : il n'est montré qu'à l'hôte, par HTTP). */
  async function publish(code: string) {
    if (!server) return;
    try {
      const id = await roomIdByCode(db, code);
      const room = id === null ? null : await roomView(db, id);
      const message: RoomSocketMessage = room ? { type: "room", room } : { type: "closed" };
      server.publish(topic(code), JSON.stringify(message));
      // SALLE-07 : une socket dont le membre n'est plus dans le salon (expulsé) ne reçoit plus rien ; la page relit
      // alors l'état par HTTP et apprend pourquoi (« kicked »)
      const members = new Set(room?.members.map((m) => m.key));
      for (const ws of sockets.get(code) ?? []) if (room && !members.has(ws.data.key)) ws.close(4403, "not_member");
    } catch (error) {
      console.error(error);
    }
  }
  events.on((code) => void publish(code));

  return {
    /** La requête vise-t-elle le temps réel d'un salon ? */
    matches(req: Request) {
      return PATH.test(new URL(req.url).pathname);
    },

    /** Ouvre la socket d'un membre : undefined si c'est fait (Bun répond lui-même 101), sinon la réponse de refus. */
    async upgrade(req: Request, srv: Server<SocketData>): Promise<Response | undefined> {
      const match = new URL(req.url).pathname.match(PATH);
      if (!match) return new Response("not_found", { status: 404 });
      server = srv;
      const code = match[1]!;
      if (!isRoomCode(code)) return new Response("not_found", { status: 404 });
      const who = await roomIdentity(req.headers, auth, secret);
      if (!who) return new Response("unauthorized", { status: 401 });
      try {
        const { you } = await readRoom(db, code, who);
        if (srv.upgrade(req, { data: { code, who, key: you } })) return undefined;
        return new Response("upgrade_required", { status: 426 });
      } catch (error) {
        if (error instanceof RoomRefused) return new Response(error.reason, { status: 403 });
        throw error;
      }
    },

    websocket: {
      async open(ws: ServerWebSocket<SocketData>) {
        const id = presence(ws.data);
        clearTimeout(leaving.get(id));
        leaving.delete(id);
        open.set(id, (open.get(id) ?? 0) + 1);
        ws.subscribe(topic(ws.data.code));
        if (!sockets.has(ws.data.code)) sockets.set(ws.data.code, new Set());
        sockets.get(ws.data.code)!.add(ws);
        try {
          const { room } = await readRoom(db, ws.data.code, ws.data.who);
          const message: RoomSocketMessage = { type: "room", room: { ...room, invite: null } };
          ws.send(JSON.stringify(message));
        } catch {
          ws.close(4403, "not_member");
        }
      },
      message() {
        // la page n'envoie rien par la socket : ses actions passent par les routes HTTP, validées (TECH-07)
      },
      close(ws: ServerWebSocket<SocketData>) {
        const room = sockets.get(ws.data.code);
        room?.delete(ws);
        if (room && !room.size) sockets.delete(ws.data.code);
        const id = presence(ws.data);
        const left = (open.get(id) ?? 1) - 1;
        if (left > 0) {
          open.set(id, left);
          return;
        }
        open.delete(id);
        const { code, who } = ws.data;
        leaving.set(
          id,
          setTimeout(async () => {
            leaving.delete(id);
            if (open.has(id)) return;
            try {
              if ((await leaveAfterDisconnect(db, code, who, leaveAfterMs)).left) events.emit(code);
            } catch (error) {
              if (!(error instanceof RoomRefused)) console.error(error);
            }
          }, leaveAfterMs),
        );
      },
    } satisfies WebSocketHandler<SocketData>,
  };
}

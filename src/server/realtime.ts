// Temps réel des salons, par WebSocket (Bun.serve). Un adaptateur de transport : la logique reste dans rooms.ts.
// - /ws/rooms/:code : seul un membre du salon (session vérifiée) ouvre la socket ; il reçoit l'état, puis chaque changement.
// - Présence : quand la dernière socket d'un membre se ferme et ne revient pas dans le délai, il quitte le salon,
//   sauf pendant une course (SALLE-09) : les membres sont alors sur /game, sans socket de salon.
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
  const presence = (data: SocketData) => `${data.code}|${data.key}`;

  /** Pousse l'état courant du salon à toutes ses sockets (sans lien d'invitation : il n'est montré qu'à l'hôte, par HTTP). */
  async function publish(code: string) {
    if (!server) return;
    try {
      const id = await roomIdByCode(db, code);
      const message: RoomSocketMessage = id === null ? { type: "closed" } : { type: "room", room: await roomView(db, id) };
      server.publish(topic(code), JSON.stringify(message));
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
              if ((await leaveAfterDisconnect(db, code, who)).left) events.emit(code);
            } catch (error) {
              if (!(error instanceof RoomRefused)) console.error(error);
            }
          }, leaveAfterMs),
        );
      },
    } satisfies WebSocketHandler<SocketData>,
  };
}

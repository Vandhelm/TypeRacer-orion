// Serveur local : les pages (avec rechargement à chaud) et l'API. En ligne, Vercel sert les pages et api/index.ts l'API.
import game from "./game.html";
import home from "./home.html";
import podium from "./podium.html";
import profile from "./profile.html";
import room from "./room.html";
import { auth, db, handleApi } from "./src/server/api";
import { withClientIp } from "./src/server/client-ip";
import { createRealtime, type SocketData } from "./src/server/realtime";
import { roomEvents } from "./src/server/room-events";

// Temps réel des salons (WebSocket) : les routes /api/rooms émettent roomEvents, les sockets /ws/rooms/:code les reçoivent.
const realtime = createRealtime({ db: db(), auth: auth(), events: roomEvents });

const server = Bun.serve<SocketData>({
  port: Number(process.env.PORT) || 3000,
  development: process.env.NODE_ENV !== "production",
  routes: {
    "/": home,
    "/home": home,
    "/room": room,
    "/game": game,
    "/podium": podium,
    "/profile": profile,
    // pas de proxy devant ce serveur : l'IP du client est celle de la socket (SALLE-04)
    "/api/*": (req: Request, srv: Bun.Server<SocketData>) => handleApi(withClientIp(req, srv.requestIP(req)?.address)),
  },
  fetch(req, srv) {
    return realtime.matches(req) ? realtime.upgrade(req, srv) : new Response("Not found", { status: 404 });
  },
  websocket: realtime.websocket,
});

console.log(`O.R.I.O.N → ${server.url}`);

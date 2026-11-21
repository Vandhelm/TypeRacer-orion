// Toutes les routes /api/*. Servies par Next.js (app/api/[...path]/route.ts), en local comme sur Vercel.
import { sql } from "drizzle-orm";
import { connect } from "../../db/client";
import { handleRace, handleStats } from "./races";
import { handleAvatar, saveAvatar } from "./account";
import { handleGuest } from "./guest";
import { realtimeReadiness } from "./realtime-config";
import { handleRealtimeTicket } from "./realtime-ticket";
import { handleHistory } from "./history";
import { createAuth, type Auth } from "./auth";
import { socketIp } from "./client-ip";
import { joinGuard } from "./rate-limit";
import { handleRoomsApi } from "./rooms-api";
import { notifyRoom } from "./room-events";

let database: ReturnType<typeof connect> | null = null;
/** Une seule connexion par processus : une fonction Vercel réutilise son instance d'un appel à l'autre. */
export function db() {
  database ??= connect();
  return database.db;
}

let authInstance: Auth | null = null;
export function auth() {
  authInstance ??= createAuth(db());
  return authInstance;
}

type Handler = (req: Request) => Response | Promise<Response>;

const routes: Record<string, Handler> = {
  "/api/health": async () => {
    try {
      await db().execute(sql`select 1`);
      // COURSE-06 : le serveur temps réel est obligatoire en production ; son absence se voit ici, sans faire tomber le site
      return Response.json({ ok: true, database: true, realtime: realtimeReadiness() });
    } catch (error) {
      console.error(error);
      return Response.json({ ok: false, database: false, realtime: realtimeReadiness() }, { status: 503 });
    }
  },
};

/** `context` : le contexte de route de Next.js ; client-ip.ts y cherche l'IP de la socket (SALLE-10), sinon lit les en-têtes. */
export async function handleApi(req: Request, context?: unknown): Promise<Response> {
  const { pathname } = new URL(req.url);
  if (pathname === "/api/races") return handleRace(req, db(), auth());
  if (pathname === "/api/account/avatar") return handleAvatar(req, auth(), saveAvatar(db()));
  if (pathname === "/api/guest") return handleGuest(req);
  if (pathname === "/api/realtime/ticket") return handleRealtimeTicket(req, auth());
  if (pathname === "/api/history" || pathname.startsWith("/api/history/")) return handleHistory(req, db(), auth());
  if (pathname === "/api/rooms" || pathname.startsWith("/api/rooms/")) {
    // une seule IP pour la limite de débit (SALLE-10) et la liaison des liens d'invitation (SALLE-04)
    const peer = socketIp(context, req);
    return handleRoomsApi(req, db(), auth(), undefined, (code) => notifyRoom(db(), code), joinGuard(db(), { peer }), { peer });
  }
  const stats = pathname.match(/^\/api\/players\/([^/]+)\/stats$/);
  if (stats) return handleStats(stats[1]!, db());
  if (pathname.startsWith("/api/auth/")) return auth().handler(req);
  const route = routes[pathname.replace(/\/$/, "")];
  return route ? route(req) : Response.json({ error: "not_found" }, { status: 404 });
}

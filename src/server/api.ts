// Toutes les routes /api/*. Servies par Next.js (app/api/[...path]/route.ts), en local comme sur Vercel.
import { sql } from "drizzle-orm";
import { connect } from "../../db/client";
import { handleRace, playerStats } from "./races";
import { handleAvatar, saveAvatar } from "./account";
import { handleGuest } from "./guest";
import { createAuth, type Auth } from "./auth";

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
      return Response.json({ ok: true, database: true });
    } catch (error) {
      console.error(error);
      return Response.json({ ok: false, database: false }, { status: 503 });
    }
  },
};

async function getStats(name: string) {
  const stats = await playerStats(db(), name);
  return stats ? Response.json(stats) : Response.json({ error: "not_found" }, { status: 404 });
}

export async function handleApi(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);
  if (pathname === "/api/races") return handleRace(req, db(), auth());
  if (pathname === "/api/account/avatar") return handleAvatar(req, auth(), saveAvatar(db()));
  if (pathname === "/api/guest") return handleGuest(req);
  const stats = pathname.match(/^\/api\/players\/([^/]+)\/stats$/);
  if (stats) return getStats(decodeURIComponent(stats[1]!));
  if (pathname.startsWith("/api/auth/")) return auth().handler(req);
  const route = routes[pathname.replace(/\/$/, "")];
  return route ? route(req) : Response.json({ error: "not_found" }, { status: 404 });
}

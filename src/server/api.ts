// Toutes les routes /api/*. Le même code tourne en local (server.ts) et sur Vercel (api/index.ts).
import { sql } from "drizzle-orm";
import { connect } from "../../db/client";
import { InvalidRace, parseRace, playerStats, recordRace } from "./races";
import { handleAvatar } from "./account";
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

/** Fin de course : le navigateur envoie le classement complet. */
async function postRace(req: Request) {
  if (req.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 });
  try {
    const raceId = await recordRace(db(), parseRace(await req.json()));
    return Response.json({ raceId }, { status: raceId ? 201 : 200 });
  } catch (error) {
    if (error instanceof InvalidRace || error instanceof SyntaxError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}

async function getStats(name: string) {
  const stats = await playerStats(db(), name);
  return stats ? Response.json(stats) : Response.json({ error: "not_found" }, { status: 404 });
}

export async function handleApi(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);
  if (pathname === "/api/races") return postRace(req);
  if (pathname === "/api/account/avatar") return handleAvatar(req, auth());
  const stats = pathname.match(/^\/api\/players\/([^/]+)\/stats$/);
  if (stats) return getStats(decodeURIComponent(stats[1]!));
  if (pathname.startsWith("/api/auth/")) return auth().handler(req);
  const route = routes[pathname.replace(/\/$/, "")];
  return route ? route(req) : Response.json({ error: "not_found" }, { status: 404 });
}

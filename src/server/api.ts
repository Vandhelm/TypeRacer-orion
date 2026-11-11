// Toutes les routes /api/*. Le même code tourne en local (server.ts) et sur Vercel (api/index.ts).
import { sql } from "drizzle-orm";
import { connect } from "../../db/client";

let database: ReturnType<typeof connect> | null = null;
/** Une seule connexion par processus : une fonction Vercel réutilise son instance d'un appel à l'autre. */
export function db() {
  database ??= connect();
  return database.db;
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

export async function handleApi(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);
  const route = routes[pathname.replace(/\/$/, "")];
  return route ? route(req) : Response.json({ error: "not_found" }, { status: 404 });
}

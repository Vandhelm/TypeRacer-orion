// HIST-01 : l'historique des courses du compte connecté, paginé (GET /api/history?page=N).
// Le joueur vient de la session, jamais de la requête ; un invité n'a pas d'historique (AUTH-03).
import { count, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../../db/client";
import { raceConfigs, raceResults, races } from "../../db/schema";
import type { Auth } from "./auth";
import { guestSecret, readGuest } from "./guest";

export const HISTORY_PAGE_SIZE = 10;

const json = (body: unknown, status = 200) => Response.json(body, { status });

/** Page à partir de 1, écrite en chiffres sans zéro devant ; au-delà de 9 chiffres, refusée. */
const PageSchema = z.string().regex(/^[1-9]\d{0,8}$/).transform(Number);

/** Une page de l'historique d'un joueur, de la plus récente à la plus ancienne. Une page au-delà de la fin est vide. */
export async function listHistory(db: Db, playerId: number, page: number, pageSize = HISTORY_PAGE_SIZE) {
  const [totals] = await db.select({ total: count() }).from(raceResults).where(eq(raceResults.playerId, playerId));
  const total = totals?.total ?? 0;
  const rows = await db
    .select({
      id: races.id,
      at: races.startedAt,
      rank: raceResults.rank,
      wpm: raceResults.wpm,
      accuracy: raceResults.accuracy,
      seconds: raceResults.seconds,
      finished: raceResults.finished,
      eliminated: raceResults.eliminated,
      textType: raceConfigs.textType,
      language: raceConfigs.language,
      wordCount: raceConfigs.wordCount,
    })
    .from(raceResults)
    .innerJoin(races, eq(races.id, raceResults.raceId))
    .innerJoin(raceConfigs, eq(raceConfigs.id, races.configId))
    .where(eq(raceResults.playerId, playerId))
    .orderBy(desc(races.startedAt), desc(races.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  // le nombre de participants enregistrés de chaque course de la page
  const ids = rows.map((row) => row.id);
  const counted = ids.length
    ? await db.select({ raceId: raceResults.raceId, size: count() }).from(raceResults).where(inArray(raceResults.raceId, ids)).groupBy(raceResults.raceId)
    : [];
  const sizes = new Map(counted.map((row) => [row.raceId, row.size]));
  return {
    page,
    pageSize,
    total,
    pages: Math.ceil(total / pageSize),
    races: rows.map((row) => ({ ...row, at: row.at.toISOString(), players: sizes.get(row.id) ?? 1 })),
  };
}

export type HistoryPage = Awaited<ReturnType<typeof listHistory>>;

/** Le joueur du compte de la session ; "guest" pour un invité signé ; null sans session. */
async function accountOf(req: Request, auth: Auth, secret: string): Promise<number | "guest" | "none" | null> {
  const session = await auth.api.getSession({ headers: req.headers }).catch(() => null);
  if (session) return (session.user as { playerId?: number | null }).playerId ?? "none";
  return readGuest(req.headers, secret) ? "guest" : null;
}

/** GET /api/history?page=N. */
export async function handleHistory(req: Request, db: Db, auth: Auth, secret = guestSecret()): Promise<Response> {
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  const who = await accountOf(req, auth, secret);
  if (who === null) return json({ error: "unauthorized" }, 401);
  if (who === "guest") return json({ error: "account_required" }, 403);
  const raw = new URL(req.url).searchParams.get("page");
  const page = PageSchema.safeParse(raw ?? "1");
  if (!page.success) return json({ error: "invalid_page" }, 400);
  if (who === "none") return json({ page: page.data, pageSize: HISTORY_PAGE_SIZE, total: 0, pages: 0, races: [] });
  return json(await listHistory(db, who, page.data));
}

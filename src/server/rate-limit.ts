// SALLE-10 : limite de tentatives par IP contre la force brute des codes de salle. Le compteur est en base, pas en
// mémoire : sur Vercel, deux requêtes d'une même IP peuvent tomber sur deux instances. Une seule requête atomique
// (INSERT … ON CONFLICT DO UPDATE) compte la tentative et dit si elle passe, même sous requêtes simultanées.
import { sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { rateLimits } from "../../db/schema";
import { clientIp } from "./client-ip";

export type Rule = { bucket: string; limit: number; windowMs: number };

/** Rejoindre une salle (par code ou par invitation) : 10 tentatives par minute et par IP. */
export const JOIN_RULE: Rule = { bucket: "room-join", limit: 10, windowMs: 60_000 };

export type Verdict = { allowed: true } | { allowed: false; retryAfter: number };

/** Compte une tentative de `key` pour `rule`. Toute tentative compte, acceptée ou non, réussie ou non. */
export async function hit(db: Db, rule: Rule, key: string, now = new Date()): Promise<Verdict> {
  const at = sql`${now.toISOString()}::timestamptz`;
  const expired = sql`${rateLimits.windowStart} <= ${at} - ${`${rule.windowMs} milliseconds`}::interval`;
  const [row] = await db
    .insert(rateLimits)
    .values({ bucket: rule.bucket, key, windowStart: now, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.bucket, rateLimits.key],
      set: {
        count: sql`case when ${expired} then 1 else ${rateLimits.count} + 1 end`,
        windowStart: sql`case when ${expired} then ${at} else ${rateLimits.windowStart} end`,
      },
    })
    .returning({ count: rateLimits.count, windowStart: rateLimits.windowStart });
  if (row!.count <= rule.limit) return { allowed: true };
  const left = row!.windowStart.getTime() + rule.windowMs - now.getTime();
  return { allowed: false, retryAfter: Math.max(1, Math.ceil(left / 1000)) };
}

/** Garde d'une route : null si la requête passe, sinon la réponse 429 à renvoyer. */
export type Guard = (req: Request) => Promise<Response | null>;

export function joinGuard(db: Db, now: () => Date = () => new Date()): Guard {
  return async (req) => {
    const verdict = await hit(db, JOIN_RULE, clientIp(req.headers), now());
    if (verdict.allowed) return null;
    return Response.json({ error: "rate_limited" }, { status: 429, headers: { "retry-after": String(verdict.retryAfter) } });
  };
}

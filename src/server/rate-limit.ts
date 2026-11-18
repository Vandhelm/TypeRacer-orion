// SALLE-10 : limite de tentatives par IP contre la force brute des codes de salle. Le compteur est en base, pas en
// mémoire : sur Vercel, deux requêtes d'une même IP peuvent tomber sur deux instances. Une seule requête atomique
// (INSERT … ON CONFLICT DO UPDATE) compte la tentative et dit si elle passe, même sous requêtes simultanées.
import { isIP } from "node:net";
import { sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { rateLimits } from "../../db/schema";
import { clientIp } from "./client-ip";

export type Rule = { bucket: string; limit: number; windowMs: number };

/** Rejoindre une salle (par code ou par invitation) : 10 tentatives par minute et par IP. */
export const JOIN_RULE: Rule = { bucket: "room-join", limit: 10, windowMs: 60_000 };

/**
 * La clé de limite d'une IP. Une IPv6 compte par /64 : un abonné en reçoit souvent un entier et pourrait changer
 * d'adresse à chaque essai. Une IPv4 notée en IPv6 (::ffff:a.b.c.d) partage la clé de son IPv4.
 */
export function ipKey(ip: string): string {
  if (isIP(ip) !== 6) return ip;
  const lower = ip.toLowerCase();
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return mapped[1]!;
  // une IPv4 en fin d'adresse (…:1.2.3.4) occupe deux groupes
  const groups = (part: string) => (part ? part.split(":").flatMap((group) => (group.includes(".") ? ["0", "0"] : [group])) : []);
  const [head = "", tail] = lower.split("::");
  const left = groups(head);
  const right = tail === undefined ? [] : groups(tail);
  const full = [...left, ...Array<string>(8 - left.length - right.length).fill("0"), ...right];
  return `${full
    .slice(0, 4)
    .map((group) => parseInt(group, 16).toString(16))
    .join(":")}::/64`;
}

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
  // une instance dont l'horloge retarde ne doit pas annoncer plus d'une fenêtre d'attente
  return { allowed: false, retryAfter: Math.min(rule.windowMs / 1000, Math.max(1, Math.ceil(left / 1000))) };
}

/** Garde d'une route : null si la requête passe, sinon la réponse 429 à renvoyer. */
export type Guard = (req: Request) => Promise<Response | null>;

export function joinGuard(db: Db, now: () => Date = () => new Date()): Guard {
  return async (req) => {
    const verdict = await hit(db, JOIN_RULE, ipKey(clientIp(req.headers)), now());
    if (verdict.allowed) return null;
    return Response.json({ error: "rate_limited" }, { status: 429, headers: { "retry-after": String(verdict.retryAfter) } });
  };
}

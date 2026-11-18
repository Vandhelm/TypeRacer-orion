// SALLE-10 : limite de tentatives par IP contre la force brute des codes de salle. Le compteur est en base, pas en
// mémoire : sur Vercel, deux requêtes d'une même IP peuvent tomber sur deux instances. Une seule requête atomique
// (INSERT … ON CONFLICT DO UPDATE) compte la tentative et dit si elle passe, même sous requêtes simultanées.
import { isIP } from "node:net";
import { sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { rateLimits } from "../../db/schema";
import { clientIp, type IpContext } from "./client-ip";

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

/** Part des tentatives qui purgent au passage les fenêtres expirées : la table reste petite sans tâche planifiée. */
export const PURGE_RATE = 0.01;

/** `now` : l'heure de la tentative, pour les tests ; par défaut l'horloge de Postgres, commune à toutes les instances. */
export type HitOptions = { now?: Date; purge?: boolean };

const instant = (now?: Date) => (now ? sql`${now.toISOString()}::timestamptz` : sql`now()`);
const span = (rule: Rule) => sql`${`${rule.windowMs} milliseconds`}::interval`;

/**
 * Compte une tentative de `key` pour `rule`. Toute tentative compte, acceptée ou non, réussie ou non : une IP partagée
 * (NAT d'une école, d'un bureau) partage donc aussi ses 10 essais par minute, entrées réussies comprises.
 */
export async function hit(db: Db, rule: Rule, key: string, { now, purge = Math.random() < PURGE_RATE }: HitOptions = {}): Promise<Verdict> {
  const at = instant(now);
  const expired = sql`${rateLimits.windowStart} <= ${at} - ${span(rule)}`;
  const [row] = await db
    .insert(rateLimits)
    .values({ bucket: rule.bucket, key, windowStart: at, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.bucket, rateLimits.key],
      set: {
        count: sql`case when ${expired} then 1 else ${rateLimits.count} + 1 end`,
        windowStart: sql`case when ${expired} then ${at} else ${rateLimits.windowStart} end`,
      },
    })
    .returning({ count: rateLimits.count, left: sql<string>`extract(epoch from ${rateLimits.windowStart} + ${span(rule)} - ${at})` });
  if (purge) await purgeExpired(db, rule, now);
  if (row!.count <= rule.limit) return { allowed: true };
  // borné à une fenêtre : une heure injectée en retard sur la fenêtre ne doit pas annoncer plus d'attente
  return { allowed: false, retryAfter: Math.min(rule.windowMs / 1000, Math.max(1, Math.ceil(Number(row!.left)))) };
}

/** Supprime les fenêtres expirées de `rule` : la tentative suivante d'une telle clé repartirait de 1 de toute façon. */
export async function purgeExpired(db: Db, rule: Rule, now?: Date): Promise<void> {
  await db.delete(rateLimits).where(sql`${rateLimits.bucket} = ${rule.bucket} and ${rateLimits.windowStart} <= ${instant(now)} - ${span(rule)}`);
}

/** Garde d'une route : null si la requête passe, sinon la réponse 429 à renvoyer. */
export type Guard = (req: Request) => Promise<Response | null>;

/** `peer` : l'IP de la socket (serveur Bun) ; `env` : pour les tests (voir client-ip.ts) ; `now` : idem. */
export function joinGuard(db: Db, { now, env, peer }: { now?: () => Date } & IpContext = {}): Guard {
  return async (req) => {
    const verdict = await hit(db, JOIN_RULE, ipKey(clientIp(req.headers, { env, peer })), { now: now?.() });
    if (verdict.allowed) return null;
    return Response.json({ error: "rate_limited" }, { status: 429, headers: { "retry-after": String(verdict.retryAfter) } });
  };
}

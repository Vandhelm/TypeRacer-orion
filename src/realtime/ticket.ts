// Ticket de connexion au serveur temps réel (TECH-06).
// Le serveur temps réel tourne sur un autre domaine que le site : les cookies de session n'y arrivent pas.
// /api/realtime/ticket (Next.js) lit la session Better Auth ou le cookie invité signé et remet ce ticket
// court, signé HMAC-SHA256, à usage unique (le serveur garde les nonces vus jusqu'à leur expiration).
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { Player } from "./protocol";

export const TICKET_TTL_MS = 60_000;
const SECRET_MIN = 32;
/** Séparation de domaine : une autre valeur signée avec le même secret (cookie invité) n'est pas un ticket. */
const DOMAIN = "orion-realtime-ticket:";

type Env = Record<string, string | undefined>;

/** REALTIME_SECRET, sinon BETTER_AUTH_SECRET : le même des deux côtés (site et serveur temps réel). */
export function realtimeSecret(env: Env = process.env) {
  const secret = env.REALTIME_SECRET || env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < SECRET_MIN) throw new Error(`REALTIME_SECRET (or BETTER_AUTH_SECRET) must be set, ${SECRET_MIN} characters or more`);
  return secret;
}

const sign = (payload: string, secret: string) => createHmac("sha256", secret).update(DOMAIN + payload).digest("base64url");

const Payload = z.object({ p: Player.strict(), e: z.number(), n: z.string().min(1).max(64) }).strict();

export function signTicket(player: Player, secret: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ p: player, e: now + TICKET_TTL_MS, n: randomUUID() })).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export type Ticket = { player: Player; nonce: string; expires: number };

/** Le joueur d'un ticket, seulement si la signature est bonne et qu'il n'a pas expiré. */
export function verifyTicket(value: string, secret: string, now = Date.now()): Ticket | null {
  if (value.length > 2048) return null;
  const parts = value.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [payload, signature] = parts as [string, string];
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = Payload.safeParse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    if (!data.success || data.data.e <= now) return null;
    return { player: data.data.p, nonce: data.data.n, expires: data.data.e };
  } catch {
    return null;
  }
}

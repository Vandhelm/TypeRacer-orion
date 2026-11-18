// Session d'invité (AUTH-02) : le pseudonyme choisi à l'accueil est validé ici puis gardé dans un cookie
// signé (HMAC-SHA256). Le serveur ne croit que ce cookie : un cookie altéré ou signé avec un autre secret est ignoré.
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { isValidNickname, NICKNAME_MAX, NICKNAME_MIN } from "../players/nickname";

export const GUEST_COOKIE = "orion_guest";
/** Durée de validité inscrite dans le cookie signé. */
export const GUEST_TTL_MS = 7 * 24 * 3600 * 1000;
const SECRET_MIN = 32;

type Env = Record<string, string | undefined>;

/** Secret de signature : GUEST_SESSION_SECRET, sinon BETTER_AUTH_SECRET. Jamais dans le code. */
export function guestSecret(env: Env = process.env) {
  const secret = env.GUEST_SESSION_SECRET || env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < SECRET_MIN) throw new Error(`GUEST_SESSION_SECRET (or BETTER_AUTH_SECRET) must be set, ${SECRET_MIN} characters or more`);
  return secret;
}

const sign = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("base64url");

/**
 * TECH-06 : `i` est l'identifiant aléatoire de la session invitée. Deux invités au même pseudo (« Alice », « alice »)
 * restent deux joueurs distincts dans une salle temps réel.
 */
export function signGuest(nickname: string, secret: string, now = Date.now(), id: string = randomUUID()) {
  const payload = Buffer.from(JSON.stringify({ n: nickname, e: now + GUEST_TTL_MS, i: id })).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

// `i` manque dans les cookies émis avant TECH-06 : la session reste valable, sans identifiant.
const Payload = z.object({ n: z.string(), e: z.number(), i: z.uuid().optional() });

export type GuestSession = { nickname: string; id: string | null; expires: number };

/** La session d'un cookie, seulement si la signature, la date et la règle du pseudo sont bonnes. */
export function verifyGuestSession(value: string, secret: string, now = Date.now()): GuestSession | null {
  const parts = value.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [payload, signature] = parts as [string, string];
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = Payload.safeParse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    if (!data.success || data.data.e <= now || !isValidNickname(data.data.n)) return null;
    return { nickname: data.data.n, id: data.data.i ?? null, expires: data.data.e };
  } catch {
    return null;
  }
}

/** Le pseudonyme d'un cookie, seulement si la signature, la date et la règle du pseudo sont bonnes. */
export function verifyGuest(value: string, secret: string, now = Date.now()): string | null {
  return verifyGuestSession(value, secret, now)?.nickname ?? null;
}

export function guestCookie(value: string, secure: boolean, maxAge?: number) {
  const parts = [`${GUEST_COOKIE}=${value}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (maxAge !== undefined) parts.push(`Max-Age=${maxAge}`);
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/** La session vérifiée de l'invité qui envoie ces en-têtes, ou null. */
export function readGuestSession(headers: Headers, secret = guestSecret(), now = Date.now()): GuestSession | null {
  for (const pair of (headers.get("cookie") ?? "").split(";")) {
    const [name, ...rest] = pair.trim().split("=");
    if (name === GUEST_COOKIE) return verifyGuestSession(rest.join("="), secret, now);
  }
  return null;
}

/** Le pseudonyme vérifié de l'invité qui envoie ces en-têtes, ou null. */
export function readGuest(headers: Headers, secret = guestSecret(), now = Date.now()) {
  return readGuestSession(headers, secret, now)?.nickname ?? null;
}

const GuestBody = z
  .object({ nickname: z.string().min(NICKNAME_MIN).max(NICKNAME_MAX).refine(isValidNickname) })
  .strict();

/** /api/guest — POST { nickname } : ouvre la session. GET : la lit. DELETE : la ferme. */
export async function handleGuest(req: Request, env: Env = process.env): Promise<Response> {
  const secret = guestSecret(env);
  const secure = new URL(req.url).protocol === "https:";
  if (req.method === "GET") {
    const nickname = readGuest(req.headers, secret);
    return nickname ? Response.json({ nickname }) : Response.json({ error: "no_guest_session" }, { status: 401 });
  }
  if (req.method === "DELETE") {
    return Response.json({ ok: true }, { headers: { "set-cookie": guestCookie("", secure, 0) } });
  }
  if (req.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 });
  const body = GuestBody.safeParse(await req.json().catch(() => undefined));
  if (!body.success) return Response.json({ error: "bad_nickname" }, { status: 400 });
  const { nickname } = body.data;
  return Response.json({ nickname }, { headers: { "set-cookie": guestCookie(signGuest(nickname, secret), secure) } });
}

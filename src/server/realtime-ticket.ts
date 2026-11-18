// /api/realtime/ticket (TECH-06) : le ticket qui ouvre une connexion au serveur temps réel.
// L'identité vient de la session Better Auth, sinon du cookie invité signé (AUTH-02) ; jamais du client.
// Un invité est désigné par l'identifiant aléatoire de sa session (`g:<uuid>`), pas par son pseudo : deux
// « Alice » restent deux joueurs. Un cookie émis avant cet identifiant en reçoit un ici, réécrit dans le cookie.
import { randomUUID } from "node:crypto";
import type { Player } from "../realtime/protocol";
import { realtimeSecret, signTicket } from "../realtime/ticket";
import type { Auth } from "./auth";
import { GUEST_TTL_MS, guestCookie, guestSecret, readGuestSession, signGuest } from "./guest";

type Env = Record<string, string | undefined>;

export const DEFAULT_REALTIME_URL = "ws://localhost:3001";

type Identity = { player: Player; setCookie?: string };

async function sessionPlayer(req: Request, auth: Auth, env: Env): Promise<Identity | null> {
  const session = await auth.api.getSession({ headers: req.headers }).catch(() => null);
  if (session) {
    const user = session.user as { id: string; playerId?: number | null; displayUsername?: string | null; username?: string | null; name: string };
    return { player: { id: `u:${user.playerId ?? user.id}`, name: user.displayUsername || user.username || user.name, guest: false } };
  }
  const secret = guestSecret(env);
  const guest = readGuestSession(req.headers, secret);
  if (!guest) return null;
  const player = (id: string) => ({ id: `g:${id}`, name: guest.nickname, guest: true });
  if (guest.id) return { player: player(guest.id) };
  const id = randomUUID();
  const value = signGuest(guest.nickname, secret, guest.expires - GUEST_TTL_MS, id);
  return { player: player(id), setCookie: guestCookie(value, new URL(req.url).protocol === "https:") };
}

export async function handleRealtimeTicket(req: Request, auth: Auth, env: Env = process.env): Promise<Response> {
  if (req.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 });
  const headers: Record<string, string> = { "cache-control": "no-store" };
  const identity = await sessionPlayer(req, auth, env);
  if (!identity) return Response.json({ error: "no_session" }, { status: 401, headers });
  if (identity.setCookie) headers["set-cookie"] = identity.setCookie;
  const ticket = signTicket(identity.player, realtimeSecret(env));
  return Response.json({ ticket, url: env.REALTIME_PUBLIC_URL || DEFAULT_REALTIME_URL }, { headers });
}

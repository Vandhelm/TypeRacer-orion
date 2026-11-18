// /api/realtime/ticket (TECH-06) : le ticket qui ouvre une connexion au serveur temps réel.
// L'identité vient de la session Better Auth, sinon du cookie invité signé (AUTH-02) ; jamais du client.
import type { Player } from "../realtime/protocol";
import { realtimeSecret, signTicket } from "../realtime/ticket";
import type { Auth } from "./auth";
import { guestSecret, readGuest } from "./guest";

type Env = Record<string, string | undefined>;

export const DEFAULT_REALTIME_URL = "ws://localhost:3001";

async function sessionPlayer(headers: Headers, auth: Auth, env: Env): Promise<Player | null> {
  const session = await auth.api.getSession({ headers }).catch(() => null);
  if (session) {
    const user = session.user as { id: string; playerId?: number | null; displayUsername?: string | null; username?: string | null; name: string };
    return { id: `u:${user.playerId ?? user.id}`, name: user.displayUsername || user.username || user.name, guest: false };
  }
  const guest = readGuest(headers, guestSecret(env));
  return guest ? { id: `g:${guest.toLowerCase()}`, name: guest, guest: true } : null;
}

export async function handleRealtimeTicket(req: Request, auth: Auth, env: Env = process.env): Promise<Response> {
  if (req.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 });
  const headers = { "cache-control": "no-store" };
  const player = await sessionPlayer(req.headers, auth, env);
  if (!player) return Response.json({ error: "no_session" }, { status: 401, headers });
  const ticket = signTicket(player, realtimeSecret(env));
  return Response.json({ ticket, url: env.REALTIME_PUBLIC_URL || DEFAULT_REALTIME_URL }, { headers });
}

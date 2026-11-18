// AUTH-02 : on n'entre dans un salon qu'avec un nom vérifié par le serveur —
// le compte connecté, sinon le pseudonyme du cookie d'invité signé.
// AUTH-03 : un invité ne crée pas de salon ; il n'entre que pour en rejoindre un (code, invitation, table).
import { z } from "zod";
import type { Auth } from "./auth";
import { guestSecret, readGuest } from "./guest";

type Player = { name: string; guest: boolean };

async function verifiedPlayer(headers: Headers, auth: Auth, secret: string): Promise<Player | null> {
  const session = await auth.api.getSession({ headers }).catch(() => null);
  if (session) {
    const user = session.user as { displayUsername?: string | null; username?: string | null; name: string };
    return { name: user.displayUsername || user.username || user.name, guest: false };
  }
  const guest = readGuest(headers, secret);
  return guest ? { name: guest, guest: true } : null;
}

/** Le nom sous lequel ces en-têtes entrent dans un salon, ou null s'il faut d'abord choisir un pseudonyme. */
export async function roomPlayer(headers: Headers, auth: Auth, secret = guestSecret()): Promise<string | null> {
  return (await verifiedPlayer(headers, auth, secret))?.name ?? null;
}

/** Rejoindre un salon existant : un code, un lien d'invitation ou une table de l'explorateur. Tout le reste crée ou rouvre son propre salon. */
export function joinsRoom(query: URLSearchParams) {
  return ["code", "invite", "table"].some((key) => !!query.get(key)?.trim());
}

// TECH-07 : les paramètres d'URL reçus par la page sont validés avant d'être lus.
const RoomParams = z.record(z.string(), z.union([z.string().max(256), z.array(z.string().max(256))]).optional());

/** Les searchParams de Next.js en requête : la première valeur d'une clé répétée ; une entrée invalide est ignorée. */
export function roomQuery(params: unknown): URLSearchParams {
  const parsed = RoomParams.safeParse(params);
  const query = new URLSearchParams();
  if (!parsed.success) return query;
  for (const [key, value] of Object.entries(parsed.data)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined) query.set(key, first);
  }
  return query;
}

export type RoomEntry = { player: string; guest: boolean } | { refused: "anonymous" | "guest" };

/** Qui entre dans /room avec cette requête : sans nom vérifié, refusé ; un invité, refusé en mode création (hôte). */
export async function roomEntry(headers: Headers, auth: Auth, query: URLSearchParams, secret = guestSecret()): Promise<RoomEntry> {
  const player = await verifiedPlayer(headers, auth, secret);
  if (!player) return { refused: "anonymous" };
  if (player.guest && !joinsRoom(query)) return { refused: "guest" };
  return { player: player.name, guest: player.guest };
}

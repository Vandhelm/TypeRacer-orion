// AUTH-02 : on n'entre dans un salon qu'avec un nom vérifié par le serveur —
// le compte connecté, sinon le pseudonyme du cookie d'invité signé.
import type { Auth } from "./auth";
import { guestSecret, readGuest } from "./guest";

/** Le nom sous lequel ces en-têtes entrent dans un salon, ou null s'il faut d'abord choisir un pseudonyme. */
export async function roomPlayer(headers: Headers, auth: Auth, secret = guestSecret()): Promise<string | null> {
  const session = await auth.api.getSession({ headers }).catch(() => null);
  if (session) {
    const user = session.user as { displayUsername?: string | null; username?: string | null; name: string };
    return user.displayUsername || user.username || user.name;
  }
  return readGuest(headers, secret);
}

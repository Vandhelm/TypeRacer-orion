// TECH-01 : le compte connecté, lu par le serveur pour le premier rendu d'une page. Seulement les champs dont
// l'interface a besoin : ce qui est passé à un composant client finit dans le HTML.
import type { Auth } from "./auth";

export type CurrentUser = {
  id: string;
  name: string;
  displayUsername: string | null;
  username: string | null;
  image: string | null;
  /** Compte créé par GitHub ou Discord, qui doit encore choisir son pseudo. */
  needsUsername: boolean;
};

export async function currentUser(headers: Headers, auth: Auth): Promise<CurrentUser | null> {
  const session = await auth.api.getSession({ headers }).catch(() => null);
  if (!session) return null;
  const user = session.user as { id: string; name: string; displayUsername?: string | null; username?: string | null; image?: string | null; needsUsername?: boolean | null };
  return {
    id: user.id,
    name: user.name,
    displayUsername: user.displayUsername ?? null,
    username: user.username ?? null,
    image: user.image ?? null,
    needsUsername: !!user.needsUsername,
  };
}

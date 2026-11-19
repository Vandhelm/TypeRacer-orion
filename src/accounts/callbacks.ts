// Adresses de retour de la connexion GitHub ou Discord (Better Auth), sans dépendance au navigateur pour être testées.
import { inviteReturn, isInviteToken } from "../rooms/access";

/**
 * search : location.search de l'accueil. SALLE-04 : arrivé depuis un lien d'invitation (/?invite=T), on y retourne
 * après la connexion, et une erreur ramène à l'accueil sans perdre le lien.
 */
export function socialCallbacks(provider: string, search: string) {
  const query = new URLSearchParams(search);
  const token = query.get("invite");
  const keep = token && isInviteToken(token) ? `&invite=${token}` : "";
  return { callbackURL: inviteReturn(query) ?? "/", errorCallbackURL: `/?authError=${provider}${keep}` };
}

import { headers } from "next/headers";
import { titleFor } from "../src/i18n/request";
import { auth } from "../src/server/api";
import { currentUser } from "../src/server/session";
import { HomePage } from "../src/views/home/HomePage";
import "../src/styles/pages/home/index.css";

export const generateMetadata = titleFor("home");

// TECH-01 : rendue par le serveur, avec le compte connecté déjà connu (le panneau ne montre pas d'abord le formulaire
// de connexion). La scène canvas, le hash (#rooms) et le pseudo gardé dans l'onglet arrivent au montage.
export default async function Page() {
  const user = await currentUser(await headers(), auth());
  // sans la photo (une data: URL) : l'accueil ne l'affiche pas, inutile de l'envoyer dans le HTML
  const me = user && { id: user.id, name: user.name, displayUsername: user.displayUsername, username: user.username, needsUsername: user.needsUsername };
  return (
    <div id="root">
      <HomePage me={me} />
    </div>
  );
}

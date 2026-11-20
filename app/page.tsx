import { headers } from "next/headers";
import type { Metadata } from "next";
import { requestLanguage, titleFor } from "../src/i18n/request";
import { homeDescription } from "../src/i18n/server";
import { auth } from "../src/server/api";
import { currentUser } from "../src/server/session";
import { HomePage } from "../src/views/home/HomePage";
import "../src/styles/pages/home/index.css";

// PERF-01 (Lighthouse, SEO) : titre et meta description dans la langue de la requête.
export async function generateMetadata(): Promise<Metadata> {
  return { ...(await titleFor("home")()), description: homeDescription(await requestLanguage()) };
}

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

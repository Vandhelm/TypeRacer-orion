import { headers } from "next/headers";
import { titleFor } from "../../src/i18n/request";
import { auth, db } from "../../src/server/api";
import { profileData, profileQuery } from "../../src/server/profile-page";
import { ProfilePage } from "../../src/views/profile/ProfilePage";
import "../../src/styles/pages/profile/index.css";

export const generateMetadata = titleFor("profile");

// TECH-01 : rendue par le serveur. Le compte connecté et les stats du joueur montré sont lus ici, sans aller-retour
// par /api ; seuls la course de l'onglet (sessionStorage) et les choix gardés dans le navigateur arrivent après le montage.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = profileQuery(await searchParams);
  const { me, stats } = await profileData(await headers(), auth(), db(), query);
  return (
    <div id="root">
      <ProfilePage me={me} query={query} stats={stats} />
    </div>
  );
}

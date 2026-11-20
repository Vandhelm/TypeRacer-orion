import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { titleFor } from "../../src/i18n/request";
import { PlayerProvider } from "../../src/players/PlayerProvider";
import { auth, db } from "../../src/server/api";
import { gameDetour } from "../../src/server/game-gate";
import { roomIdentity, roomPlayer } from "../../src/server/room-gate";
import { GamePage } from "../../src/views/game/GamePage";
import "../../src/styles/pages/game/index.css";

export const generateMetadata = titleFor("game");

// AUTH-06 : en course, on porte le nom vérifié par le serveur (le compte connecté, sinon le pseudonyme d'invité),
// celui que /api/races reconnaît pour garder la course dans l'historique du compte.
// TECH-01 : rendue par le serveur ; la course, le bassin et le temps réel démarrent au montage.
// COURSE-02 : /game ouvert directement ne fait pas courir : seul un salon lancé par le serveur (assez de participants) y mène.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const player = await roomPlayer(await headers(), auth());
  const who = await roomIdentity(await headers(), auth());
  if (!player || !who) redirect("/");
  const { code } = await searchParams;
  const detour = await gameDetour(db(), typeof code === "string" ? code : undefined, who);
  if (detour) redirect(detour);
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@700&display=swap" precedence="default" />
      <PlayerProvider name={player} guest={false}>
        <div id="root">
          <GamePage />
        </div>
      </PlayerProvider>
    </>
  );
}

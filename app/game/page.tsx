import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { titleFor } from "../../src/i18n/request";
import { PlayerProvider } from "../../src/players/PlayerProvider";
import { auth } from "../../src/server/api";
import { roomPlayer } from "../../src/server/room-gate";
import { GamePage } from "../../src/views/game/GamePage";
import "../../src/styles/pages/game/index.css";

export const generateMetadata = titleFor("game");

// AUTH-06 : en course, on porte le nom vérifié par le serveur (le compte connecté, sinon le pseudonyme d'invité),
// celui que /api/races reconnaît pour garder la course dans l'historique du compte.
// TECH-01 : rendue par le serveur ; la course, le bassin et le temps réel démarrent au montage.
export default async function Page() {
  const player = await roomPlayer(await headers(), auth());
  if (!player) redirect("/");
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

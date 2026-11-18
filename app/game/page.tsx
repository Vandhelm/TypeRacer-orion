import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LegacyPage } from "../../src/next/LegacyPage";
import { auth } from "../../src/server/api";
import { roomPlayer } from "../../src/server/room-gate";
import "../../src/styles/pages/game/index.css";

export const metadata: Metadata = { title: "O.R.I.O.N — L'épreuve" };

// AUTH-06 : en course, on porte le nom vérifié par le serveur (le compte connecté, sinon le pseudonyme d'invité),
// celui que /api/races reconnaît pour garder la course dans l'historique du compte.
export default async function Page() {
  const player = await roomPlayer(await headers(), auth());
  if (!player) redirect("/");
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@700&display=swap" precedence="default" />
      <LegacyPage name="game" player={player} />
    </>
  );
}

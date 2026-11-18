import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LegacyPage } from "../../src/next/LegacyPage";
import { auth } from "../../src/server/api";
import { roomPlayer } from "../../src/server/room-gate";
import "../../src/styles/pages/room/index.css";

export const metadata: Metadata = { title: "O.R.I.O.N — Le salon" };

// AUTH-02 : sans compte ni cookie d'invité signé, on retourne choisir un pseudonyme à l'accueil.
export default async function Page() {
  const player = await roomPlayer(await headers(), auth());
  if (!player) redirect("/");
  return (
    <>
      <LegacyPage name="room" player={player} />
    </>
  );
}

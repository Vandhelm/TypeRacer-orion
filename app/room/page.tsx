import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LegacyPage } from "../../src/next/LegacyPage";
import { auth } from "../../src/server/api";
import { roomEntry, roomQuery } from "../../src/server/room-gate";
import "../../src/styles/pages/room/index.css";

export const metadata: Metadata = { title: "O.R.I.O.N — Le salon" };

// AUTH-02 : sans compte ni cookie d'invité signé, on retourne choisir un pseudonyme à l'accueil.
// AUTH-03 : un invité qui tente de créer un salon (ou d'en rouvrir un comme hôte) repart vers la liste des salons.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const entry = await roomEntry(await headers(), auth(), roomQuery(await searchParams));
  if ("refused" in entry) redirect(entry.refused === "guest" ? "/home#rooms" : "/");
  return (
    <>
      <LegacyPage name="room" player={entry.player} guest={entry.guest} />
    </>
  );
}

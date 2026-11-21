import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { titleFor } from "../../src/i18n/request";
import { PlayerProvider } from "../../src/players/PlayerProvider";
import { inviteDetour } from "../../src/rooms/access";
import { auth } from "../../src/server/api";
import { roomEntry, roomQuery } from "../../src/server/room-gate";
import { RoomPage } from "../../src/views/room/RoomPage";
import "../../src/styles/pages/room/index.css";

export const generateMetadata = titleFor("room");

// AUTH-02 : sans compte ni cookie d'invité signé, on retourne choisir un pseudonyme à l'accueil.
// AUTH-03 : un invité qui tente de créer un salon (ou d'en rouvrir un comme hôte) repart vers la liste des salons.
// TECH-01 : rendue par le serveur ; le salon (gardé dans ce navigateur) et le bassin arrivent au montage.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = roomQuery(await searchParams);
  const entry = await roomEntry(await headers(), auth(), query);
  // SALLE-04 : un visiteur sans session garde son lien d'invitation pendant qu'il choisit son pseudonyme
  if ("refused" in entry) redirect(entry.refused === "guest" ? "/home#rooms" : inviteDetour(query));
  return (
    <PlayerProvider name={entry.player} guest={entry.guest}>
      <div id="root">
        <RoomPage />
      </div>
    </PlayerProvider>
  );
}

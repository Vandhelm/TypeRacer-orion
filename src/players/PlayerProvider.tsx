"use client";
// TECH-01 : le joueur de la page (salon, course), vérifié par le serveur : le compte connecté, sinon le cookie d'invité.
// Un contexte et non une variable de module : sur le serveur, un module est partagé entre toutes les requêtes.
import { createContext, useContext, type ReactNode } from "react";

export type PagePlayer = {
  /** Mon nom en jeu. Jamais de nom inventé à la place d'un pseudonyme. */
  name: string;
  /** AUTH-03 : un invité (sans compte) ? Dit par le serveur, jamais deviné. */
  guest: boolean;
};

const PlayerContext = createContext<PagePlayer>({ name: "", guest: false });

export function PlayerProvider({ name, guest, children }: PagePlayer & { children: ReactNode }) {
  return <PlayerContext.Provider value={{ name, guest }}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  return useContext(PlayerContext);
}

"use client";
// Migration progressive vers Next.js (TECH-01) : chaque page existante est servie par l'App Router telle quelle,
// rendue seulement dans le navigateur (comme avec les anciens fichiers HTML). Une page migrée pour de bon
// n'utilise plus ce composant.
import dynamic from "next/dynamic";
import type { LegacyPageName } from "./LegacyRoot";

const LegacyRoot = dynamic(() => import("./LegacyRoot"), { ssr: false });

/** player : le nom vérifié par le serveur, pour les pages qui en ont besoin (salon). */
export function LegacyPage({ name, player }: { name: LegacyPageName; player?: string }) {
  return <LegacyRoot name={name} player={player} />;
}

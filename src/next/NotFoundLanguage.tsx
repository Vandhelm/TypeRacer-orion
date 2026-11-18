"use client";
// Sélecteur de langue de la page 404 (rendue par le serveur) : le texte vient du serveur, donc on recharge après le choix.
import dynamic from "next/dynamic";

const Switcher = dynamic(() => import("./NotFoundSwitcher"), { ssr: false });

export function NotFoundLanguage() {
  return <Switcher />;
}

"use client";
// Sélecteur de langue de la page 404 (rendue par le serveur) : le texte vient du serveur, donc on recharge après le choix.
import { LanguageSwitcher } from "../components/tabs/LanguageSwitcher";

export function NotFoundLanguage() {
  return <LanguageSwitcher className="hanging-tabs-floating" onChanged={() => location.reload()} />;
}

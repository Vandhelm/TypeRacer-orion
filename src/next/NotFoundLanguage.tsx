"use client";
// Sélecteur de langue de la page 404 (rendue par le serveur) : le texte vient du serveur, donc on recharge après le choix.
import { FLOATING_TABS, LanguageSwitcher } from "../components/tabs/LanguageSwitcher";

export function NotFoundLanguage() {
  return <LanguageSwitcher className={FLOATING_TABS} onChanged={() => location.reload()} />;
}

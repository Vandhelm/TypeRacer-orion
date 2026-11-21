"use client";
import { useTranslation } from "react-i18next";

/**
 * A11Y-02 : le pied de page commun (landmark contentinfo), posé par app/layout.tsx après chaque page.
 * Réservé aux lecteurs d'écran (sr-only) : les pages sont des scènes plein écran (bassin, podium 3D, course en h-screen)
 * où une bande visible casserait la mise en page ; sr-only (absolu, 1 px, marge -1 px) n'ajoute aucun défilement.
 */
export function SiteFooter() {
  const { t } = useTranslation();
  return <footer className="sr-only">{t("footer.text")}</footer>;
}

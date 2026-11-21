import type { Viewport } from "next";
import type { ReactNode } from "react";
import { requestLanguage } from "../src/i18n/request";
import { SiteFooter } from "../src/components/navigation/SiteFooter";
import { I18nProvider } from "../src/next/I18nProvider";

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

// I18N-02 : l'attribut lang suit le choix mémorisé, sinon la langue du navigateur.
// A11Y-02 : le pied de page commun suit chaque page, 404 comprise (réservé aux lecteurs d'écran, voir SiteFooter).
// TECH-01 : la même langue sert aux traductions, rendues côté serveur puis reprises dans le navigateur.
export default async function RootLayout({ children }: { children: ReactNode }) {
  const language = await requestLanguage();
  return (
    <html lang={language}>
      <body>
        <I18nProvider language={language}>
          {children}
          <SiteFooter />
        </I18nProvider>
      </body>
    </html>
  );
}

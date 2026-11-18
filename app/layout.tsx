import type { Viewport } from "next";
import type { ReactNode } from "react";
import { requestLanguage } from "../src/i18n/request";

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

// I18N-02 : l'attribut lang suit le choix mémorisé, sinon la langue du navigateur.
export default async function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={await requestLanguage()}>
      <body>{children}</body>
    </html>
  );
}

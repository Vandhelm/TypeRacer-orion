"use client";
// TECH-01 / I18N-02 : fournit les traductions à tout l'arbre, dans la langue résolue par le serveur
// (cookie, sinon Accept-Language). Le premier rendu est donc le même côté serveur et côté navigateur.
import { useEffect, useState, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { createI18n, type Language } from "../i18n";

export function I18nProvider({ language, children }: { language: Language; children: ReactNode }) {
  const [i18n] = useState(() => createI18n(language));

  useEffect(() => {
    const syncHtmlLang = (lng: string) => {
      document.documentElement.lang = lng;
    };
    i18n.on("languageChanged", syncHtmlLang);
    return () => i18n.off("languageChanged", syncHtmlLang);
  }, [i18n]);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}

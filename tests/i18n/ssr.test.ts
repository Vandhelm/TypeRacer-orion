import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { useTranslation } from "react-i18next";

describe("TECH-01 — traductions rendues côté serveur", () => {
  test("le module i18n s'importe sans document ni window", async () => {
    expect(typeof (globalThis as { document?: unknown }).document).toBe("undefined");
    const { createI18n } = await import("../../src/i18n");
    expect(createI18n("fr").t("home.langChoice")).not.toBe("home.langChoice");
  });

  test("le fournisseur démarre dans la langue donnée par le serveur", async () => {
    const { I18nProvider } = await import("../../src/next/I18nProvider");
    const Probe = () => {
      const { i18n } = useTranslation();
      return createElement("span", null, i18n.resolvedLanguage);
    };
    for (const language of ["fr", "en"] as const) {
      expect(renderToString(createElement(I18nProvider, { language, children: createElement(Probe) }))).toContain(`>${language}<`);
    }
  });

  test("chaque requête a sa propre instance (pas de langue partagée entre visiteurs)", async () => {
    const { createI18n } = await import("../../src/i18n");
    const fr = createI18n("fr");
    const en = createI18n("en");
    expect(fr).not.toBe(en);
    expect(fr.resolvedLanguage).toBe("fr");
    expect(en.resolvedLanguage).toBe("en");
  });

  test("le layout fournit les traductions à toutes les pages", () => {
    const layout = readFileSync("app/layout.tsx", "utf8");
    expect(layout).toContain("<I18nProvider language=");
    for (const file of ["src/next/NotFoundLanguage.tsx"]) {
      expect(readFileSync(file, "utf8")).not.toContain("I18nextProvider");
    }
  });
});

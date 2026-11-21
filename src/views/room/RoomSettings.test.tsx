import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { InfoTip } from "../../components/InfoTip";
import { createI18n } from "../../i18n";
import en from "../../i18n/locales/en.json";
import fr from "../../i18n/locales/fr.json";
import { BOT_LEVELS } from "../../rooms/bots";
import { DEFAULT_SETTINGS } from "../../rooms/settings";
import type { RoomState } from "./hooks/useRoom";
import { RoomSettings } from "./RoomSettings";

const render = (room: Partial<RoomState["room"]> = {}, language: "fr" | "en" = "fr") => {
  const state = { room: { ...DEFAULT_SETTINGS, ...room }, host: true, seats: [], role: "player", setRole: () => {}, update: () => {} } as unknown as RoomState;
  return renderToStaticMarkup(createElement(I18nextProvider, { i18n: createI18n(language) }, createElement(RoomSettings, { state, onEditText: () => {}, action: null })));
};

// The text editor tools describe themselves in the dialog, they are not notes
const TOOL_HELP = ["helpTypography", "helpControl", "helpLines", "helpOther"];
// React escapes the apostrophe in the HTML
const esc = (text: string) => text.replaceAll("'", "&#x27;");

describe("DES — aide des réglages en note dépliable", () => {
  test("le « i » est un bouton qui déplie une note, sans bulle data-tip", () => {
    const html = renderToStaticMarkup(createElement(InfoTip, { label: "Aide : Erreurs", controls: "help-mistakes", open: false, onToggle: () => {} }));
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="help-mistakes"');
    expect(html).toContain('aria-label="Aide : Erreurs"');
    expect(html).not.toContain("data-tip");
  });

  test("la note est fermée au départ et décrit le choix actif", () => {
    const html = render({ visibility: "semi" });
    expect(html).toMatch(/<p[^>]*id="help-label-visibility"[^>]*hidden/);
    expect(html).toContain(esc("Avec le code ou le lien d'invitation."));
  });

  test("la durée explique le choix fait : sans limite, ou arrêt au temps", () => {
    expect(render({ duration: null })).toContain(esc("Jusqu'à ce que tout le monde ait fini."));
    expect(render({ duration: 60 })).toContain(esc("S'arrête au temps, fini ou pas."));
  });

  test("pas de « i » quand le libellé suffit (rôle, langue, longueur)", () => {
    const html = render();
    for (const id of ["label-role", "label-language", "label-length"]) expect(html).not.toContain(`aria-controls="help-${id}"`);
  });

  test("chaque bot a la note de son propre niveau", () => {
    const html = render({ bots: true, botList: [{ name: "Wasabi99", level: "expert" }] }, "en");
    expect(html).toContain("70 to 100 WPM, 2 % mistakes.");
  });

  test("toutes les notes tiennent sur une ligne (44 caractères au plus), en français et en anglais", () => {
    for (const locale of [fr, en]) {
      const help = Object.entries(locale.room).filter(([key]) => key.startsWith("help") && !TOOL_HELP.includes(key));
      expect(help.length).toBeGreaterThan(0);
      for (const [key, text] of help) expect({ key, length: String(text).length }).toEqual({ key, length: Math.min(String(text).length, 44) });
    }
    expect(BOT_LEVELS.every((level) => `helpLevel_${level}` in fr.room && `helpLevel_${level}` in en.room)).toBe(true);
  });
});

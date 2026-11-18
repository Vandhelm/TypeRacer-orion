import { describe, expect, test } from "bun:test";
import en from "../../src/i18n/locales/en.json";
import fr from "../../src/i18n/locales/fr.json";
import { pageTitle } from "../../src/i18n/server";

const keys = (node: unknown, prefix = ""): string[] =>
  node && typeof node === "object"
    ? Object.entries(node).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k))
    : [prefix];

const lookup = (tree: unknown, path: string) => path.split(".").reduce<unknown>((n, p) => (n as Record<string, unknown> | undefined)?.[p], tree);

describe("I18N-01 — textes en français et en anglais", () => {
  test("fr.json et en.json ont exactement les mêmes clés", () => {
    expect(keys(fr).sort()).toEqual(keys(en).sort());
  });

  test("aucune valeur de traduction n'est vide", () => {
    expect(keys(fr).filter((k) => !lookup(fr, k))).toEqual([]);
    expect(keys(en).filter((k) => !lookup(en, k))).toEqual([]);
  });

  test("le titre de chaque page est traduit côté serveur", () => {
    for (const page of ["home", "room", "game", "podium", "profile"] as const) {
      expect(pageTitle("fr", page)).toStartWith("O.R.I.O.N");
      expect(pageTitle("en", page)).toStartWith("O.R.I.O.N");
      expect(pageTitle("fr", page)).not.toBe(pageTitle("en", page));
    }
    expect(pageTitle("en", "podium")).toBe("O.R.I.O.N — The podium");
    expect(pageTitle("fr", "podium")).toBe("O.R.I.O.N — Le podium");
  });
});

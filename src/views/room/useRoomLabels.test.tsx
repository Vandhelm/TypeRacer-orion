import { beforeAll, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import type { i18n as I18n } from "i18next";

let i18n: I18n;
let useRoomLabels: typeof import("./useRoomLabels").useRoomLabels;

beforeAll(async () => {
  i18n = (await import("../../i18n")).createI18n("fr");
  ({ useRoomLabels } = await import("./useRoomLabels"));
});

const labels = async (language: "fr" | "en") => {
  await i18n.changeLanguage(language);
  const room = { length: "other", wordCount: 1000, text: Array(1200).fill("mot").join(" ") } as Parameters<typeof useRoomLabels>[0];
  const Probe = () => {
    const l = useRoomLabels(room);
    return createElement("p", null, `${l.lengthLabel}|${l.words}`);
  };
  return renderToStaticMarkup(createElement(I18nextProvider, { i18n }, createElement(Probe))).replace(/[  ]/g, " ");
};

describe("I18N-03 — libellés de la salle", () => {
  test("le nombre de mots suit la langue", async () => {
    const fr = await labels("fr");
    expect(fr).toContain("1 000");
    expect(fr).toContain("1 200");
    const en = await labels("en");
    expect(en).toContain("1,000");
    expect(en).toContain("1,200");
  });
});

const durations = async (language: "fr" | "en", seconds: (number | null)[]) => {
  await i18n.changeLanguage(language);
  const room = { length: "short", wordCount: 50, text: "" } as Parameters<typeof useRoomLabels>[0];
  const Probe = () => {
    const l = useRoomLabels(room);
    return createElement("p", null, seconds.map((s) => l.durationLabel(s)).join("|"));
  };
  return renderToStaticMarkup(createElement(I18nextProvider, { i18n }, createElement(Probe)));
};

describe("CONF-01 — the maximum time label", () => {
  test("no limit reads « Aucun » in French and « None » in English", async () => {
    expect(await durations("fr", [null])).toContain("Aucun");
    expect(await durations("en", [null])).toContain("None");
  });

  test("a duration still reads in minutes or seconds", async () => {
    expect(await durations("en", [30, 600])).toContain("30 s|10 min");
  });
});

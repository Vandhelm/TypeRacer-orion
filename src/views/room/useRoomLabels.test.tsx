import { beforeAll, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import type { i18n as I18n } from "i18next";

let i18n: I18n;
let useRoomLabels: typeof import("./useRoomLabels").useRoomLabels;

beforeAll(async () => {
  (globalThis as { document?: unknown }).document ??= { documentElement: {}, cookie: "" };
  i18n = (await import("../../i18n")).default;
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

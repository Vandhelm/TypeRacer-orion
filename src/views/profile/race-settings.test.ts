import { describe, expect, test } from "bun:test";
import { translate } from "../../i18n/test-instance";
import type { RaceSummary } from "../podium/results";
import { raceSettingLabels } from "./race-settings";

const SUMMARY: RaceSummary = {
  textType: "words", language: "fr", duration: 60, level: "common", punctuation: true, numbers: false, specials: false, capitals: true, accents: true,
  excluded: "", mistakes: "fix", botSpeed: "medium", botAccuracy: "high", length: "short", wordCount: 20, sessionSeconds: 90,
};

describe("CONF-06 — the settings line of a race on the profile", () => {
  test("a race typed without capitals says so, in French and English", () => {
    expect(raceSettingLabels({ ...SUMMARY, capitals: false }, translate("fr"), "fr")).toContain("sans majuscules");
    expect(raceSettingLabels({ ...SUMMARY, capitals: false }, translate("en"), "en")).toContain("no capitals");
  });

  test("a race with capitals says nothing about them", () => {
    expect(raceSettingLabels(SUMMARY, translate("fr"), "fr").join(" ")).not.toContain("majuscules");
  });

  test("« no accents » is shown for a French race only", () => {
    expect(raceSettingLabels({ ...SUMMARY, accents: false }, translate("fr"), "fr")).toContain("sans accents");
    expect(raceSettingLabels({ ...SUMMARY, language: "en", accents: false }, translate("fr"), "fr")).not.toContain("sans accents");
  });

  test("CONF-07: a coherent race or a quote never shows punctuation, numbers, specials or excluded characters left on", () => {
    for (const textType of ["coherent", "quote"] as const) {
      for (const lang of ["fr", "en"] as const) {
        const t = translate(lang);
        const labels = raceSettingLabels({ ...SUMMARY, textType, punctuation: true, numbers: true, specials: true, excluded: "e" }, t, lang);
        expect(labels).not.toContain(t("profile.punctuation"));
        expect(labels).not.toContain(t("profile.numbers"));
        expect(labels).not.toContain(t("profile.specials"));
        expect(labels).not.toContain(t("profile.without", { chars: "e" }));
      }
    }
  });

  test("CONF-07: random words still show punctuation, numbers, specials and excluded characters", () => {
    const t = translate("fr");
    const labels = raceSettingLabels({ ...SUMMARY, punctuation: true, numbers: true, specials: true, excluded: "e" }, t, "fr");
    for (const key of ["profile.punctuation", "profile.numbers", "profile.specials"]) expect(labels).toContain(t(key));
    expect(labels).toContain(t("profile.without", { chars: "e" }));
  });

  test("CONF-07: a custom text is typed as written, so no composition option is shown", () => {
    const t = translate("fr");
    const labels = raceSettingLabels({ ...SUMMARY, textType: "custom", punctuation: true, numbers: true, specials: true, capitals: false, accents: false, excluded: "e" }, t, "fr");
    expect(labels).toEqual([t("profile.textTypes.custom"), t("profile.words", { words: "20" }), t("profile.seconds", { duration: "60" }), t("profile.languages.fr"), t("profile.mistakes.fix")]);
  });

  test("the other settings are still listed in order", () => {
    const t = translate("en");
    const labels = raceSettingLabels(SUMMARY, t, "en");
    expect(labels).toHaveLength(7);
    expect(labels[0]).toBe(t("profile.textTypes.words"));
    expect(labels[5]).toBe(t("profile.punctuation"));
    expect(labels[6]).toBe(t("profile.mistakes.fix"));
  });
});

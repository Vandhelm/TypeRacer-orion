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

  test("the other settings are still listed in order", () => {
    const t = translate("en");
    const labels = raceSettingLabels(SUMMARY, t, "en");
    expect(labels).toHaveLength(7);
    expect(labels[0]).toBe(t("profile.textTypes.words"));
    expect(labels[5]).toBe(t("profile.punctuation"));
    expect(labels[6]).toBe(t("profile.mistakes.fix"));
  });
});

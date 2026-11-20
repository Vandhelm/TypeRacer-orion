// Les réglages d'une course, en une ligne de libellés, pour la dernière course et l'historique du profil.
import type { TFunction } from "i18next";
import { formatNumber } from "../../i18n/format";
import type { RaceSummary } from "../podium/results";

export function raceSettingLabels(summary: RaceSummary, t: TFunction, language: string): string[] {
  return [
    t(`profile.textTypes.${summary.textType}`),
    t("profile.words", { words: formatNumber(language, summary.wordCount) }),
    // CONF-01 : une course sans temps maximal
    summary.duration === null ? t("profile.noTimeLimit") : t("profile.seconds", { duration: formatNumber(language, summary.duration) }),
    t(`profile.languages.${summary.language}`),
    summary.textType === "words" && t(`profile.levels.${summary.level}`),
    summary.punctuation && t("profile.punctuation"),
    summary.numbers && t("profile.numbers"),
    summary.specials && t("profile.specials"),
    // CONF-06 : seulement si elles étaient désactivées (un résultat d'avant l'option n'a pas le champ : il avait ses majuscules)
    summary.capitals === false && t("profile.noCapitals"),
    // CONF-06 : l'option accents ne concerne que le français
    summary.language === "fr" && !summary.accents && t("profile.noAccents"),
    summary.excluded && t("profile.without", { chars: summary.excluded }),
    t(`profile.mistakes.${summary.mistakes}`),
  ].filter((setting): setting is string => !!setting);
}

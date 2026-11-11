import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { oneDecimal, type PlayerResult, type RaceSummary } from "../podium/results";
import { StatBlock } from "./StatBlock";

const IDLE_ALERT = 50;

const clock = (seconds: number) =>
  [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map((n) => String(n).padStart(2, "0")).join(":");

/** The grid under the chart: what the race was, then the player's detailed numbers. */
export function ProfileDetails({ player, summary }: { player: PlayerResult; summary: RaceSummary }) {
  const { t, i18n } = useTranslation();

  const options = [
    summary.textType === "words" && t(`profile.levels.${summary.level}`),
    summary.punctuation && t("profile.punctuation"),
    summary.numbers && t("profile.numbers"),
    summary.specials && t("profile.specials"),
    !summary.accents && t("profile.noAccents"),
    summary.excluded && t("profile.without", { chars: summary.excluded }),
    t(`profile.mistakes.${summary.mistakes}`),
  ].filter(Boolean);
  const race = [
    `${t(`profile.textTypes.${summary.textType}`)} · ${t("profile.words", { words: summary.wordCount })}`,
    t("profile.timed", { duration: summary.duration, language: t(`profile.languages.${summary.language}`) }),
    options.join(" · "),
  ];
  const outcome = [t(player.eliminated ? "profile.out" : player.finished ? "profile.finished" : "profile.notFinished")];
  if (player.idle >= IDLE_ALERT) outcome.push(t("profile.idleDetected"));

  return (
    <div className="profile-grid">
      <StatBlock label={t("profile.testType")} lines={race} />
      <StatBlock label={t("profile.other")} lines={outcome} />
      <StatBlock label={t("profile.raw")} value={String(player.raw)} />
      <StatBlock label={t("profile.characters")} value={player.chars.map((count, i) => (
          <Fragment key={i}>{i > 0 && <span className="stat-sep">/</span>}{count}</Fragment>
        ))} notes={[t("profile.charsDetail")]} />
      <StatBlock label={t("profile.consistency")} value={`${player.consistency} %`} />
      <StatBlock
        label={t("profile.time")}
        value={`${player.seconds} s`}
        notes={[`${oneDecimal(i18n.language, player.idle)} % ${t("profile.idle")}`, `${clock(summary.sessionSeconds)} ${t("profile.session")}`]}
      />
    </div>
  );
}

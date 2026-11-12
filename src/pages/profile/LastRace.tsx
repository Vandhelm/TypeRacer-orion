import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { oneDecimal, type PlayerResult, type RaceSummary } from "../podium/results";
import { SpeedChart } from "./SpeedChart";
import { StatBlock, Swatch, Unit } from "./StatBlock";

const IDLE_ALERT = 50;
const NBSP = " ";

const clock = (seconds: number) =>
  [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map((n) => String(n).padStart(2, "0")).join(":");

/** Un réglage ne se coupe jamais en deux, et le « · » reste collé au réglage d'avant. */
const keep = (text: string) => text.replaceAll(" ", NBSP);

/** La dernière course : ses réglages en une ligne, puis ses chiffres et son graphique dans une seule carte. */
export function LastRace({ player, summary }: { player: PlayerResult; summary: RaceSummary }) {
  const { t, i18n } = useTranslation();

  const settings = [
    t(`profile.textTypes.${summary.textType}`),
    t("profile.words", { words: summary.wordCount }),
    t("profile.seconds", { duration: summary.duration }),
    t(`profile.languages.${summary.language}`),
    summary.textType === "words" && t(`profile.levels.${summary.level}`),
    summary.punctuation && t("profile.punctuation"),
    summary.numbers && t("profile.numbers"),
    summary.specials && t("profile.specials"),
    !summary.accents && t("profile.noAccents"),
    summary.excluded && t("profile.without", { chars: summary.excluded }),
    t(`profile.mistakes.${summary.mistakes}`),
  ].filter((setting): setting is string => !!setting);
  const outcome = [t(player.eliminated ? "profile.out" : player.finished ? "profile.finished" : "profile.notFinished")];
  if (player.idle >= IDLE_ALERT) outcome.push(t("profile.idleDetected"));

  const [, wrong, extra, missed] = player.chars;
  const errors = [
    [wrong, t("profile.wrong", { count: wrong })],
    [extra, t("profile.extra", { count: extra })],
    [missed, t("profile.missed", { count: missed })],
  ] as const;

  return (
    <section className="profile-section" aria-labelledby="last-race-title">
      <h2 id="last-race-title" className="profile-section-title">{t("profile.lastRace")}</h2>
      <p className="race-context">
        <span className="race-settings">
          {settings.map((setting, i) => (
            <Fragment key={i}>{i > 0 && <>{NBSP}<i>·</i> </>}{keep(setting)}</Fragment>
          ))}
        </span>
        <span className="race-meta">
          {outcome.map((line) => <span key={line} className="race-outcome">{line}</span>)}
          <span>{`${t("profile.session")} ${clock(summary.sessionSeconds)}`}</span>
        </span>
      </p>

      <div className="profile-card profile-card--race">
        <StatBlock hero marker={<Swatch series="wpm" />} label={t("game.wpm")} value={player.wpm} />
        <StatBlock hero label={t("profile.accuracy")} value={<>{player.accuracy}<Unit>%</Unit></>} />
        <StatBlock marker={<Swatch series="raw" />} label={t("profile.raw")} value={player.raw} />
        <StatBlock label={t("profile.consistency")} value={<>{player.consistency}<Unit>%</Unit></>} />
        <StatBlock
          label={t("profile.time")}
          value={<>{player.seconds}<Unit>s</Unit></>}
          notes={[`${oneDecimal(i18n.language, player.idle)} % ${t("profile.idle")}`]}
        />
        <StatBlock
          label={t("profile.correctChars")}
          value={player.chars[0]}
          notes={[
            <>
              <i className="chart-cross">×</i>{NBSP}
              {errors.map(([count, word], i) => (
                <Fragment key={i}>{i > 0 && `${NBSP}· `}<b className="stat-error">{count}</b>{NBSP}{keep(word)}</Fragment>
              ))}
            </>,
          ]}
        />
        <div className="card-chart"><SpeedChart player={player} /></div>
      </div>
    </section>
  );
}

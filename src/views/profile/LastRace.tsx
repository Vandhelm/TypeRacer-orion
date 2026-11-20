import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { formatNumber } from "../../i18n/format";
import { oneDecimal, type PlayerResult, type RaceSummary } from "../podium/results";
import { raceSettingLabels } from "./race-settings";
import { SpeedChart } from "./SpeedChart";
import { StatBlock, Swatch, Unit } from "./StatBlock";
import { CROSS, RACE_CARD, SECTION, SECTION_TITLE } from "./styles";

const IDLE_ALERT = 50;
const NBSP = " ";

const clock = (seconds: number) =>
  [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map((n) => String(n).padStart(2, "0")).join(":");

/** Un réglage ne se coupe jamais en deux, et le « · » reste collé au réglage d'avant. */
const keep = (text: string) => text.replaceAll(" ", NBSP);

/** La dernière course (ou une course de l'historique, HIST-02, avec son titre) : ses réglages en une ligne, puis ses chiffres et son graphique dans une seule carte. */
export function LastRace({ player, summary, title }: { player: PlayerResult; summary: RaceSummary; title?: string }) {
  const { t, i18n } = useTranslation();

  const settings = raceSettingLabels(summary, t, i18n.language);
  const outcome = [t(player.eliminated ? "profile.out" : player.finished ? "profile.finished" : "profile.notFinished")];
  if (player.idle >= IDLE_ALERT) outcome.push(t("profile.idleDetected"));

  const [, wrong, extra, missed] = player.chars;
  const errors = [
    [wrong, t("profile.wrong", { count: wrong })],
    [extra, t("profile.extra", { count: extra })],
    [missed, t("profile.missed", { count: missed })],
  ] as const;

  return (
    <section className={SECTION} aria-labelledby="last-race-title">
      <h2 id="last-race-title" className={SECTION_TITLE}>{title ?? t("profile.lastRace")}</h2>
      <p className="mb-4 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1.5 font-mono text-[max(12px,1.4vh)] leading-[1.6] font-normal text-muted">
        <span className="min-w-0 [&_i]:mr-[.5em] [&_i]:not-italic">
          {settings.map((setting, i) => (
            <Fragment key={i}>{i > 0 && <>{NBSP}<i>·</i> </>}{keep(setting)}</Fragment>
          ))}
        </span>
        <span className="flex flex-wrap gap-x-5 gap-y-1 whitespace-nowrap">
          {outcome.map((line) => <span key={line} className="text-white">{line}</span>)}
          <span>{`${t("profile.session")} ${clock(summary.sessionSeconds)}`}</span>
        </span>
      </p>

      <div className={RACE_CARD}>
        <StatBlock hero marker={<Swatch series="wpm" />} label={t("game.wpm")} value={formatNumber(i18n.language, player.wpm)} />
        <StatBlock hero label={t("profile.accuracy")} value={<>{formatNumber(i18n.language, player.accuracy)}<Unit>%</Unit></>} />
        <StatBlock marker={<Swatch series="raw" />} label={t("profile.raw")} value={formatNumber(i18n.language, player.raw)} />
        <StatBlock label={t("profile.consistency")} value={<>{formatNumber(i18n.language, player.consistency)}<Unit>%</Unit></>} />
        <StatBlock
          label={t("profile.time")}
          value={<>{formatNumber(i18n.language, player.seconds)}<Unit>s</Unit></>}
          notes={[`${oneDecimal(i18n.language, player.idle)} % ${t("profile.idle")}`]}
        />
        <StatBlock
          label={t("profile.correctChars")}
          value={formatNumber(i18n.language, player.chars[0])}
          notes={[
            <>
              <i className={CROSS}>×</i>{NBSP}
              {errors.map(([count, word], i) => (
                <Fragment key={i}>{i > 0 && `${NBSP}· `}<b className="font-normal text-red-text">{formatNumber(i18n.language, count)}</b>{NBSP}{keep(word)}</Fragment>
              ))}
            </>,
          ]}
        />
        <div className="card-chart"><SpeedChart player={player} /></div>
      </div>
    </section>
  );
}

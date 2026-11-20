import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { formatNumber } from "../../i18n/format";
import { BotTag } from "../../players/BotTag";
import type { PersonalRecord } from "../../players/records";
import { WORDS_CHANGED } from "../../rooms/bonus-effects";
import { errorCount, isMeasured, playerStatus, type PlayerStatus, type ReceivedBonuses } from "./board";
import { RecordBadge } from "./RecordBadge";
import { profileHref, rankLabel, type PlayerResult } from "./results";

// The board under the podium, with blueprint-style corner marks (keyframe podium-board-arrive in styles/pages/podium/board.css).
const BOARD =
  "fixed top-[72vh] bottom-[max(12px,2vh)] left-1/2 z-10 flex w-[min(1040px,calc(100vw-32px))] flex-col gap-1.5 border border-line bg-black px-4 py-3 text-white [transform:translateX(-50%)] " +
  "motion-reduce:animate-none phone:px-3 phone:py-2.5 " +
  "before:pointer-events-none before:absolute before:-top-[7px] before:-left-[7px] before:size-4 before:border-t before:border-l before:border-white " +
  "after:pointer-events-none after:absolute after:-right-[7px] after:-bottom-[7px] after:size-4 after:border-r after:border-b after:border-white";
// RES-02 : a real table. At 360 px it scrolls inside the board (never the page), rank and name staying in view.
const SCROLL = "min-h-0 flex-[1_1_auto] overflow-auto overscroll-contain phone:pr-2";
const TABLE = "w-full min-w-[760px] border-separate border-spacing-0 font-mono text-[max(12px,1.4vh)] leading-[1.2] tracking-[.04em]";
const CELL = "h-[30px] border-b border-b-line-faint [border-bottom-style:dashed] px-2 whitespace-nowrap";
const HEAD = "sticky top-0 z-[1] h-[26px] border-b border-b-line-soft bg-black px-2 text-left text-[.8em] font-normal tracking-[.12em] whitespace-nowrap text-muted uppercase";
const NUMBER = "text-right tabular-nums";
// rank and name stick to the left while the other columns scroll under them
const STICKY_RANK = "sticky left-0 z-[1] w-[3.4em] min-w-[3.4em] bg-black";
const STICKY_NAME = "sticky left-[3.4em] z-[1] w-[13em] max-w-[13em] bg-black";
const TAG = "inline-block border border-line-soft px-1.5 py-px text-[.85em] tracking-[.12em] uppercase";
const STATUS_TONE: Record<PlayerStatus, string> = { finished: "text-white", timeout: "text-muted", abandoned: "text-muted", eliminated: "text-muted" };

/** « — » on screen, a word for a screen reader: a value nobody measured (another human live, a bonus not kept). */
function Unknown() {
  const { t } = useTranslation();
  return (
    <>
      <span aria-hidden="true">—</span>
      <span className="sr-only">{t("podium.table.unknown")}</span>
    </>
  );
}

function BonusCell({ bonuses }: { bonuses?: ReceivedBonuses }) {
  const { t, i18n } = useTranslation();
  if (!bonuses) return <Unknown />;
  const kinds = bonuses.kinds.map((kind) => t(`game.bonus.badge.${kind}`, { count: WORDS_CHANGED })).join(", ");
  return <>{kinds ? `${formatNumber(i18n.language, bonuses.count)} · ${kinds}` : formatNumber(i18n.language, bonuses.count)}</>;
}

/** Every player in final order, with the local player's place when the results come from a real race. */
/** charts : RES-03, the button that opens the race charts, at the end of the header. */
/** record : RES-04, the personal record beaten by the local player in this race, if any. */
export function PodiumBoard({ players, showPlace, arrived, raceId = null, charts, record = null }: { players: PlayerResult[]; showPlace: boolean; arrived: boolean; raceId?: number | null; charts?: ReactNode; record?: PersonalRecord | null }) {
  const { t, i18n } = useTranslation();
  const me = showPlace ? players.find((player) => player.me) : undefined;
  const wpm = t("game.wpm");

  return (
    <section className={arrived ? BOARD : `${BOARD} animate-[podium-board-arrive_.6s_2.7s_cubic-bezier(.2,.8,.2,1)_both]`} aria-labelledby="podium-board-title">
      <header className="flex flex-none flex-wrap items-baseline justify-between gap-x-5 gap-y-1 border-b border-b-line-soft [border-bottom-style:dashed] pb-2">
        <h2 id="podium-board-title" className="font-mono text-[max(11px,1.3vh)] leading-[1.4] font-normal tracking-[.16em] uppercase">{t("podium.allPlayers", { count: players.length })}</h2>
        <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-1.5 phone:justify-start">
          {me && (
            <p className="text-right font-mono text-[max(11px,1.3vh)] leading-[1.4] font-normal tracking-[.1em] text-muted uppercase phone:text-left phone:text-[10px] phone:tracking-[.04em]">
              {t("podium.yourPlace")} · <b className="font-medium text-white">{rankLabel(t, me.rank)}</b> · {formatNumber(i18n.language, me.wpm)} {wpm} · {formatNumber(i18n.language, me.accuracy)} % · {formatNumber(i18n.language, me.seconds)} s
            </p>
          )}
          {record && <RecordBadge record={record} />}
          {charts}
        </div>
      </header>
      <div className={SCROLL}>
        <table className={TABLE}>
          <caption className="sr-only">{t("podium.table.caption")}</caption>
          <thead>
            <tr>
              <th scope="col" className={`${HEAD} ${STICKY_RANK} z-[2]`}>{t("podium.table.rank")}</th>
              <th scope="col" className={`${HEAD} ${STICKY_NAME} z-[2]`}>{t("podium.table.player")}</th>
              <th scope="col" className={`${HEAD} ${NUMBER}`}>{t("podium.table.wpm")}</th>
              <th scope="col" className={`${HEAD} ${NUMBER}`}>{t("podium.table.raw")}</th>
              <th scope="col" className={`${HEAD} ${NUMBER}`}>{t("podium.table.accuracy")}</th>
              <th scope="col" className={`${HEAD} ${NUMBER}`}>{t("podium.table.errors")}</th>
              <th scope="col" className={`${HEAD} ${NUMBER}`}>{t("podium.table.time")}</th>
              <th scope="col" className={HEAD}>{t("podium.table.status")}</th>
              <th scope="col" className={HEAD}>{t("podium.table.bonuses")}</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player, index) => {
              const status = playerStatus(player);
              const measured = isMeasured(player);
              return (
                <tr key={player.name} className={`hover:bg-[rgba(255,255,255,.08)] ${player.me ? "font-medium text-white" : "font-normal text-[rgba(255,255,255,.7)]"}`}>
                  <td className={`${CELL} ${STICKY_RANK}`}>{rankLabel(t, player.rank)}</td>
                  <th scope="row" className={`${CELL} ${STICKY_NAME} text-left font-[inherit]`}>
                    {/* BOT-04 : le marqueur bot reste hors du nom tronqué */}
                    <a className="flex min-w-0 items-center gap-2 text-inherit no-underline hover:text-white focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-white" href={profileHref(index, raceId)}><span className="truncate">{player.me ? `${player.name} · ${t("room.you")}` : player.name}</span>{player.bot && <BotTag className="text-[.8em]" />}</a>
                  </th>
                  <td className={`${CELL} ${NUMBER}`}>{formatNumber(i18n.language, player.wpm)}</td>
                  <td className={`${CELL} ${NUMBER}`}>{measured ? formatNumber(i18n.language, player.raw) : <Unknown />}</td>
                  <td className={`${CELL} ${NUMBER}`}>{measured ? `${formatNumber(i18n.language, player.accuracy)} %` : <Unknown />}</td>
                  <td className={`${CELL} ${NUMBER}`}>{measured ? formatNumber(i18n.language, errorCount(player)) : <Unknown />}</td>
                  <td className={`${CELL} ${NUMBER}`}>{t("podium.table.seconds", { value: formatNumber(i18n.language, player.seconds) })}</td>
                  <td className={CELL}><span className={`${TAG} ${STATUS_TONE[status]}`}>{t(`podium.status.${status}`)}</span></td>
                  <td className={CELL}><BonusCell bonuses={player.bonuses} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

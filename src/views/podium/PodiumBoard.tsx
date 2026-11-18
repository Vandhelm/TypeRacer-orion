import { useTranslation } from "react-i18next";
import { profileHref, type PlayerResult } from "./results";

// The board under the podium, with blueprint-style corner marks (keyframe podium-board-arrive in styles/pages/podium/board.css).
const BOARD =
  "fixed top-[72vh] bottom-[max(12px,2vh)] left-1/2 z-10 flex w-[min(1040px,calc(100vw-32px))] flex-col gap-1.5 border border-line bg-black px-4 py-3 text-white [transform:translateX(-50%)] " +
  "motion-reduce:animate-none phone:px-3 phone:py-2.5 " +
  "before:pointer-events-none before:absolute before:-top-[7px] before:-left-[7px] before:size-4 before:border-t before:border-l before:border-white " +
  "after:pointer-events-none after:absolute after:-right-[7px] after:-bottom-[7px] after:size-4 after:border-r after:border-b after:border-white";
const ROW =
  "box-border grid min-h-[34px] w-full grid-cols-[3.4em_minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-b-line-faint [border-bottom-style:dashed] px-0.5 " +
  "font-mono text-[max(12px,1.4vh)] leading-[1.2] tracking-[.04em] no-underline hover:bg-[rgba(255,255,255,.08)] hover:text-white " +
  "focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-white";
const VALUE = "text-[.9em] whitespace-nowrap text-muted";

/** Every player in final order, with the local player's place when the results come from a real race. */
export function PodiumBoard({ players, showPlace, arrived }: { players: PlayerResult[]; showPlace: boolean; arrived: boolean }) {
  const { t } = useTranslation();
  const place = showPlace ? players.findIndex((player) => player.me) : -1;
  const me = players[place];
  const wpm = t("game.wpm");

  return (
    <section className={arrived ? BOARD : `${BOARD} animate-[podium-board-arrive_.6s_2.7s_cubic-bezier(.2,.8,.2,1)_both]`} aria-labelledby="podium-board-title">
      <header className="flex flex-none flex-wrap items-baseline justify-between gap-x-5 gap-y-1 border-b border-b-line-soft [border-bottom-style:dashed] pb-2">
        <h2 id="podium-board-title" className="font-mono text-[max(11px,1.3vh)] leading-[1.4] font-normal tracking-[.16em] uppercase">{t("podium.allPlayers", { count: players.length })}</h2>
        {me && (
          <p className="text-right font-mono text-[max(11px,1.3vh)] leading-[1.4] font-normal tracking-[.1em] text-muted uppercase phone:text-left phone:text-[10px] phone:tracking-[.04em]">
            {t("podium.yourPlace")} · <b className="font-medium text-white">{t(`podium.ranks.${place}`)}</b> · {me.wpm} {wpm} · {me.accuracy} % · {me.seconds} s
          </p>
        )}
      </header>
      <ol className="min-h-0 flex-[1_1_auto] list-none overflow-y-auto phone:pr-2 min-[900px]:grid min-[900px]:auto-cols-[minmax(0,1fr)] min-[900px]:grid-flow-col min-[900px]:grid-rows-[repeat(4,34px)] min-[900px]:gap-x-8">
        {players.map((player, index) => (
          <li key={player.name}>
            <a className={`${ROW} ${player.me ? "font-medium text-white" : "font-normal text-[rgba(255,255,255,.7)]"}`} href={profileHref(index)}>
              <span>{t(`podium.ranks.${index}`)}</span>
              <span className="truncate">{player.me ? `${player.name} · ${t("room.you")}` : player.name}</span>
              <span className={VALUE}>{player.wpm} {wpm}</span>
              <span className={VALUE}>{player.accuracy} %</span>
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}

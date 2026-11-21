// RES-03 : les graphiques des résultats d'une course, dans une boîte ouverte depuis le tableau du podium. La vitesse de
// chaque participant (humains et bots) sur un même graphique, puis la carte des touches ratées par le joueur pendant
// cette course. Les composants viennent du profil (SeriesChart, KeyboardHeatmap). <dialog> natif : le focus reste dans
// la boîte, Échap la ferme, et le focus revient sur le bouton.
import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useKeyboardLayout } from "../profile/hooks/useKeyboardLayout";
import { KeyboardHeatmap } from "../profile/KeyboardHeatmap";
import { SeriesChart } from "../profile/SpeedChart";
import { raceKeys, raceLines } from "./race-charts";
import type { PlayerResult } from "./results";

const TRIGGER =
  "unset box-border inline-flex min-h-[28px] cursor-pointer items-center border border-line px-3 font-mono text-[max(10px,1.1vh)] leading-none font-medium tracking-[.2em] text-white uppercase " +
  "transition-[background,color] duration-200 hover:bg-[#f2f2f2] hover:text-black focus-visible:outline focus-visible:outline-offset-4 focus-visible:outline-white";
// Same frame as the board: black, a thin line, blueprint corners
const DIALOG =
  "m-auto box-border max-h-[calc(100dvh-32px)] w-[min(1040px,calc(100vw-32px))] max-w-none overflow-y-auto border border-line bg-black p-[clamp(16px,3vh,28px)] text-white " +
  "backdrop:bg-[rgba(0,0,0,.82)] phone:p-3";
const SUBTITLE =
  "mb-[14px] flex items-center gap-2.5 font-mono text-[max(11px,1.3vh)] leading-[1.2] font-normal tracking-[.2em] text-white uppercase before:h-[1.1em] before:w-[3px] before:bg-red-text";
const NOTE = "mt-3 font-mono text-[max(12px,1.4vh)] leading-[1.6] font-normal text-muted";
const PANEL = "border border-line-faint bg-face-front-a p-[clamp(14px,2vh,20px)] phone:border-0 phone:bg-transparent phone:px-0";

export function RaceCharts({ players }: { players: PlayerResult[] }) {
  const { t } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [layout, setLayout] = useKeyboardLayout();
  const { lines, missing } = useMemo(() => raceLines(players), [players]);
  const keys = useMemo(() => raceKeys(players), [players]);

  return (
    <>
      <button ref={trigger} type="button" className={TRIGGER} aria-haspopup="dialog" aria-controls="podium-charts" onClick={() => dialog.current?.showModal()}>
        {t("podium.charts.open")}
      </button>
      <dialog
        ref={dialog}
        id="podium-charts"
        className={DIALOG}
        aria-labelledby="podium-charts-title"
        onClose={() => trigger.current?.focus()}
        // un clic sur le fond (hors de la boîte) la ferme
        onClick={(event) => event.target === event.currentTarget && event.currentTarget.close()}
      >
        <header className="mb-5 flex items-center justify-between gap-4 border-b border-b-line-soft [border-bottom-style:dashed] pb-3">
          <h2 id="podium-charts-title" className="font-mono text-[max(11px,1.3vh)] leading-[1.4] font-normal tracking-[.16em] uppercase">{t("podium.charts.title")}</h2>
          <button type="button" className={TRIGGER} onClick={() => dialog.current?.close()}>{t("podium.charts.close")}</button>
        </header>

        <section aria-labelledby="podium-charts-speed">
          <h3 id="podium-charts-speed" className={SUBTITLE}>{t("podium.charts.speedTitle")}</h3>
          <div className={PANEL}>
            <SeriesChart lines={lines} label={t("podium.charts.speedLabel")} />
          </div>
          {missing.length > 0 && <p className={NOTE}>{t("podium.charts.noSeries", { names: missing.join(", ") })}</p>}
        </section>

        <div className="mt-[clamp(24px,4vh,40px)]">
          {keys ? (
            <div className={`${PANEL} flex flex-col`}>
              <KeyboardHeatmap keys={keys} layout={layout} onLayout={setLayout} title={t("podium.charts.keysTitle")} empty={t("podium.charts.keysNone")} />
            </div>
          ) : (
            <p className={NOTE}>{t("podium.charts.noKeys")}</p>
          )}
        </div>
      </dialog>
    </>
  );
}

import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { formatNumber } from "../../i18n/format";
import { BotTag } from "../../players/BotTag";
import type { PlayerResult } from "../podium/results";
import { buildSeriesChart, type ChartLine } from "./chart";
import { useChartSize } from "./hooks/useChartSize";
import { LineSwatch } from "./StatBlock";
import { CHART, CROSS, CURSOR, DASH, DOT, ERROR_MARK, GRID_LINE, LEGEND, LINE, PLOT, TIP } from "./styles";

const TIP_MARGIN = 12;
// DES-05 : a line's mark (its rank on the race chart), in the legend and at the end of the line, so that a line is
// found again without its colour; written inside the plot, left of the last point
const MARK = "mr-1.5 inline-block min-w-[1.5em] border border-line-soft px-[.3em] text-center leading-[1.3] tabular-nums";
const MARK_TEXT = "fill-white font-mono text-[10px] [paint-order:stroke] stroke-black stroke-[3px]";

/** The profile chart: the player's speed and raw speed per second, with their errors. */
export function SpeedChart({ player }: { player: PlayerResult }) {
  const { t } = useTranslation();
  const lines: ChartLine[] = [
    { key: "wpm", label: t("game.wpm"), values: player.wpmSeries, line: LINE.wpm, dot: DOT.wpm, dash: DASH.wpm },
    { key: "raw", label: t("profile.raw"), values: player.rawSeries, line: LINE.raw, dot: DOT.raw, dash: DASH.raw },
  ];
  return <SeriesChart lines={lines} errors={player.errorSeries} label={`${t("game.wpm")} / ${t("profile.second")}`} />;
}

type SeriesProps = { lines: ChartLine[]; errors?: number[]; label: string };

/**
 * RES-03 : speed lines per second on one scale (one player on the profile, every participant on the podium), with a
 * tooltip on hover and an equivalent table for screen readers. The first line is drawn on top.
 */
export function SeriesChart({ lines, errors, label }: SeriesProps) {
  const { t, i18n } = useTranslation();
  const root = useRef<HTMLDivElement>(null);
  const plot = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const size = useChartSize(plot);
  const chart = useMemo(() => buildSeriesChart(lines.map((line) => line.values), size.width, size.plot), [lines, size]);
  const [hover, setHover] = useState<number | null>(null);
  const labels = { wpm: t("game.wpm"), errors: t("profile.errors"), second: t("profile.second") };
  const drawn = [...lines].reverse();
  const value = (values: number[], i: number) => (i < values.length ? formatNumber(i18n.language, values[i]!) : "—");
  const nameOf = (line: ChartLine) => <>{line.label}{line.bot && <BotTag className="ml-1.5 text-[.8em]" />}</>;
  const markOf = (line: ChartLine) => line.mark && <b data-part="mark" aria-hidden="true" className={MARK}>{line.mark}</b>;

  const onPointer = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (chart.count) setHover(chart.indexAt(((event.clientX - box.left) * size.width) / box.width));
  };

  useLayoutEffect(() => {
    if (hover === null || !root.current || !tip.current || !plot.current) return;
    const area = root.current.getBoundingClientRect();
    const box = plot.current.getBoundingClientRect();
    const left = (chart.x(hover) * box.width) / size.width + box.left - area.left;
    const width = tip.current.offsetWidth;
    tip.current.style.left = `${left + width + 20 > area.width ? left - width - TIP_MARGIN : left + TIP_MARGIN}px`;
    tip.current.style.top = `${box.top - area.top + TIP_MARGIN}px`;
  }, [hover, chart, size.width]);

  return (
    <div ref={root} className={CHART}>
      <div className={LEGEND}>
        {lines.map((line) => <span key={line.key}><LineSwatch line={line.line} dash={line.dash} />{markOf(line)}{nameOf(line)}</span>)}
        {errors && <span><i className={CROSS}>×</i>{labels.errors}</span>}
      </div>

      <div ref={plot} className={PLOT} onPointerMove={onPointer} onPointerDown={onPointer} onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${size.width} ${chart.height}`} height={chart.height} role="img" aria-label={label}>
          {chart.speedTicks.map((tick) => (
            <g key={tick}>
              <line className={GRID_LINE(tick)} x1={chart.left} x2={chart.right} y1={chart.y(tick)} y2={chart.y(tick)} />
              <text x={chart.left - 8} y={chart.y(tick) + 4} textAnchor="end">{tick}</text>
            </g>
          ))}
          {chart.timeTicks.map((i) => <text key={i} x={chart.x(i)} y={chart.height - 8} textAnchor="middle">{i + 1}</text>)}
          <text x={chart.left} y={chart.axisLabel}>{labels.wpm}</text>
          {errors?.map((count, i) => count > 0 && <text key={i} className={ERROR_MARK} x={chart.x(i)} y={chart.bandCenter + 5} textAnchor="middle">×</text>)}
          {chart.count > 1
            ? drawn.map((line) => <path key={line.key} className={line.line} d={chart.path(line.values)} strokeDasharray={line.dash} />)
            : chart.count === 1 && drawn.map((line) => line.values.length > 0 && <circle key={line.key} className={line.dot} cx={chart.x(0)} cy={chart.y(line.values[0]!)} r={4} />)}
          {drawn.map((line) => line.mark && line.values.length > 0 && (
            <text key={line.key} data-part="mark" className={MARK_TEXT} x={chart.x(line.values.length - 1) - 6} y={chart.y(line.values.at(-1)!) - 7} textAnchor="end">{line.mark}</text>
          ))}
          {hover !== null && (
            <g>
              <line className={CURSOR} x1={chart.x(hover)} x2={chart.x(hover)} y1={chart.top} y2={chart.cursorBottom} />
              {drawn.map((line) => hover < line.values.length && <circle key={line.key} className={line.dot} cx={chart.x(hover)} cy={chart.y(line.values[hover]!)} r={4} />)}
            </g>
          )}
        </svg>
      </div>

      {hover !== null && (
        <div ref={tip} className={TIP}>
          <p><span>{labels.second}</span>{hover + 1}</p>
          {lines.map((line) => <p key={line.key}><span>{line.label}</span>{value(line.values, hover)}</p>)}
          {errors && <p><span>{labels.errors}</span>{value(errors, hover)}</p>}
        </div>
      )}

      {/* RES-03 : un tableau ignore width: 1px, d'où un conteneur sr-only qui le masque sans élargir la boîte */}
      <div className="sr-only">
        <table>
          <caption>{label}</caption>
          <thead><tr><th>{labels.second}</th>{lines.map((line) => <th key={line.key}>{nameOf(line)}</th>)}{errors && <th>{labels.errors}</th>}</tr></thead>
          <tbody>
            {Array.from({ length: chart.count }, (_, i) => (
              <tr key={i}><td>{i + 1}</td>{lines.map((line) => <td key={line.key}>{value(line.values, i)}</td>)}{errors && <td>{value(errors, i)}</td>}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

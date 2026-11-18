import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import type { PlayerResult } from "../podium/results";
import { buildChart } from "./chart";
import { useChartSize } from "./hooks/useChartSize";
import { CHART, CROSS, CURSOR, DOT, ERROR_MARK, GRID_LINE, LEGEND, LINE, PLOT, SWATCH, TIP } from "./styles";

const TIP_MARGIN = 12;

/** Speed per second, with a tooltip on hover and an equivalent table for screen readers. */
export function SpeedChart({ player }: { player: PlayerResult }) {
  const { t } = useTranslation();
  const { wpmSeries: wpm, rawSeries: raw, errorSeries: errors } = player;
  const root = useRef<HTMLDivElement>(null);
  const plot = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const size = useChartSize(plot);
  const chart = useMemo(() => buildChart(wpm, raw, size.width, size.plot), [wpm, raw, size]);
  const [hover, setHover] = useState<number | null>(null);
  const labels = { wpm: t("game.wpm"), raw: t("profile.raw"), errors: t("profile.errors"), second: t("profile.second") };

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
        <span><i className={SWATCH.wpm} />{labels.wpm}</span>
        <span><i className={SWATCH.raw} />{labels.raw}</span>
        <span><i className={CROSS}>×</i>{labels.errors}</span>
      </div>

      <div ref={plot} className={PLOT} onPointerMove={onPointer} onPointerDown={onPointer} onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${size.width} ${chart.height}`} height={chart.height} role="img" aria-label={`${labels.wpm} / ${labels.second}`}>
          {chart.speedTicks.map((value) => (
            <g key={value}>
              <line className={GRID_LINE(value)} x1={chart.left} x2={chart.right} y1={chart.y(value)} y2={chart.y(value)} />
              <text x={chart.left - 8} y={chart.y(value) + 4} textAnchor="end">{value}</text>
            </g>
          ))}
          {chart.timeTicks.map((i) => <text key={i} x={chart.x(i)} y={chart.height - 8} textAnchor="middle">{i + 1}</text>)}
          <text x={chart.left} y={chart.axisLabel}>{labels.wpm}</text>
          {errors.map((count, i) => count > 0 && <text key={i} className={ERROR_MARK} x={chart.x(i)} y={chart.bandCenter + 5} textAnchor="middle">×</text>)}
          {chart.count > 1 ? (
            <>
              <path className={LINE.raw} d={chart.path(raw)} />
              <path className={LINE.wpm} d={chart.path(wpm)} />
            </>
          ) : (
            chart.count === 1 && <circle className="fill-red-text" cx={chart.x(0)} cy={chart.y(wpm[0]!)} r={4} />
          )}
          {hover !== null && (
            <g>
              <line className={CURSOR} x1={chart.x(hover)} x2={chart.x(hover)} y1={chart.top} y2={chart.cursorBottom} />
              <circle className={DOT.raw} cx={chart.x(hover)} cy={chart.y(raw[hover]!)} r={4} />
              <circle className={DOT.wpm} cx={chart.x(hover)} cy={chart.y(wpm[hover]!)} r={4} />
            </g>
          )}
        </svg>
      </div>

      {hover !== null && (
        <div ref={tip} className={TIP}>
          <p><span>{labels.second}</span>{hover + 1}</p>
          <p><span>{labels.wpm}</span>{wpm[hover]}</p>
          <p><span>{labels.raw}</span>{raw[hover]}</p>
          <p><span>{labels.errors}</span>{errors[hover]}</p>
        </div>
      )}

      <table className="sr-only">
        <thead><tr><th>{labels.second}</th><th>{labels.wpm}</th><th>{labels.raw}</th><th>{labels.errors}</th></tr></thead>
        <tbody>{wpm.map((value, i) => <tr key={i}><td>{i + 1}</td><td>{value}</td><td>{raw[i]}</td><td>{errors[i]}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

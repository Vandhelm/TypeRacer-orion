import { useMemo, useRef, useState, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { buildChart } from "./chart";
import { useChartSize } from "./hooks/useChartSize";
import type { ProgressPoint } from "./stats";

/** MPM course après course, de la plus ancienne à la plus récente, avec un tableau équivalent pour les lecteurs d'écran. */
export function ProgressChart({ progress }: { progress: ProgressPoint[] }) {
  const { t, i18n } = useTranslation();
  const plot = useRef<HTMLDivElement>(null);
  const size = useChartSize(plot);
  const wpm = useMemo(() => progress.map((point) => point.wpm), [progress]);
  const chart = useMemo(() => buildChart(wpm, [], size.width, size.plot), [wpm, size]);
  const [hover, setHover] = useState<number | null>(null);
  const date = (at: string) => new Intl.DateTimeFormat(i18n.language === "en" ? "en-CA" : "fr-CA", { dateStyle: "medium" }).format(new Date(at));
  const labels = { race: t("profile.race"), wpm: t("game.wpm"), accuracy: t("profile.accuracy"), date: t("profile.date") };

  const onPointer = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (chart.count) setHover(chart.indexAt(((event.clientX - box.left) * size.width) / box.width));
  };
  const point = hover === null ? null : progress[hover];

  return (
    <div className="chart">
      <div className="chart-legend">
        <span><i className="chart-swatch chart-swatch--wpm" />{t("profile.progress")}</span>
        {point && <span>{`${labels.race} ${hover! + 1} · ${date(point.at)} · ${point.wpm} ${labels.wpm} · ${point.accuracy} %`}</span>}
      </div>
      <div ref={plot} className="chart-plot" onPointerMove={onPointer} onPointerDown={onPointer} onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${size.width} ${chart.height}`} height={chart.height} role="img" aria-label={t("profile.progress")}>
          {chart.speedTicks.map((value) => (
            <g key={value}>
              <line className={value ? "chart-grid" : "chart-grid is-zero"} x1={chart.left} x2={chart.right} y1={chart.y(value)} y2={chart.y(value)} />
              <text x={chart.left - 8} y={chart.y(value) + 4} textAnchor="end">{value}</text>
            </g>
          ))}
          {chart.timeTicks.map((i) => <text key={i} x={chart.x(i)} y={chart.height - 8} textAnchor="middle">{i + 1}</text>)}
          <text x={chart.left} y={10}>{labels.wpm}</text>
          {chart.count > 1 ? (
            <path className="chart-line chart-line--wpm" d={chart.path(wpm)} />
          ) : (
            chart.count === 1 && <circle className="chart-dot--wpm" cx={chart.x(0)} cy={chart.y(wpm[0]!)} r={4} />
          )}
          {hover !== null && (
            <g>
              <line className="chart-cursor" x1={chart.x(hover)} x2={chart.x(hover)} y1={chart.top} y2={chart.bandTop} />
              <circle className="chart-dot chart-dot--wpm" cx={chart.x(hover)} cy={chart.y(wpm[hover]!)} r={4} />
            </g>
          )}
        </svg>
      </div>
      <table className="sr-only">
        <thead><tr><th>{labels.race}</th><th>{labels.date}</th><th>{labels.wpm}</th><th>{labels.accuracy}</th></tr></thead>
        <tbody>{progress.map((p, i) => <tr key={i}><td>{i + 1}</td><td>{date(p.at)}</td><td>{p.wpm}</td><td>{p.accuracy} %</td></tr>)}</tbody>
      </table>
    </div>
  );
}

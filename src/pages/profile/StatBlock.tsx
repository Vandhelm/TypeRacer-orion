import type { ReactNode } from "react";

type Props = { label: string; marker?: ReactNode; value: ReactNode; notes?: ReactNode[]; hero?: boolean };

/** One statistic: a label (with the marker of its chart line), then its value and small notes. */
export function StatBlock({ label, marker, value, notes = [], hero = false }: Props) {
  return (
    <div className={hero ? "stat stat--hero" : "stat"}>
      <span className="stat-label">{marker}{label}</span>
      <span className="stat-value">{value}</span>
      {notes.map((note, i) => <span key={i} className="stat-note">{note}</span>)}
    </div>
  );
}

/** A unit kept on the number, smaller: 96 %, 42 s. */
export const Unit = ({ children }: { children: string }) => <span className="stat-unit">{children}</span>;

/** The marker of a chart line, repeated before the number it draws. */
export const Swatch = ({ series }: { series: "wpm" | "raw" }) => <i className={`chart-swatch chart-swatch--${series}`} />;

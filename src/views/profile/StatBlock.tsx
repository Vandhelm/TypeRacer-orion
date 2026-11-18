import type { ReactNode } from "react";
import { STAT_LABEL, SWATCH } from "./styles";

type Props = { label: string; marker?: ReactNode; value: ReactNode; notes?: ReactNode[]; hero?: boolean };

/** One statistic: a label (with the marker of its chart line), then its value and small notes. */
export function StatBlock({ label, marker, value, notes = [], hero = false }: Props) {
  return (
    <div className={hero ? "stat stat--hero" : "stat"}>
      <span className={STAT_LABEL}>{marker}{label}</span>
      <span className={`mt-2 block font-light whitespace-nowrap tabular-nums ${hero ? "text-[clamp(36px,6vh,56px)] leading-none" : "text-[clamp(22px,3.4vh,32px)] leading-[1.1]"}`}>{value}</span>
      {notes.map((note, i) => <span key={i} className="mt-1.5 block font-mono text-[max(11px,1.2vh)] leading-[1.5] font-normal text-muted [&_.chart-cross]:mr-[.2em]">{note}</span>)}
    </div>
  );
}

/** A unit kept on the number, smaller: 96 %, 42 s. */
export const Unit = ({ children }: { children: string }) => <span className="ml-[.12em] text-[.5em] text-muted">{children}</span>;

/** The marker of a chart line, repeated before the number it draws. */
export const Swatch = ({ series }: { series: "wpm" | "raw" }) => <i className={SWATCH[series]} />;

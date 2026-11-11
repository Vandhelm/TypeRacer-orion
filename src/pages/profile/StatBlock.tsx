import type { ReactNode } from "react";

type Props = { label: string; value?: ReactNode; lines?: string[]; notes?: string[]; className?: string };

/** One statistic: a label, then its value, text lines and small notes. */
export function StatBlock({ label, value, lines = [], notes = [], className = "stat" }: Props) {
  return (
    <div className={className}>
      <span className="stat-label">{label}</span>
      {value !== undefined && <span className="stat-value">{value}</span>}
      {lines.map((line) => <span key={line} className="stat-text">{line}</span>)}
      {notes.map((note) => <span key={note} className="stat-note">{note}</span>)}
    </div>
  );
}

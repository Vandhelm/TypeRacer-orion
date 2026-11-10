type Props = { label: string; value?: string; lines?: string[]; notes?: string[] };

/** One statistic: a label, then its value, text lines and small notes. */
export function StatBlock({ label, value, lines = [], notes = [] }: Props) {
  return (
    <div>
      <span className="stat-label">{label}</span>
      {value !== undefined && <span className="stat-value">{value}</span>}
      {lines.map((line) => <span key={line} className="stat-text">{line}</span>)}
      {notes.map((note) => <span key={note} className="stat-note">{note}</span>)}
    </div>
  );
}

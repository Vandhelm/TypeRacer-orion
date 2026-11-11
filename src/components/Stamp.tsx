/** Confirmation stamp (styles: components/stamp.css). Change `playKey` to replay the animation. */
export function Stamp({ label, visible, playKey, className = "" }: { label: string; visible: boolean; playKey: number; className?: string }) {
  return (
    <div key={playKey} className={`${visible ? "stamp on" : "stamp"} ${className}`.trim()} aria-hidden="true">
      <span>{label}</span>
    </div>
  );
}

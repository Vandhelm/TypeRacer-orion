/** Confirmation stamp (styles: components/stamp.css). Change `playKey` to replay the animation. */
export function Stamp({ label, visible, playKey }: { label: string; visible: boolean; playKey: number }) {
  return (
    <div key={playKey} className={visible ? "stamp on" : "stamp"} aria-hidden="true">
      <span>{label}</span>
    </div>
  );
}

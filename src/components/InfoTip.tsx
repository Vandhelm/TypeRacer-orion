type InfoTipProps = { label: string; controls: string; open: boolean; onToggle: () => void };

/** Round "i" button that shows or hides a setting's help note (the note itself is rendered by the row, see RoomSettings). */
export function InfoTip({ label, controls, open, onToggle }: InfoTipProps) {
  return (
    <button
      className={`unset relative box-border inline-flex size-[18px] flex-none cursor-pointer items-center justify-center rounded-[50%] border font-mono text-[10px] leading-none font-medium italic transition-[color,border-color] duration-200 ease-[ease] hover:border-white hover:text-white focus-visible:border-white focus-visible:text-white focus-visible:outline-none ${open ? "border-white text-white" : "border-line-soft text-muted"}`}
      type="button" aria-label={label} aria-expanded={open} aria-controls={controls} onClick={onToggle}>
      i
    </button>
  );
}

/** Round "i" button whose tooltip explains a setting (Tailwind; the tooltip itself is components/info-tip.css). */
export function InfoTip({ text }: { text: string }) {
  return (
    <button
      className="info-tip unset relative box-border inline-flex size-[18px] flex-none cursor-help items-center justify-center rounded-[50%] border border-line-soft font-mono text-[10px] leading-none font-medium text-muted italic transition-[color,border-color] duration-200 ease-[ease] hover:border-white hover:text-white focus-visible:border-white focus-visible:text-white focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-white"
      type="button" data-tip={text} aria-label={text}>
      i
    </button>
  );
}

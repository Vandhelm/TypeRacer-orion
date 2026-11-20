/** Logo mark (red diamond) next to an overline and a title (Tailwind; keyframes rise and trace in base/animations.css). */
export function LogoTitle({ overline, name }: { overline: string; name: string }) {
  return (
    <header className="flex animate-[rise_.7s_.35s_cubic-bezier(.2,.8,.2,1)_both] items-center gap-[2.4vh] motion-reduce:animate-none">
      <div className="relative size-[9vh] min-h-[60px] min-w-[60px] flex-none phone:size-[60px]" aria-hidden="true">
        <svg className="size-full overflow-visible" viewBox="0 0 100 100">
          <polygon className="fill-red stroke-[rgba(255,140,120,.4)] stroke-1" points="50,4 96,50 50,96 4,50" />
          <polygon
            className="animate-[trace_1.2s_.6s_cubic-bezier(.6,0,.2,1)_forwards] fill-none stroke-white stroke-1 [stroke-dasharray:260] [stroke-dashoffset:260] motion-reduce:animate-none motion-reduce:[stroke-dashoffset:0]"
            points="50,12 92,46 50,88 8,54" />
        </svg>
      </div>
      <div>
        <p className="mb-[.9vh] font-mono text-[max(10px,1.25vh)] leading-none font-normal tracking-[.3em] text-muted">{overline}</p>
        <h1 className="font-sans text-[max(26px,5vh)] leading-[1.1] font-light tracking-[.12em]">{name}</h1>
      </div>
    </header>
  );
}

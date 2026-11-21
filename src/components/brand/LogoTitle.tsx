/** A11Y-02 : un h2, sous le h1 de la page. Logo mark (public/logo.png) next to an overline and a title (Tailwind; keyframes rise and trace in base/animations.css). */
export function LogoTitle({ overline, name }: { overline: string; name: string }) {
  return (
    <header className="flex animate-[rise_.7s_.35s_cubic-bezier(.2,.8,.2,1)_both] items-center gap-[2.4vh] motion-reduce:animate-none">
      <div className="relative size-[9vh] min-h-[60px] min-w-[60px] flex-none phone:size-[60px]" aria-hidden="true">
        <img className="size-full object-contain" src="/logo.png" alt="" />
      </div>
      <div>
        <p className="mb-[.9vh] font-mono text-[max(10px,1.25vh)] leading-none font-normal tracking-[.3em] text-muted">{overline}</p>
        <h2 className="font-sans text-[max(26px,5vh)] leading-[1.1] font-light tracking-[.12em]">{name}</h2>
      </div>
    </header>
  );
}

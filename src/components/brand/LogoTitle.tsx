/** Logo mark (red diamond) next to an overline and a title (styles: components/brand/logo-title.css). */
export function LogoTitle({ overline, name }: { overline: string; name: string }) {
  return (
    <header className="logo-title">
      <div className="logo-title-mark" aria-hidden="true">
        <svg viewBox="0 0 100 100">
          <polygon className="logo-title-diamond" points="50,4 96,50 50,96 4,50" />
          <polygon className="logo-title-edge" points="50,12 92,46 50,88 8,54" />
        </svg>
      </div>
      <div>
        <p className="logo-title-overline">{overline}</p>
        <h1 className="logo-title-name">{name}</h1>
      </div>
    </header>
  );
}

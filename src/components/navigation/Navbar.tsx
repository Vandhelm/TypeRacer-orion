import type { ReactNode } from "react";

export type NavbarLink = { href: string; label: string; icon?: ReactNode; current?: boolean };

type NavbarProps = {
  brand: string;
  brandHref: string;
  brandLabel?: string;
  links: NavbarLink[];
  linksLabel?: string;
  /** Right side: quick race button, player card, language. */
  children?: ReactNode;
  className?: string;
};

// The bar is a container: its own width (not the screen's) decides what folds.
// ≤ 980 px: sections keep their icon only. ≤ 720 px: the brand keeps its diamond only.
const LINK =
  "flex items-center gap-2 px-[11px] font-mono text-[12px] leading-none font-medium tracking-[.16em] text-muted uppercase no-underline " +
  "transition-[color,background-color] duration-200 motion-reduce:transition-none hover:text-white " +
  "aria-[current=page]:bg-face-front-b aria-[current=page]:text-white aria-[current=page]:[box-shadow:inset_0_2px_0_var(--color-red-solid)] " +
  "focus-visible:outline focus-visible:-outline-offset-4 focus-visible:outline-white @max-[980px]:px-3 @max-[720px]:px-1.5 " +
  "[&_svg]:size-3.5 [&_svg]:flex-none [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-[1.5]";

/** Top navigation bar (Tailwind): brand, centered sections, extras on the right. Its height is --navbar-height (tokens.css). */
export function Navbar({ brand, brandHref, brandLabel, links, linksLabel, children, className = "" }: NavbarProps) {
  return (
    <div className={`@container border-b border-b-line-soft bg-black ${className}`.trim()}>
      <header className="grid h-(--navbar-height) grid-cols-[minmax(max-content,1fr)_auto_minmax(max-content,1fr)] items-stretch gap-x-4 px-5 @max-[720px]:gap-x-2 @max-[720px]:px-3">
        <a
          className="flex items-center gap-3 justify-self-start font-mono text-[12px] leading-none font-medium tracking-[.3em] whitespace-nowrap text-white no-underline focus-visible:outline focus-visible:outline-offset-4 focus-visible:outline-white"
          href={brandHref}
          aria-label={brandLabel}
        >
          <img className="size-5 flex-none" src="/logo.png" alt="" aria-hidden="true" />
          <span className="@max-[720px]:sr-only">{brand}</span>
        </a>
        <nav className="flex justify-self-center" aria-label={linksLabel}>
          {links.map((link) => (
            <a key={link.href} className={LINK} href={link.href} aria-current={link.current ? "page" : undefined}>
              {link.icon}
              {/* the label stays available to screen readers when only the icon shows */}
              <span className="@max-[980px]:sr-only">{link.label}</span>
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-3.5 justify-self-end @max-[720px]:gap-2.5">{children}</div>
      </header>
    </div>
  );
}

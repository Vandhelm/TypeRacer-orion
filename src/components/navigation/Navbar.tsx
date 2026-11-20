import type { ReactNode } from "react";

export type NavbarLink = { href: string; label: string; icon?: ReactNode; current?: boolean };

type NavbarProps = {
  brand: string;
  brandHref: string;
  brandLabel?: string;
  links: NavbarLink[];
  linksLabel?: string;
  /** Extra content on the right, e.g. <HangingTabs>. */
  children?: ReactNode;
  className?: string;
};

/** Top navigation bar (Tailwind). Its height is --navbar-height (tokens.css). */
const LINK =
  "flex items-center gap-2 px-3 font-mono text-[12px] leading-none font-medium tracking-[.22em] text-muted uppercase no-underline " +
  "transition-[color,box-shadow] duration-200 ease-[ease] motion-reduce:transition-none hover:text-white phone:px-2 " +
  "aria-[current=page]:text-white aria-[current=page]:[box-shadow:inset_0_-3px_0_var(--color-red-solid)] " +
  "focus-visible:outline focus-visible:-outline-offset-4 focus-visible:outline-white " +
  "[&_svg]:size-3.5 [&_svg]:flex-none [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-[1.5]";

export function Navbar({ brand, brandHref, brandLabel, links, linksLabel, children, className = "" }: NavbarProps) {
  return (
    <header className={`flex h-(--navbar-height) items-start gap-2 border-b border-b-line-soft bg-black px-6 phone:px-4 ${className}`.trim()}>
      <a
        className="flex h-full items-center gap-2.5 font-mono text-[12px] leading-none font-medium tracking-[.3em] text-white no-underline focus-visible:outline focus-visible:outline-offset-4 focus-visible:outline-white"
        href={brandHref}
        aria-label={brandLabel}
      >
        <svg className="size-3.5 flex-none" viewBox="0 0 100 100" aria-hidden="true">
          <polygon className="fill-red stroke-[rgba(255,140,120,.4)] stroke-1" points="50,4 96,50 50,96 4,50" />
        </svg>
        {brand}
      </a>
      <nav className="mr-4 ml-auto flex h-full phone:mr-2" aria-label={linksLabel}>
        {links.map((link) => (
          <a key={link.href} className={LINK} href={link.href} aria-current={link.current ? "page" : undefined}>
            {link.icon}
            {/* icon only on small phones: the label stays available to screen readers */}
            <span className="tiny:absolute tiny:size-px tiny:overflow-hidden tiny:[clip-path:inset(50%)] tiny:whitespace-nowrap">{link.label}</span>
          </a>
        ))}
      </nav>
      {children}
    </header>
  );
}

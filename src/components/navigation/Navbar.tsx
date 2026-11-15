import type { ReactNode } from "react";

export type NavbarLink = { href: string; label: string; icon?: ReactNode; current?: boolean };

type NavbarProps = {
  brand: string;
  brandHref: string;
  brandLabel?: string;
  links: NavbarLink[];
  linksLabel?: string;
  /** Right side, e.g. <UserMenu>. */
  children?: ReactNode;
  className?: string;
};

/** Top navigation bar: brand on the left, links centered, extras on the right (styles: components/navigation/navbar.css). */
export function Navbar({ brand, brandHref, brandLabel, links, linksLabel, children, className = "" }: NavbarProps) {
  return (
    <header className={`navbar ${className}`.trim()}>
      <a className="navbar-brand" href={brandHref} aria-label={brandLabel}>
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <polygon points="50,4 96,50 50,96 4,50" />
        </svg>
        <span className="navbar-brand-label">{brand}</span>
      </a>
      <nav className="navbar-links" aria-label={linksLabel}>
        {links.map((link) => (
          <a key={link.href} className="navbar-link" href={link.href} aria-current={link.current ? "page" : undefined}>
            {link.icon}
            <span className="navbar-link-label">{link.label}</span>
          </a>
        ))}
      </nav>
      <div className="navbar-end">{children}</div>
    </header>
  );
}

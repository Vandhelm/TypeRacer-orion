import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

type Common = { icon?: ReactNode; children: ReactNode; className?: string };
type AsLink = Common & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };
type AsButton = Common & ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };

/** Secondary button, rendered as a link when it has an href (styles: components/buttons/outline-button.css). */
export function OutlineButton(props: AsLink | AsButton) {
  const { icon, children, className = "", ...rest } = props;
  const classes = `outline-button ${className}`.trim();
  const content = icon ? (
    <>
      {icon}
      <span>{children}</span>
    </>
  ) : (
    children
  );
  if (rest.href !== undefined) {
    return <a className={classes} {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}>{content}</a>;
  }
  const { type = "button", ...buttonProps } = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return <button className={classes} type={type} {...buttonProps}>{content}</button>;
}

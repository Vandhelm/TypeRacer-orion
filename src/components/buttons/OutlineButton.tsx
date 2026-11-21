import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

type Common = { icon?: ReactNode; children: ReactNode; className?: string };
type AsLink = Common & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };
type AsButton = Common & ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };

const OUTLINE =
  "unset box-border flex h-[4.8vh] min-h-[44px] cursor-pointer items-center justify-center gap-[1.2vh] border border-line-soft pl-[.3em] " +
  "font-sans text-[max(11px,1.3vh)] leading-none font-medium tracking-[.3em] text-white " +
  "bg-[linear-gradient(#f2f2f2,#f2f2f2)] bg-[length:0%_100%] bg-[position:left_center] bg-no-repeat hover:bg-[length:100%_100%] hover:border-[#f2f2f2] hover:text-black " +
  "transition-[background-size,color,border-color] duration-[.3s,.2s,.2s] ease-[cubic-bezier(.2,.8,.2,1),ease,ease] motion-reduce:transition-none " +
  "focus-visible:outline focus-visible:outline-offset-4 focus-visible:outline-white " +
  "[&_svg]:size-[max(14px,1.8vh)] [&_svg]:flex-none [&_svg]:fill-current";

/** Secondary button, rendered as a link when it has an href (Tailwind): a white fill slides in on hover. */
export function OutlineButton(props: AsLink | AsButton) {
  const { icon, children, className = "", ...rest } = props;
  const classes = `outline-button ${OUTLINE} ${className}`.trim();
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

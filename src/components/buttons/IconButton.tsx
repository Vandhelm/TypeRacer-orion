import type { ButtonHTMLAttributes, Ref } from "react";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Accessible name, also shown as a tooltip. */
  label: string;
  /** Tints the icon to confirm an action. */
  confirmed?: boolean;
  ref?: Ref<HTMLButtonElement>;
};

const ICON =
  "unset relative box-border flex size-7 cursor-pointer items-center justify-center border border-transparent transition-[color,border-color] duration-200 ease-[ease] " +
  "enabled:hover:border-line-soft enabled:hover:text-white disabled:cursor-default disabled:opacity-25 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-white [&_svg]:size-3.5";

/** Small square icon button with a tooltip (Tailwind; tooltip from components/info-tip.css). */
export function IconButton({ label, confirmed, className = "", type = "button", ...props }: IconButtonProps) {
  return <button className={`${ICON} ${confirmed ? "text-red-text" : "text-muted"} ${className}`.trim()} type={type} aria-label={label} data-tip={label} {...props} />;
}

import type { ButtonHTMLAttributes, Ref } from "react";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Accessible name, also shown as a tooltip. */
  label: string;
  /** Tints the icon to confirm an action. */
  confirmed?: boolean;
  ref?: Ref<HTMLButtonElement>;
};

/** Small square icon button with a tooltip (styles: components/buttons/icon-button.css). */
export function IconButton({ label, confirmed, className = "", type = "button", ...props }: IconButtonProps) {
  return <button className={`icon-button ${confirmed ? "confirmed" : ""} ${className}`.trim().replace(/\s+/g, " ")} type={type} aria-label={label} data-tip={label} {...props} />;
}

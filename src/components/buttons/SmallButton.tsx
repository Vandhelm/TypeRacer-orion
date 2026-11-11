import type { ButtonHTMLAttributes } from "react";

/** Small outlined text button (styles: components/buttons/small-button.css). */
export function SmallButton({ className = "", type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`small-button ${className}`.trim()} type={type} {...props} />;
}

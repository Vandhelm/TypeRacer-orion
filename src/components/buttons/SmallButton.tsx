import type { ButtonHTMLAttributes } from "react";

/** Classes of the small outlined text button. Also used on a <label> (file picker). The room editor restyles .small-button in its CSS. */
export const SMALL_BUTTON =
  "small-button unset box-border inline-flex min-h-[40px] cursor-pointer items-center border border-line-soft px-3 " +
  "font-mono text-[max(11px,1.2vh)] leading-none font-normal tracking-[.14em] uppercase " +
  "transition-[background,color,border-color] duration-200 ease-[ease] hover:border-[#f2f2f2] hover:bg-[#f2f2f2] hover:text-black " +
  "focus-visible:outline focus-visible:outline-offset-3 focus-visible:outline-white " +
  "disabled:cursor-default disabled:border-line-soft disabled:bg-transparent disabled:text-white disabled:opacity-35";

/** Small outlined text button (Tailwind). */
export function SmallButton({ className = "", type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`${SMALL_BUTTON} ${className}`.trim()} type={type} {...props} />;
}

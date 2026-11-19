import type { AnchorHTMLAttributes, Ref } from "react";

// Set --hang-from to the y position it hangs from (default: top of the screen). Pages move it with .hanging-button.<x> rules.
const HANGING =
  "hanging-button fixed top-[calc(var(--hang-from,0px)+30px)] left-6 z-20 flex min-h-[42px] items-center gap-2.5 border border-line bg-black px-4 " +
  "font-mono text-[12px] leading-none font-medium tracking-[.22em] text-white uppercase no-underline " +
  "[box-shadow:inset_0_0_0_4px_#000,inset_0_0_0_5px_var(--color-line-faint)] transition-[background,color] duration-200 ease-[ease] " +
  "animate-[drop_.6s_.5s_cubic-bezier(.2,.9,.3,1.25)_both] motion-reduce:animate-none! hover:bg-[#f2f2f2] hover:text-black " +
  "focus-visible:outline focus-visible:outline-offset-4 focus-visible:outline-white " +
  "before:absolute before:bottom-full before:left-[18%] before:h-[30px] before:w-px before:bg-line-soft " +
  "after:absolute after:right-[18%] after:bottom-full after:h-[30px] after:w-px after:bg-line-soft " +
  "narrow:top-[calc(var(--hang-from,0px)+24px)] narrow:left-3 narrow:min-h-[40px] narrow:px-3 narrow:text-[11px] narrow:before:h-6 narrow:after:h-6";

/** Link hanging from two wires (Tailwind; keyframe drop in base/animations.css). */
export function HangingButton({ className = "", ref, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { ref?: Ref<HTMLAnchorElement> }) {
  return <a ref={ref} className={`${HANGING} ${className}`.trim()} {...props} />;
}

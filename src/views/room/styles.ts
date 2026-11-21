// Tailwind classes shared by several parts of the room page.

/** Small uppercase label above or beside a value. */
export const LABEL = "block font-mono text-[max(11px,1.3vh)] leading-[1.2] font-normal tracking-[.2em] text-muted uppercase";

/** A soft shadow behind a group of text: the fish sink into it and fade, never cut sharply. Narrow: within the page padding (DES-06). */
export const SHADE =
  "relative before:pointer-events-none before:absolute before:-inset-x-[22px] before:-inset-y-[18px] before:-z-1 narrow:before:-inset-x-4 " +
  "before:rounded-[30px] before:bg-[rgba(0,0,0,.94)] before:[filter:blur(14px)]";

/** A value shown as text instead of choices (guest view, custom text). */
export const PLAIN_VALUE = "flex min-h-[40px] items-center font-sans text-[clamp(17px,2.6vh,24px)] leading-[1.1] font-light";

/** Dashed rule above a section of the page. */
export const DASHED_TOP = "border-t border-t-line-soft [border-top-style:dashed]";

/** A secondary action in a refusal (watch, leave the other room) or the member list (kick). Margin and height at the call site. */
export const ACTION =
  "unset box-border inline-flex cursor-pointer items-center border border-dashed border-line-soft bg-black px-4 font-mono text-[12px] leading-none tracking-[.16em] text-white uppercase " +
  "hover:border-white focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-red-text";

// Tailwind classes shared by several parts of the room page.

/** Small uppercase label above or beside a value. */
export const LABEL = "block font-mono text-[max(11px,1.3vh)] leading-[1.2] font-normal tracking-[.2em] text-muted uppercase";

/** A soft shadow behind a group of text: the fish sink into it and fade, never cut sharply. */
export const SHADE =
  "relative before:pointer-events-none before:absolute before:-inset-x-[22px] before:-inset-y-[18px] before:-z-1 " +
  "before:rounded-[30px] before:bg-[rgba(0,0,0,.94)] before:[filter:blur(14px)]";

/** A value shown as text instead of choices (guest view, custom text). */
export const PLAIN_VALUE = "flex min-h-[40px] items-center font-sans text-[clamp(17px,2.6vh,24px)] leading-[1.1] font-light";

/** Dashed rule above a section of the page. */
export const DASHED_TOP = "border-t border-t-line-soft [border-top-style:dashed]";

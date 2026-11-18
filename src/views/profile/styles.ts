// Tailwind classes shared by the profile pages (stats and account).
// The card grid (.profile-card) and the keyboard heatmap keys stay in styles/pages/profile/profile.css.

export const PAGE = "fixed inset-0 overflow-y-auto bg-black px-[clamp(16px,4vw,56px)] pt-[30px] pb-8 font-sans text-white";
export const HEAD = "mb-[clamp(20px,4vh,40px)] flex flex-wrap items-center justify-between gap-x-6 gap-y-3";
export const TITLE = "min-w-0 text-right";
export const NAME = "font-sans text-[clamp(20px,3.4vh,32px)] leading-[1.1] font-light tracking-[.1em] wrap-anywhere";

/** Sections have no frame: a title with a red bar and a large gap between them. */
export const SECTION = "[&+&]:mt-[clamp(36px,6vh,64px)]";
export const ACCOUNT_SECTION = "[&+&]:mt-[clamp(28px,5vh,48px)]";
export const SECTION_TITLE =
  "mb-[14px] flex items-center gap-2.5 font-mono text-[max(11px,1.3vh)] leading-[1.2] font-normal tracking-[.2em] text-white uppercase " +
  "before:h-[1.1em] before:w-[3px] before:bg-red-text";
export const NOTE = "font-mono text-[max(12px,1.4vh)] leading-[1.6] font-normal text-muted [&+&]:mt-3 [.profile-card+&]:mt-3";

/** One figure: its label (with the marker of its curve), its value, its notes. */
export const STAT_LABEL =
  "block font-mono text-[max(11px,1.3vh)] leading-[1.2] font-normal tracking-[.2em] text-muted uppercase " +
  "[&_.chart-swatch]:mt-[-2px] [&_.chart-swatch]:mr-2 [&_.chart-swatch]:align-middle";

// Charts
export const CHART = "relative min-w-0";
export const LEGEND =
  "mb-4 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[max(11px,1.2vh)] leading-none font-normal tracking-[.08em] text-muted " +
  "[&>span]:inline-flex [&>span]:items-center [&>span]:gap-2";
export const SWATCH = { wpm: "chart-swatch inline-block h-0.5 w-[18px] bg-red-text", raw: "chart-swatch inline-block h-0.5 w-[18px] bg-chart-raw" };
export const CROSS = "chart-cross text-white not-italic";
export const PLOT =
  "[&_svg]:block [&_svg]:w-full [&_svg]:touch-pan-y [&_svg]:fill-muted [&_svg]:font-mono [&_svg]:text-[11px] [&_svg]:leading-normal [&_svg]:font-normal";
export const GRID_LINE = (value: number) => (value ? "stroke-[rgba(255,255,255,.1)]" : "stroke-line-soft");
export const ERROR_MARK = "fill-white text-[14px]";
export const LINE = {
  wpm: "fill-none stroke-red-text stroke-2 [stroke-linecap:round] [stroke-linejoin:round]",
  raw: "fill-none stroke-chart-raw stroke-[1.5] [stroke-linecap:round] [stroke-linejoin:round]",
};
export const CURSOR = "stroke-[rgba(255,255,255,.5)]";
export const DOT = { wpm: "fill-red-text stroke-black stroke-2", raw: "fill-chart-raw stroke-black stroke-2" };
export const TIP =
  "pointer-events-none absolute z-2 min-w-[112px] border border-line bg-black px-2.5 py-2 font-mono text-[12px] leading-[1.6] font-normal whitespace-nowrap " +
  "[&_p]:flex [&_p]:justify-between [&_p]:gap-[14px] [&_span]:text-muted";
export const TIP_HEAD = "mb-1 border-b border-b-line-faint pb-1 text-[11px] tracking-[.1em] uppercase";

// Account: one box per setting, same rules and background as the stat cards
export const BOX = "flex flex-wrap items-center gap-x-5 gap-y-4 border border-line-faint bg-face-front-a p-[clamp(16px,2.4vh,22px)]";
export const MAIN = "grid min-w-0 flex-[1_1_220px] gap-2.5";
export const HELP = "font-mono text-[12px] leading-[1.6] font-normal text-muted";
const BUTTON =
  "unset box-border inline-grid h-[34px] cursor-pointer place-items-center border px-4 font-mono text-[11px] leading-none font-medium tracking-[.2em] uppercase " +
  "transition-[background,color,border-color] duration-200 ease-[ease] focus-visible:outline focus-visible:outline-offset-4 focus-visible:outline-white " +
  "focus-within:outline focus-within:outline-offset-4 focus-within:outline-white " +
  "disabled:cursor-default disabled:border-line-faint disabled:bg-transparent disabled:text-line-soft " +
  "aria-disabled:cursor-default aria-disabled:border-line-faint aria-disabled:bg-transparent aria-disabled:text-line-soft";
const HOVER = "not-disabled:not-aria-disabled:hover:";
/** Outlined button, like Link / Unlink. "quiet" turns red on hover (remove). */
export const ACCOUNT_BUTTON = {
  normal: `${BUTTON} border-line text-white ${HOVER}bg-[#f2f2f2] ${HOVER}text-black`,
  quiet: `${BUTTON} border-line-soft text-muted ${HOVER}border-red-text ${HOVER}bg-transparent ${HOVER}text-red-text`,
};

import type { CSSProperties, PointerEventHandler, Ref } from "react";

/** highlight: the value in red (e.g. bots: yes). */
export type TicketRow = { label: string; value: string; highlight?: boolean };

type TicketStubProps = {
  label: string;
  actionLabel: string;
  actionAriaLabel?: string;
  onAction?: () => void;
  className?: string;
  style?: CSSProperties;
  ref?: Ref<HTMLDivElement>;
};

// Sizes scale with --u and --hang, set by the parent (e.g. the tickets grid of the rooms view).
const BUTTON =
  "ticket-button unset box-border flex h-[max(30px,calc(9.5*var(--u)))] cursor-pointer items-center justify-center border border-[rgba(255,140,120,.45)] bg-red-solid " +
  "pr-[calc(4*var(--u))] pl-[calc(4*var(--u)+.3em)] font-sans text-[max(10px,calc(3.8*var(--u)))] leading-none font-medium tracking-[.3em] text-white " +
  "transition-[background,color,border-color] duration-200 ease-[ease] hover:bg-red-hover focus-visible:outline focus-visible:outline-offset-3 focus-visible:outline-white";
// The paper (its hover motion is a damped spring computed in JS), with an inner frame
const PAPER =
  "relative flex origin-top flex-col gap-[calc(7*var(--u))] border border-line bg-[#070707] px-[calc(10*var(--u))] pt-[calc(15*var(--u))] pb-0 [will-change:transform] " +
  "[box-shadow:0_1cqw_2cqw_rgba(0,0,0,.55)] transition-[box-shadow] duration-[.4s] ease-[ease] group-hover:[box-shadow:0_1.2cqw_2.4cqw_rgba(0,0,0,.65)] " +
  "after:pointer-events-none after:absolute after:inset-x-[calc(3*var(--u))] after:top-[calc(3*var(--u))] after:bottom-0 after:border-x after:border-t after:border-x-line-faint after:border-t-line-faint";
const NUMBER_BOX =
  "flex flex-col items-center gap-[calc(3.6*var(--u))] border-y border-y-line-soft py-[calc(7*var(--u))] " +
  "[box-shadow:0_calc(-1.4*var(--u))_0_-1px_var(--color-line-faint),0_calc(1.4*var(--u))_0_-1px_var(--color-line-faint)]";

/** Tear-off stub of a ticket. Also used alone for the copy that flies away. */
export function TicketStub({ label, actionLabel, actionAriaLabel, onAction, className = "", style, ref }: TicketStubProps) {
  return (
    <div ref={ref} className={`flex flex-col gap-[calc(5*var(--u))] pt-[calc(2*var(--u))] pb-[calc(10*var(--u))] ${className}`.trim()} style={style}>
      <div className="flex items-center justify-between font-mono text-[max(9px,calc(3.2*var(--u)))] leading-none font-normal tracking-[.24em] text-line-soft">
        <span>{label}</span>
        <span className="size-[calc(3*var(--u))] bg-red-solid [transform:rotate(45deg)]" aria-hidden="true" />
      </div>
      <button className={BUTTON} type="button" aria-label={actionAriaLabel} onClick={onAction}>
        <span className="ticket-button-text">{actionLabel}</span>
      </button>
    </div>
  );
}

type TicketProps = {
  header: string;
  number: string;
  title: string;
  serial: string;
  rows: TicketRow[];
  stampLabel: string;
  stub: Omit<TicketStubProps, "className" | "style" | "ref">;
  taken?: boolean;
  /** Plays the "slide down" entrance (keyframe in styles/components/cards/ticket.css). */
  descending?: boolean;
  paperStyle?: CSSProperties;
  refs?: { root?: Ref<HTMLDivElement>; paper?: Ref<HTMLDivElement>; stub?: Ref<HTMLDivElement>; hole?: Ref<HTMLSpanElement> };
  onPointerEnter?: PointerEventHandler<HTMLDivElement>;
  onPointerLeave?: PointerEventHandler<HTMLDivElement>;
  "data-i"?: number;
};

/** Hanging ticket card with a tear-off stub (Tailwind; the wire, perforation, stamp and animations stay in styles/components/cards/ticket.css). */
export function Ticket({ header, number, title, serial, rows, stampLabel, stub, taken, descending, paperStyle, refs, onPointerEnter, onPointerLeave, ...data }: TicketProps) {
  const classes = ["ticket group", taken && "taken", descending && "descend"].filter(Boolean).join(" ");
  return (
    <div ref={refs?.root} className={classes} onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave} {...data}>
      <div ref={refs?.paper} className={PAPER} style={paperStyle}>
        <span ref={refs?.hole} className="absolute top-[calc(4*var(--u))] left-1/2 z-2 size-[calc(6*var(--u))] rounded-[50%] border border-line bg-black [transform:translateX(-50%)]" aria-hidden="true" />
        <span className="ticket-stamp" aria-hidden="true">
          <span>{stampLabel}</span>
        </span>
        <div className="pl-[.26em] text-center font-mono text-[max(9px,calc(3.6*var(--u)))] leading-none font-medium tracking-[.26em] text-line-soft">{header}</div>
        <div className={NUMBER_BOX}>
          <span className="font-sans text-[length:calc(26*var(--u))] leading-none font-extralight tracking-[.02em] text-white" aria-hidden="true">{number}</span>
          <span className="pl-[.34em] font-sans text-[length:calc(4.6*var(--u))] leading-none font-medium tracking-[.34em]">{title}</span>
          <span className="font-mono text-[max(9px,calc(3.4*var(--u)))] leading-none font-normal tracking-[.2em] text-[rgba(255,255,255,.5)]">{serial}</span>
        </div>
        <div className="flex flex-col gap-[calc(5.5*var(--u))] py-[calc(1*var(--u))]">
          {rows.map((row) => (
            <div key={row.label} className="flex min-w-0 items-center gap-[calc(2*var(--u))] after:order-1 after:min-w-[calc(2*var(--u))] after:flex-1 after:[border-top:1px_dotted_rgba(255,255,255,.22)]">
              <span className="font-mono text-[max(10px,calc(4*var(--u)))] leading-none font-normal tracking-[.12em] whitespace-nowrap text-[rgba(255,255,255,.6)] uppercase">{row.label}</span>
              <span className={`order-2 flex-none font-mono text-[max(11px,calc(4.8*var(--u)))] leading-none font-medium tracking-[.04em] whitespace-nowrap ${row.highlight ? "text-red-text" : "text-white"}`}>{row.value}</span>
            </div>
          ))}
        </div>
        <div className="ticket-perforation" aria-hidden="true" />
        <TicketStub ref={refs?.stub} className={taken ? "invisible" : ""} {...stub} />
      </div>
    </div>
  );
}

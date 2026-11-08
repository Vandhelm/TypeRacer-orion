import type { CSSProperties, PointerEventHandler, Ref } from "react";

export type TicketRow = { label: string; value: string; valueClassName?: string };

type TicketStubProps = {
  label: string;
  actionLabel: string;
  actionAriaLabel?: string;
  onAction?: () => void;
  className?: string;
  style?: CSSProperties;
  ref?: Ref<HTMLDivElement>;
};

/** Tear-off stub of a ticket. Also used alone for the copy that flies away. */
export function TicketStub({ label, actionLabel, actionAriaLabel, onAction, className = "", style, ref }: TicketStubProps) {
  return (
    <div ref={ref} className={`ticket-stub ${className}`.trim()} style={style}>
      <div className="ticket-stub-header">
        <span>{label}</span>
        <span className="ticket-dot" aria-hidden="true" />
      </div>
      <button className="ticket-button" type="button" aria-label={actionAriaLabel} onClick={onAction}>
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
  /** Plays the "slide down" entrance (see components/cards/ticket.css). */
  descending?: boolean;
  paperStyle?: CSSProperties;
  refs?: { root?: Ref<HTMLDivElement>; paper?: Ref<HTMLDivElement>; stub?: Ref<HTMLDivElement>; hole?: Ref<HTMLSpanElement> };
  onPointerEnter?: PointerEventHandler<HTMLDivElement>;
  onPointerLeave?: PointerEventHandler<HTMLDivElement>;
  "data-i"?: number;
};

/** Hanging ticket card with a tear-off stub (styles: components/cards/ticket.css). */
export function Ticket({ header, number, title, serial, rows, stampLabel, stub, taken, descending, paperStyle, refs, onPointerEnter, onPointerLeave, ...data }: TicketProps) {
  const classes = ["ticket", taken && "taken", descending && "descend"].filter(Boolean).join(" ");
  return (
    <div ref={refs?.root} className={classes} onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave} {...data}>
      <div ref={refs?.paper} className="ticket-paper" style={paperStyle}>
        <span ref={refs?.hole} className="ticket-hole" aria-hidden="true" />
        <span className="ticket-stamp" aria-hidden="true">
          <span>{stampLabel}</span>
        </span>
        <div className="ticket-header">{header}</div>
        <div className="ticket-num">
          <span className="ticket-number" aria-hidden="true">{number}</span>
          <span className="ticket-table">{title}</span>
          <span className="ticket-serial">{serial}</span>
        </div>
        <div className="ticket-rows">
          {rows.map((row) => (
            <div key={row.label} className="ticket-row">
              <span className="ticket-label">{row.label}</span>
              <span className={`ticket-value ${row.valueClassName ?? ""}`.trim()}>{row.value}</span>
            </div>
          ))}
        </div>
        <div className="ticket-perforation" aria-hidden="true" />
        <TicketStub ref={refs?.stub} {...stub} />
      </div>
    </div>
  );
}

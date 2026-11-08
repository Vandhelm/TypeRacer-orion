import { useImperativeHandle, useRef, useState, type CSSProperties, type Ref } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Ticket, TicketStub } from "../../components/cards/Ticket";
import { useTicketSway } from "./hooks/useTicketSway";
import { ROOMS, WAITING_PAGE } from "./rooms";

export type RoomsViewHandle = { tickets(): HTMLDivElement[] };

type Flying = { left: number; top: number; width: number; u: number };

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Rooms view: hanging tickets; taking one tears its stub off and opens the waiting room. */
export function RoomsView({ descending, ref }: { descending: boolean; ref?: Ref<RoomsViewHandle> }) {
  const { t } = useTranslation();
  const [taken, setTaken] = useState(-1);
  const [cut, setCut] = useState<string>();
  const [flying, setFlying] = useState<Flying | null>(null);

  const roots = useRef<(HTMLDivElement | null)[]>([]);
  const papers = useRef<(HTMLDivElement | null)[]>([]);
  const stubs = useRef<(HTMLDivElement | null)[]>([]);
  const holes = useRef<(HTMLSpanElement | null)[]>([]);
  const sway = useTicketSway(papers, ROOMS.length);

  useImperativeHandle(ref, () => ({ tickets: () => roots.current.filter((el): el is HTMLDivElement => !!el) }), []);

  function take(i: number) {
    if (taken >= 0) return;
    const paper = papers.current[i]!, stub = stubs.current[i]!, hole = holes.current[i]!;
    // copie du talon, posée exactement au même endroit, qui va s'envoler
    const box = stub.getBoundingClientRect(), pr = paper.getBoundingClientRect();
    setFlying({ left: pr.left, top: box.top, width: pr.width, u: hole.offsetWidth / 6 });
    // le ticket est coupé net à la perforation
    setCut(`inset(-20px -20px ${paper.offsetHeight - stub.offsetTop}px -20px)`);
    setTaken(i);
    const room = ROOMS[i]!;
    const reduce = reducedMotion();
    setTimeout(() => {
      const [present, max] = room.guests.split(" / ");
      location.href = `${WAITING_PAGE}?table=${room.n}&serial=${room.serial}&lang=${room.lang}&guests=${max}&present=${present}&bots=${room.bots ? 1 : 0}`;
    }, reduce ? 500 : 1700);
  }

  const stubOf = (i: number) => {
    const room = ROOMS[i]!;
    return {
      label: t("rooms.stub"),
      actionLabel: t("rooms.take"),
      actionAriaLabel: t("rooms.takeLabel", { n: room.n, guests: room.guests }),
    };
  };

  return (
    <main className="rooms pointer-events-none fixed inset-0 z-10 flex items-start justify-center px-4 narrow:min-h-screen narrow:items-start narrow:px-2 narrow:pt-[110px] narrow:pb-6">
      <h1 className="sr-only">{t("rooms.pageTitle")}</h1>
      <div className="rooms-stall">
        <div className={taken >= 0 ? "tickets locked" : "tickets"} id="tickets" {...sway.container}>
          {ROOMS.map((room, i) => (
            <Ticket
              key={room.n}
              data-i={i}
              header={t("rooms.reservation")}
              number={String(room.n).padStart(2, "0")}
              title={`${t("rooms.table")} ${room.n}`}
              serial={`${t("rooms.serial")} ${room.serial}`}
              rows={[
                { label: t("rooms.lang"), value: t(room.lang === "fr" ? "rooms.codeFr" : "rooms.codeEn"), valueClassName: "v-lang" },
                { label: t("rooms.guests"), value: room.guests },
                { label: t("rooms.bots"), value: t(room.bots ? "rooms.yes" : "rooms.no"), valueClassName: room.bots ? "v-bots yes" : "v-bots" },
              ]}
              stampLabel={t("rooms.reserved")}
              stub={{ ...stubOf(i), onAction: () => take(i) }}
              taken={taken === i}
              descending={descending}
              paperStyle={taken === i ? { clipPath: cut } : undefined}
              refs={{
                root: (el) => { roots.current[i] = el; },
                paper: (el) => { papers.current[i] = el; },
                stub: (el) => { stubs.current[i] = el; },
                hole: (el) => { holes.current[i] = el; },
              }}
              {...sway.ticket(i)}
            />
          ))}
        </div>
      </div>
      {flying &&
        createPortal(
          <TicketStub
            {...stubOf(taken)}
            className="ticket-stub-flying"
            style={{
              "--u": `${flying.u}px`,
              left: `${flying.left}px`,
              top: `${flying.top}px`,
              width: `${flying.width}px`,
              ...(reducedMotion() ? { animation: "none", opacity: 0 } : {}),
            } as CSSProperties}
          />,
          document.body,
        )}
    </main>
  );
}

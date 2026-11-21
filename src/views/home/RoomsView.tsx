import { useEffect, useImperativeHandle, useRef, useState, type CSSProperties, type Ref } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Ticket, TicketStub } from "../../components/cards/Ticket";
import { useTicketSway } from "./hooks/useTicketSway";
import type { RoomFilters as Filters } from "../../rooms/explorer";
import { RoomFilters } from "./RoomFilters";
import { shortName, WAITING_PAGE, watchPublicRooms, type Room } from "./rooms";

// Ticket sizes scale with --u and --hang (components/cards/ticket.css): 3 columns, 4 on a wide stall, 2 on a narrow one.
const TICKETS =
  "mx-[4cqw] grid grid-cols-[repeat(3,minmax(0,1fr))] [align-items:start] gap-[2.6cqw] pt-0 [--hang:34px] [--u:.32cqw] narrow:m-0 " +
  "[@container(min-width:460px)]:grid-cols-[repeat(4,minmax(0,1fr))] [@container(min-width:460px)]:[--u:.235cqw] " +
  "[@container(max-width:420px)]:grid-cols-[repeat(2,minmax(0,1fr))] [@container(max-width:420px)]:gap-3 [@container(max-width:420px)]:[--u:calc((100cqw-12px)/200)]";

// JOIN-02 : filters and taller tickets no longer fit under the roof on a short desktop screen. The view scrolls
// (each Take button stays reachable), it starts higher on short screens, and its width follows the height left
// (ticket ≈ .47 × width, filters ≈ 110px with margins), but not below 820px so the ticket rows keep their text on one line.
const ROOMS =
  "rooms pointer-events-none fixed inset-0 z-10 flex items-start justify-center overflow-y-auto px-4 pb-10 [--top:36vh] [@media(max-height:760px)]:[--top:30vh] " +
  "narrow:min-h-screen narrow:items-start narrow:overflow-visible narrow:px-2 narrow:pt-[110px] narrow:pb-6";
const STALL =
  "pointer-events-auto relative @container mt-[var(--top)] w-[min(100%,940px,max(820px,calc((100vh-var(--top)-110px)/.47)))] " +
  "animate-[rise_1s_.15s_cubic-bezier(.2,.8,.2,1)_both] motion-reduce:animate-none! narrow:mt-[30vh]";

export type RoomsViewHandle = { tickets(): HTMLDivElement[] };

type Flying = { left: number; top: number; width: number; u: number };

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Rooms view: hanging tickets; taking one tears its stub off and opens the waiting room. */
export function RoomsView({ descending, ref }: { descending: boolean; ref?: Ref<RoomsViewHandle> }) {
  const { t } = useTranslation();
  const [taken, setTaken] = useState(-1);
  const [cut, setCut] = useState<string>();
  const [flying, setFlying] = useState<Flying | null>(null);
  const [tables, setRooms] = useState<Room[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filters, setFilters] = useState<Filters>({});
  const [failed, setFailed] = useState(false);
  const holding = taken >= 0;

  // JOIN-02 : la liste suit les salons sans rechargement (relecture régulière, voir watchPublicRooms) ;
  // un nouveau filtre relit aussitôt. Une fois un ticket pris, elle ne bouge plus : l'index pris reste ce salon.
  useEffect(() => {
    if (holding) return;
    return watchPublicRooms(
      filters,
      (list) => {
        setRooms(list);
        setLoaded(true);
        setFailed(false);
      },
      { onFail: () => setFailed(true) },
    );
  }, [filters, holding]);

  const filtered = !!(filters.language || filters.level);

  const roots = useRef<(HTMLDivElement | null)[]>([]);
  const papers = useRef<(HTMLDivElement | null)[]>([]);
  const stubs = useRef<(HTMLDivElement | null)[]>([]);
  const holes = useRef<(HTMLSpanElement | null)[]>([]);
  const sway = useTicketSway(papers, tables.length);

  useImperativeHandle(ref, () => ({ tickets: () => roots.current.filter((el): el is HTMLDivElement => !!el) }), []);

  function take(i: number) {
    // SALLE-09 : un salon en course ne se prend pas (le bouton est désactivé ; le serveur refuse aussi l'entrée)
    if (taken >= 0 || !tables[i]?.joinable) return;
    const paper = papers.current[i]!, stub = stubs.current[i]!, hole = holes.current[i]!;
    // copie du talon, posée exactement au même endroit, qui va s'envoler
    const box = stub.getBoundingClientRect(), pr = paper.getBoundingClientRect();
    setFlying({ left: pr.left, top: box.top, width: pr.width, u: hole.offsetWidth / 6 });
    // le ticket est coupé net à la perforation
    setCut(`inset(-20px -20px ${paper.offsetHeight - stub.offsetTop}px -20px)`);
    setTaken(i);
    const room = tables[i]!;
    const reduce = reducedMotion();
    // SALLE-03 : un salon public s'ouvre directement ; le serveur vérifie l'entrée par son code
    setTimeout(() => {
      location.href = `${WAITING_PAGE}?code=${room.code}`;
    }, reduce ? 500 : 1700);
  }

  const stubOf = (i: number) => {
    const room = tables[i]!;
    return {
      label: t("rooms.stub"),
      actionLabel: t("rooms.take"),
      actionAriaLabel: room.joinable ? t("rooms.takeLabel", { n: room.n, guests: room.guests }) : t("rooms.explorer.inRaceLabel", { n: room.n }),
      actionDisabled: !room.joinable,
    };
  };

  return (
    <section className={ROOMS} aria-labelledby="rooms-title">
      <h2 id="rooms-title" className="sr-only">{t("rooms.pageTitle")}</h2>
      <div className={STALL}>
        <RoomFilters value={filters} onChange={setFilters} />
        {failed && !loaded && <p className="pointer-events-auto mx-[4cqw] rounded-[12px] border border-dashed border-line px-[18px] py-[14px] text-center text-red-text" role="alert">{t("rooms.explorer.failed")}</p>}
        {loaded && !tables.length && <p className="pointer-events-auto mx-[4cqw] rounded-[12px] border border-dashed border-line px-[18px] py-[14px] text-center text-muted" role="status">{t(filtered ? "rooms.explorer.noMatch" : "rooms.empty")}</p>}
        <div className={taken >= 0 ? `${TICKETS} [&_.ticket-button]:pointer-events-none` : TICKETS} id="tickets" {...sway.container}>
          {tables.map((room, i) => (
            <Ticket
              key={room.code}
              data-i={i}
              header={t("rooms.reservation")}
              number={String(room.n).padStart(2, "0")}
              title={`${t("rooms.table")} ${room.n}`}
              serial={`${t("rooms.serial")} ${room.serial}`}
              rows={[
                { label: t("rooms.lang"), value: t(room.lang === "fr" ? "rooms.codeFr" : "rooms.codeEn") },
                { label: t("rooms.guests"), value: room.guests },
                { label: t("rooms.explorer.level"), value: t(`rooms.explorer.levels.${room.level}`) },
                { label: t("rooms.explorer.host"), value: shortName(room.host) },
                { label: t("rooms.explorer.state"), value: t(`rooms.explorer.status.${room.status}`) },
                { label: t("rooms.bots"), value: t(room.bots ? "rooms.yes" : "rooms.no"), highlight: room.bots },
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
    </section>
  );
}

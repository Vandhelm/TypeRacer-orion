import { useTranslation } from "react-i18next";
import { BotTag } from "../../players/BotTag";
import { seatNumber } from "../../rooms/seats";
import type { RoomState } from "./hooks/useRoom";
import { isPlayer } from "./room";
import { TEXT_TYPE_KEY, useRoomLabels } from "./useRoomLabels";

/** Live preview of the room's coupon, as it hangs in the kiosk. */
// On a phone the ticket shrinks to its list of players: the rest is already in the settings.
// The swaying string and the perforation stay in styles/pages/room/ticket.css.
const PAPER =
  "relative flex flex-col gap-[14px] border border-line bg-[#060606] px-[18px] pt-7 pb-0 phone:gap-0 phone:px-3 phone:pt-2 phone:pb-1.5 " +
  "after:pointer-events-none after:absolute after:inset-x-[5px] after:top-[5px] after:bottom-0 after:border-x after:border-t after:border-x-line-faint after:border-t-line-faint phone:after:hidden";
const SEAT = "flex min-w-0 items-center gap-[7px] font-mono text-[11px] leading-[1.2]";
const DIAMOND = "size-2 flex-none border [transform:rotate(45deg)]";
const NAME = "min-w-0 truncate";
// DES-05 : the seat number, the cue that is not a colour (the same number on the pond and the race track)
const NUMBER = "w-[2ch] flex-none text-right text-[10px] tabular-nums";

export function RoomTicket({ state }: { state: RoomState }) {
  const { t } = useTranslation();
  const { room, seats, players, humans, displayName } = state;
  const { durationLabel, lengthLabel, words } = useRoomLabels(room);
  const type = t(`room.${TEXT_TYPE_KEY[room.textType]}`);

  const rows = [
    { label: t("room.test"), value: room.textType === "custom" ? `${type} · ${words}` : `${type} · ${lengthLabel}` },
    { label: t("room.durationShort"), value: durationLabel(room.duration) },
    { label: t("room.language"), value: t(room.language === "en" ? "rooms.codeEn" : "rooms.codeFr") },
    { label: t("room.guests"), value: `${humans} / ${room.guests}` },
    { label: t("room.bots"), value: t(room.bots ? "room.yes" : "room.no").toUpperCase(), highlight: room.bots },
  ];

  return (
    <aside className="relative pt-(--hang) [--hang:26px] [grid-area:preview] phone:mt-3 phone:[--hang:0px]" aria-hidden="true">
      <div className="room-ticket">
        <div className={PAPER}>
          <i className="absolute top-2 left-1/2 z-2 size-[11px] rounded-[50%] border border-line bg-black [transform:translateX(-50%)] phone:hidden" />
          <p className="pl-[.26em] text-center font-mono text-[10px] leading-none font-medium tracking-[.26em] text-muted phone:hidden">{t("room.reservation")}</p>
          <div className="flex flex-col items-center gap-2 border-y border-y-line-soft py-3 phone:hidden">
            <span className="font-sans text-[46px] leading-none font-extralight tracking-[.02em] tabular-nums">{String(room.guests).padStart(2, "0")}</span>
            <span className="max-w-full text-center font-sans text-[11px] leading-[1.3] font-medium tracking-[.16em] uppercase wrap-anywhere">{displayName}</span>
          </div>
          <div className="flex flex-col gap-[11px] phone:hidden">
            {rows.map((row) => (
              <p className="flex items-center gap-1.5 after:order-1 after:flex-1 after:[border-top:1px_dotted_rgba(255,255,255,.22)]" key={row.label}>
                <span className="font-mono text-[11px] leading-none font-normal tracking-[.12em] text-[rgba(255,255,255,.7)]">{row.label}</span>
                <span className={`order-2 font-mono text-[12px] leading-none font-medium tracking-[.04em] ${row.highlight ? "text-red-text" : ""}`.trim()}>{row.value}</span>
              </p>
            ))}
          </div>
          <div className="room-ticket-perforation" />
          <p className="flex items-center justify-between pt-1 pb-2 font-mono text-[10px] leading-none font-normal tracking-[.24em] text-muted"><span>{t("room.players")}</span><span>{`${players.length} / ${room.guests}`}</span></p>
          <ul className="grid list-none gap-1.5 pb-[14px] phone:grid-cols-[repeat(2,minmax(0,1fr))] phone:gap-x-[14px]">
            {seats.map((seat, i) => {
              if (!isPlayer(seat)) {
                return <li key={i} className={`${SEAT} font-normal text-muted`}><span data-part="seat-number" className={NUMBER}>{seatNumber(i)}</span><i className={`${DIAMOND} border-[rgba(255,255,255,.35)]`} /><span className={NAME}>{t("room.freeSeat")}</span></li>;
              }
              const tag = [seat.host ? t("room.host").toUpperCase() : "", seat.me ? t("room.you") : ""].filter(Boolean).join(" · ");
              return (
                <li key={i} className={`${SEAT} ${seat.me ? "font-medium text-white" : "font-normal text-[rgba(255,255,255,.75)]"}`}>
                  <span data-part="seat-number" className={`${NUMBER} text-muted`}>{seatNumber(i)}</span>
                  <i className={`${DIAMOND} border-white`} style={{ background: seat.color }} />
                  <span className={NAME}>{seat.name}</span>
                  {tag && <span className={`ml-auto flex-none text-[10px] tracking-[.06em] ${seat.host ? "text-red-text" : "text-muted"}`}>{tag}</span>}
                  {/* BOT-04 : le même marqueur que sur la piste et le podium */}
                  {seat.bot && <BotTag className="ml-auto text-[10px]" />}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </aside>
  );
}

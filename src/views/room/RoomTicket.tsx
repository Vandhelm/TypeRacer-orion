import { useTranslation } from "react-i18next";
import type { RoomState } from "./hooks/useRoom";
import { isPlayer } from "./room";
import { TEXT_TYPE_KEY, useRoomLabels } from "./useRoomLabels";

/** Live preview of the room's coupon, as it hangs in the kiosk. */
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
    <aside className="room-preview" aria-hidden="true">
      <div className="room-ticket">
        <div className="room-ticket-paper">
          <i className="room-ticket-hole" />
          <p className="room-ticket-header">{t("room.reservation")}</p>
          <div className="room-ticket-number">
            <span className="room-ticket-digits">{String(room.guests).padStart(2, "0")}</span>
            <span className="room-ticket-name">{displayName}</span>
          </div>
          <div className="room-ticket-rows">
            {rows.map((row) => (
              <p className="room-ticket-row" key={row.label}>
                <span className="room-ticket-label">{row.label}</span>
                <span className={row.highlight ? "room-ticket-value yes" : "room-ticket-value"}>{row.value}</span>
              </p>
            ))}
          </div>
          <div className="room-ticket-perforation" />
          <p className="room-ticket-stub"><span>{t("room.players")}</span><span>{`${players.length} / ${room.guests}`}</span></p>
          <ul className="room-ticket-players">
            {seats.map((seat, i) => {
              if (!isPlayer(seat)) {
                return <li key={i} className="free"><i /><span className="name">{t("room.freeSeat")}</span></li>;
              }
              const tag = [seat.host ? t("room.host").toUpperCase() : "", seat.me ? t("room.you") : "", seat.bot ? t("room.bot") : ""].filter(Boolean).join(" · ");
              const classes = [seat.me && "me", seat.host && "host"].filter(Boolean).join(" ");
              return (
                <li key={i} className={classes || undefined}>
                  <i style={{ background: seat.color }} />
                  <span className="name">{seat.name}</span>
                  {tag && <span className="tag">{tag}</span>}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </aside>
  );
}

import { useTranslation } from "react-i18next";
import { BotTag } from "../../players/BotTag";
import { BOT_ACCURACIES, BOT_LEVELS, canAddBot, type RoomBot } from "../../rooms/bots";
import type { RoomState } from "./hooks/useRoom";
import { isPlayer, withBotAccuracy, withBotAdded, withBotLevel, withoutBot } from "./room";
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
const HEAD = "flex items-center justify-between pt-1 pb-2 font-mono text-[10px] leading-none font-normal tracking-[.24em] text-muted";
const LIST = "grid list-none gap-1.5 pb-[14px]";
const EMPTY = "pb-[14px] font-mono text-[11px] leading-[1.2] text-muted";
// CONF-10 : les réglages de chaque bot, dans le ticket ; soulignés en pointillés comme les autres champs du salon
const PICK =
  "min-w-0 flex-1 cursor-pointer appearance-none border-0 border-b border-dashed border-b-line-soft bg-transparent py-0.5 font-mono text-[10px] leading-[1.3] tracking-[.04em] text-white " +
  "hover:border-b-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-text [&>option]:bg-black";
const TICKET_BUTTON =
  "cursor-pointer border border-dashed border-line-soft bg-black px-2 py-1 font-mono text-[10px] leading-none tracking-[.12em] text-white uppercase " +
  "hover:border-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-text disabled:cursor-not-allowed disabled:text-muted disabled:hover:border-line-soft";

/** CONF-10 : la section des bots : chacun avec son niveau et sa précision, réglés ici par l'hôte, lus par les autres. */
function BotsPart({ state }: { state: RoomState }) {
  const { t } = useTranslation();
  const { room, seats, host, update } = state;
  // CONF-10 : les humains assis comptent dans la capacité ; un bot sans place attend qu'une place se libère
  const humans = seats.filter((seat) => isPlayer(seat) && !seat.bot).length;
  const colors = new Map(seats.filter(isPlayer).filter((seat) => seat.bot).map((seat) => [seat.name, seat.color]));
  const setBots = (botList: RoomBot[]) => update({ botList, bots: botList.length > 0 });
  const accuracyOf = (bot: RoomBot) => bot.accuracy ?? room.botAccuracy;
  return (
    <section aria-labelledby="ticket-bots">
      <h2 className={HEAD}><span id="ticket-bots">{t("room.bots")}</span><span aria-hidden="true">{room.bots ? room.botList.length : "—"}</span></h2>
      {!room.bots || !room.botList.length ? (
        <p className={EMPTY}>{t(room.bots ? "room.noBots" : "room.botsOff")}</p>
      ) : (
        <ul className={LIST}>
          {room.botList.map((bot) => {
            const color = colors.get(bot.name);
            return (
              <li key={bot.name} className="grid gap-1">
                <p className={`${SEAT} font-normal text-[rgba(255,255,255,.75)]`}>
                  <i className={`${DIAMOND} ${color ? "border-white" : "border-[rgba(255,255,255,.35)]"}`} style={color ? { background: color } : undefined} />
                  <span className={NAME}>{bot.name}</span>
                  {color ? <BotTag className="ml-auto text-[10px]" /> : <span className="ml-auto flex-none text-[10px] text-muted">{t("room.botWaiting")}</span>}
                  {host && (
                    <button type="button" className={`${TICKET_BUTTON} flex-none px-1.5`} aria-label={t("room.removeBotLabel", { name: bot.name })} onClick={() => setBots(withoutBot(room.botList, bot.name))}>×</button>
                  )}
                </p>
                {host ? (
                  <span className="flex gap-2 pl-[15px]">
                    <select className={PICK} aria-label={t("room.botLevelLabel", { name: bot.name })} value={bot.level} onChange={(e) => setBots(withBotLevel(room.botList, bot.name, e.target.value as RoomBot["level"]))}>
                      {BOT_LEVELS.map((level) => <option key={level} value={level}>{t(`room.level_${level}`)}</option>)}
                    </select>
                    <select className={PICK} aria-label={t("room.botAccuracyLabel", { name: bot.name })} value={accuracyOf(bot)} onChange={(e) => setBots(withBotAccuracy(room.botList, bot.name, e.target.value as (typeof BOT_ACCURACIES)[number]))}>
                      {BOT_ACCURACIES.map((accuracy) => <option key={accuracy} value={accuracy}>{t(`room.${accuracy}`)}</option>)}
                    </select>
                  </span>
                ) : (
                  <span className="pl-[15px] font-mono text-[10px] leading-[1.3] tracking-[.04em] text-muted">{`${t(`room.level_${bot.level}`)} · ${t(`room.${accuracyOf(bot)}`)}`}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {host && room.bots && (
        <p className="pb-[14px]">
          <button type="button" className={TICKET_BUTTON} onClick={() => setBots(withBotAdded(room.botList))} disabled={!canAddBot(room, humans)}>{t("room.addBot")}</button>
        </p>
      )}
    </section>
  );
}

export function RoomTicket({ state }: { state: RoomState }) {
  const { t } = useTranslation();
  const { room, seats, spectators = [], others = [], displayName } = state;
  const notMe = new Set(others.map((m) => m.key));
  const people = seats.filter((seat) => !isPlayer(seat) || !seat.bot);
  const { durationLabel, lengthLabel, words } = useRoomLabels(room);
  const type = t(`room.${TEXT_TYPE_KEY[room.textType]}`);

  const rows = [
    { label: t("room.test"), value: room.textType === "custom" ? `${type} · ${words}` : `${type} · ${lengthLabel}` },
    { label: t("room.durationShort"), value: durationLabel(room.duration) },
    { label: t("room.language"), value: t(room.language === "en" ? "rooms.codeEn" : "rooms.codeFr") },
    { label: t("room.guests"), value: `${state.humans} / ${room.guests}` },
    { label: t("room.bots"), value: t(room.bots ? "room.yes" : "room.no").toUpperCase(), highlight: room.bots },
  ];

  return (
    <aside className="relative pt-(--hang) [--hang:26px] [grid-area:preview] phone:mt-3 phone:[--hang:0px]" aria-label={t("room.reservation")}>
      <div className="room-ticket">
        <div className={PAPER}>
          <div className="contents" aria-hidden="true">
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
          {/* la liste lue par les lecteurs d'écran est celle de la page (section « Joueurs ») */}
          <p className={HEAD}><span>{t("room.players")}</span><span>{`${state.humans} / ${room.guests}`}</span></p>
          <ul className={`${LIST} phone:grid-cols-[repeat(2,minmax(0,1fr))] phone:gap-x-[14px]`}>
            {people.map((seat, i) => {
              if (!isPlayer(seat)) {
                return <li key={i} className={`${SEAT} font-normal text-muted`}><i className={`${DIAMOND} border-[rgba(255,255,255,.35)]`} /><span className={NAME}>{t("room.freeSeat")}</span></li>;
              }
              const tag = [seat.host ? t("room.host").toUpperCase() : "", seat.me ? t("room.you") : ""].filter(Boolean).join(" · ");
              return (
                <li key={i} className={`${SEAT} ${seat.me ? "font-medium text-white" : "font-normal text-[rgba(255,255,255,.75)]"}`}>
                  <i className={`${DIAMOND} border-white`} style={{ background: seat.color }} />
                  <span className={NAME}>{seat.name}</span>
                  {tag && <span className={`ml-auto flex-none text-[10px] tracking-[.06em] ${seat.host ? "text-red-text" : "text-muted"}`}>{tag}</span>}
                </li>
              );
            })}
          </ul>
          </div>
          <div className="room-ticket-perforation" />
          <BotsPart state={state} />
          <div className="room-ticket-perforation" />
          <div aria-hidden="true">
            <p className={HEAD}><span>{t("room.spectators")}</span><span>{spectators.length}</span></p>
            {spectators.length ? (
              <ul className={LIST}>
                {spectators.map((m) => (
                  <li key={m.key} className={`${SEAT} ${!notMe.has(m.key) ? "font-medium text-white" : "font-normal text-[rgba(255,255,255,.75)]"}`}>
                    <i className={`${DIAMOND} border-[rgba(255,255,255,.35)]`} />
                    <span className={NAME}>{m.name}</span>
                    {m.host && <span className="ml-auto flex-none text-[10px] tracking-[.06em] text-red-text">{t("room.host").toUpperCase()}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={EMPTY}>{t("room.noSpectators")}</p>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

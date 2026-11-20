import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { IconButton } from "../../components/buttons/IconButton";
import { CheckIcon, CopyIcon, MinusIcon, PlusIcon } from "../../components/icons";
import { allows } from "../../rooms/access";
import type { RoomState } from "./hooks/useRoom";
import { clampGuests, MAX_GUESTS, MIN_GUESTS } from "./room";
import { RoomInvites } from "./RoomInvites";
import { LABEL, SHADE } from "./styles";

/** Big numbers (guests, entry code) and the room name. */
const VALUE = "block font-sans text-[clamp(48px,10vh,92px)] leading-none font-light tabular-nums phone:text-[clamp(40px,12vw,64px)]";
// The room name sits on a dashed line; for the host, a white line grows under it while typing.
const NAME_BOX = "relative mt-1 flex border-b [border-bottom-style:dashed] after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-white";
const NAME_LINE =
  "after:origin-left after:[transform:scaleX(0)] after:transition-[transform] after:duration-[.35s] after:ease-[cubic-bezier(.2,.8,.2,1)] " +
  "focus-within:after:[transform:scaleX(1)] motion-reduce:after:transition-none";

export function RoomIntro({ state }: { state: RoomState }) {
  const { t } = useTranslation();
  const { room, update, host, humans } = state;
  const [nameDraft, setNameDraft] = useState(room.autoName ? "" : room.name);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef(0);
  const plus = useRef<HTMLButtonElement>(null);
  const minus = useRef<HTMLButtonElement>(null);
  const minGuests = Math.max(MIN_GUESTS, humans);

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  function changeName(value: string) {
    const trimmed = value.trim();
    setNameDraft(trimmed ? value : "");
    update(trimmed ? { autoName: false, name: trimmed } : { autoName: true });
  }

  function changeGuests(delta: 1 | -1) {
    const next = clampGuests(room.guests + delta, room.guests);
    flushSync(() => update({ guests: next }));
    // le bouton vient de se désactiver : le focus passe à l'autre
    if (delta > 0 && next >= MAX_GUESTS) minus.current?.focus();
    if (delta < 0 && next <= minGuests) plus.current?.focus();
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(room.code);
    } catch {
      return;
    }
    setCopied(true);
    clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(false), 1500);
  }

  // Salon privé : le code n'ouvre rien, seul un lien d'invitation compte (SALLE-03, SALLE-04 : RoomInvites).
  const byCode = allows(room.visibility, "code");

  return (
    <div className="[grid-area:left]">
      <div className="flex flex-wrap gap-x-[clamp(32px,5vw,72px)] gap-y-[clamp(16px,3vh,28px)]">
        <div className={SHADE} role="group" aria-labelledby="guests-label">
          <span className={LABEL} id="guests-label">{t("room.guests")}</span>
          <div className="mt-2 flex items-center gap-3">
            <output className={VALUE} aria-live="polite">{room.guests}</output>
            <div className="flex flex-col gap-1" hidden={!host}>
              <IconButton ref={plus} label={t("room.addGuest")} disabled={room.guests >= MAX_GUESTS} onClick={() => changeGuests(1)}><PlusIcon /></IconButton>
              <IconButton ref={minus} label={t("room.removeGuest")} disabled={room.guests <= minGuests} onClick={() => changeGuests(-1)}><MinusIcon /></IconButton>
            </div>
          </div>
        </div>
        <div className={SHADE}>
          <span className={LABEL}>{t(byCode ? "room.entryCode" : "room.inviteOnly")}</span>
          <div className="mt-2 flex items-center gap-3">
            <span className={`${VALUE} tracking-[.04em]`}>{byCode ? room.code : t("room.link")}</span>
            {byCode && (
              <IconButton label={t(copied ? "room.codeCopied" : "room.copy")} confirmed={copied} onClick={copyCode}>
                {copied ? <CheckIcon /> : <CopyIcon />}
              </IconButton>
            )}
          </div>
        </div>
      </div>
      <div className={`${SHADE} mt-[clamp(20px,4vh,36px)] max-w-[640px] phone:mt-3`}>
        <label className={LABEL} htmlFor="room-name">{t("room.roomName")}</label>
        <div className={host ? `${NAME_BOX} border-b-line-soft ${NAME_LINE}` : `${NAME_BOX} border-b-transparent after:hidden`}>
          <input
            className={`unset h-[52px] min-w-0 flex-1 font-sans text-[clamp(22px,3.4vh,32px)] leading-[1.1] font-light text-white caret-red-text placeholder:text-muted ${host ? "" : "cursor-default"}`}
            id="room-name"
            name="name"
            type="text"
            autoComplete="off"
            spellCheck={false}
            maxLength={28}
            placeholder={t("room.defaultName")}
            value={host ? nameDraft : room.name}
            readOnly={!host}
            tabIndex={host ? undefined : -1}
            onChange={(e) => changeName(e.target.value)}
          />
        </div>
      </div>
      <RoomInvites state={state} />
    </div>
  );
}

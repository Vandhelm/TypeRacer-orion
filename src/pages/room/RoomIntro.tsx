import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { IconButton } from "../../components/buttons/IconButton";
import { CheckIcon, CopyIcon, LinkIcon, MinusIcon, PlusIcon } from "../../components/icons";
import { allows } from "../../rooms/access";
import type { RoomState } from "./hooks/useRoom";
import { clampGuests, MAX_GUESTS, MIN_GUESTS } from "./room";

/** Big numbers (guests, entry code) and the room name. */
export function RoomIntro({ state }: { state: RoomState }) {
  const { t } = useTranslation();
  const { room, update, host, humans } = state;
  const [nameDraft, setNameDraft] = useState(room.autoName ? "" : room.name);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
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

  async function copy(what: "code" | "link") {
    const text = what === "code" ? room.code : `${location.origin}/room?invite=${room.invite}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    setCopied(what);
    clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(null), 1500);
  }

  // Salon privé : le code n'ouvre rien, seul le lien d'invitation compte (SALLE-03).
  const byCode = allows(room.visibility, "code");

  return (
    <div className="[grid-area:left]">
      <div className="room-hero">
        <div className="room-shade" role="group" aria-labelledby="guests-label">
          <span className="room-label" id="guests-label">{t("room.guests")}</span>
          <div className="room-value-row">
            <output className="room-value" aria-live="polite">{room.guests}</output>
            <div className="flex flex-col gap-1" hidden={!host}>
              <IconButton ref={plus} label={t("room.addGuest")} disabled={room.guests >= MAX_GUESTS} onClick={() => changeGuests(1)}><PlusIcon /></IconButton>
              <IconButton ref={minus} label={t("room.removeGuest")} disabled={room.guests <= minGuests} onClick={() => changeGuests(-1)}><MinusIcon /></IconButton>
            </div>
          </div>
        </div>
        <div className="room-shade">
          <span className="room-label">{t(byCode ? "room.entryCode" : "room.inviteOnly")}</span>
          <div className="room-value-row">
            <span className="room-value room-code">{byCode ? room.code : t("room.link")}</span>
            {byCode && (
              <IconButton label={t(copied === "code" ? "room.codeCopied" : "room.copy")} confirmed={copied === "code"} onClick={() => copy("code")}>
                {copied === "code" ? <CheckIcon /> : <CopyIcon />}
              </IconButton>
            )}
            <IconButton label={t(copied === "link" ? "room.linkCopied" : "room.copyLink")} confirmed={copied === "link"} onClick={() => copy("link")}>
              {copied === "link" ? <CheckIcon /> : <LinkIcon />}
            </IconButton>
          </div>
        </div>
      </div>
      <div className="room-shade room-name">
        <label className="room-label" htmlFor="room-name">{t("room.roomName")}</label>
        <div className="room-name-box">
          <input
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
    </div>
  );
}

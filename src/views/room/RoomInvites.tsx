import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IconButton } from "../../components/buttons/IconButton";
import { SmallButton } from "../../components/buttons/SmallButton";
import { CheckIcon, LinkIcon } from "../../components/icons";
import { useInvites } from "./hooks/useInvites";
import { inviteHref, inviteStatus } from "./invites";
import type { RoomState } from "./hooks/useRoom";

/** SALLE-04 : l'hôte génère un lien par invité, le copie et voit qui l'a utilisé. Rien pour les autres membres. */
export function RoomInvites({ state }: { state: RoomState }) {
  const { t } = useTranslation();
  const { invites, error, busy, create } = useInvites(state.room.code, state.host, state.members);
  const [copied, setCopied] = useState<string | null>(null);
  /** Copie impossible (presse-papiers refusé, HTTP) : l'adresse de ce lien s'affiche, à sélectionner. */
  const [shown, setShown] = useState<string | null>(null);
  const timer = useRef(0);

  useEffect(() => () => clearTimeout(timer.current), []);

  if (!state.host) return null;

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(inviteHref(location.origin, token));
    } catch {
      setShown(token);
      return;
    }
    setShown(null);
    setCopied(token);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(null), 1500);
  }

  async function createAndCopy() {
    const invite = await create();
    if (invite) await copy(invite.token);
  }

  return (
    <section className="room-shade room-invites" aria-labelledby="invites-label">
      <div className="room-invites-head">
        <h2 className="room-label" id="invites-label">{t("room.invites")}</h2>
        <SmallButton onClick={createAndCopy} disabled={busy}>{t("room.newInvite")}</SmallButton>
      </div>
      {error && <p className="room-invites-error" role="alert">{t(`room.errors.${error}`)}</p>}
      {invites.length === 0 ? (
        <p className="room-invites-empty">{t("room.noInvite")}</p>
      ) : (
        <ol className="room-invites-list">
          {invites.map((invite, index) => {
            const status = inviteStatus(invite);
            const done = copied === invite.token;
            return (
              <li key={invite.token} className={`room-invite room-invite-${invite.status}`}>
                <span className="room-invite-name">{t("room.inviteN", { n: index + 1 })}</span>
                <span className="room-invite-status">{t(status.key, { name: status.name })}</span>
                {invite.status !== "revoked" && (
                  <IconButton label={t(done ? "room.linkCopied" : "room.copyInviteN", { n: index + 1 })} confirmed={done} onClick={() => copy(invite.token)}>
                    {done ? <CheckIcon /> : <LinkIcon />}
                  </IconButton>
                )}
                {shown === invite.token && (
                  <label className="room-invite-url">
                    <span>{t("room.copyManually")}</span>
                    <input type="text" readOnly autoFocus value={inviteHref(location.origin, invite.token)} aria-label={t("room.inviteUrlN", { n: index + 1 })} onFocus={(e) => e.currentTarget.select()} />
                  </label>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

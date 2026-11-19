import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IconButton } from "../../components/buttons/IconButton";
import { SmallButton } from "../../components/buttons/SmallButton";
import { CheckIcon, LinkIcon } from "../../components/icons";
import { useInvites } from "./hooks/useInvites";
import { inviteHref, inviteStatus } from "./invites";
import type { RoomState } from "./hooks/useRoom";
import { LABEL, SHADE } from "./styles";

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
    <section className={`${SHADE} mt-[clamp(20px,4vh,36px)] max-w-[640px]`} aria-labelledby="invites-label">
      <div className="flex items-center justify-between gap-3">
        <h2 className={LABEL} id="invites-label">{t("room.invites")}</h2>
        <SmallButton onClick={createAndCopy} disabled={busy}>{t("room.newInvite")}</SmallButton>
      </div>
      {error && <p className="mt-2.5 font-mono text-[max(12px,1.4vh)] leading-[1.4] text-red-text" role="alert">{t(`room.errors.${error}`)}</p>}
      {invites.length === 0 ? (
        <p className="mt-2.5 font-mono text-[max(12px,1.4vh)] leading-[1.4] text-muted">{t("room.noInvite")}</p>
      ) : (
        // sans défilement propre : une liste qui défile couperait l'infobulle du bouton copier (barre horizontale à 360 px)
        <ol className="mt-2 list-none p-0">
          {invites.map((invite, index) => {
            const status = inviteStatus(invite);
            const done = copied === invite.token;
            return (
              <li
                key={invite.token}
                className={`room-invite grid min-h-[44px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-dashed border-line-soft font-mono text-[max(12px,1.4vh)] leading-[1.3] ${invite.status === "revoked" ? "opacity-60" : ""}`}>
                <span className="tracking-[.1em] uppercase">{t("room.inviteN", { n: index + 1 })}</span>
                <span className={`overflow-hidden text-ellipsis whitespace-nowrap ${invite.status === "used" ? "" : "text-muted"}`}>{t(status.key, { name: status.name })}</span>
                {invite.status !== "revoked" && (
                  <IconButton label={t(done ? "room.linkCopied" : "room.copyInviteN", { n: index + 1 })} confirmed={done} onClick={() => copy(invite.token)}>
                    {done ? <CheckIcon /> : <LinkIcon />}
                  </IconButton>
                )}
                {shown === invite.token && (
                  <label className="col-span-full grid gap-1 pb-2 text-muted">
                    <span>{t("room.copyManually")}</span>
                    <input
                      className="min-w-0 rounded-[6px] border border-line-soft bg-transparent px-2 py-1.5 text-white [font:inherit] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                      type="text"
                      readOnly
                      autoFocus value={inviteHref(location.origin, invite.token)} aria-label={t("room.inviteUrlN", { n: index + 1 })} onFocus={(e) => e.currentTarget.select()} />
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

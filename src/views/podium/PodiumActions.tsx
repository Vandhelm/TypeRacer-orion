// COURSE-11 : les actions sous le podium d'une course jouée. L'hôte relance (retour au salon, réglages ouverts) ou ferme
// la salle, après confirmation ; les autres attendent l'hôte ou quittent. Le serveur refuse tout autre que l'hôte (SEC-01).
import { useState } from "react";
import { useTranslation } from "react-i18next";

/** host : dit par le serveur (null tant qu'il n'a pas répondu) ; close renvoie le code du refus, ou null. */
export type AfterRaceControls = { host: boolean | null; close: () => Promise<string | null>; leave: () => void };

const CLOSE_ERRORS = new Set(["not_host", "in_race", "not_found", "network"]);
const NOTE = "m-0 text-center font-mono text-[max(7px,.5vw)] leading-[1.4] font-normal";

type ViewProps = {
  roomHref: string;
  host: boolean | null;
  confirming: boolean;
  error: string | null;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  onLeave: () => void;
};

/** Le rendu seul, selon l'état : testable sans navigateur. */
export function PodiumActionsView({ roomHref, host, confirming, error, onAsk, onCancel, onConfirm, onLeave }: ViewProps) {
  const { t } = useTranslation();
  const failed = error && <p className={`${NOTE} text-red-text`} role="alert">{t(`podium.closeErrors.${CLOSE_ERRORS.has(error) ? error : "network"}`)}</p>;
  if (host && confirming) {
    return (
      <>
        <p className={`${NOTE} text-white`} id="podium-close-confirm">{t("podium.closeConfirm")}</p>
        <button type="button" className="unset podium-play" aria-describedby="podium-close-confirm" onClick={onConfirm}>{t("podium.closeYes")}</button>
        <button type="button" className="unset podium-back" onClick={onCancel}>{t("podium.closeNo")}</button>
        {failed}
      </>
    );
  }
  if (host) {
    return (
      <>
        <a className="podium-play" href={roomHref}>{t("podium.relaunch")}</a>
        <button type="button" className="unset podium-back" onClick={onAsk}>{t("podium.closeRoom")}</button>
        {failed}
      </>
    );
  }
  return (
    <>
      {host === false && <p className={`${NOTE} text-muted`} role="status">{t("podium.waitHost")}</p>}
      <a className="podium-back" href={roomHref}>{t("game.backToRoom")}</a>
      {host === false && <button type="button" className="unset podium-back" onClick={onLeave}>{t("podium.leaveRoom")}</button>}
    </>
  );
}

export function PodiumActions({ roomHref, after }: { roomHref: string; after?: AfterRaceControls }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (!after || busy) return; // double clic : une seule demande
    setBusy(true);
    setError(await after.close());
    setBusy(false);
  }

  return (
    <PodiumActionsView
      roomHref={roomHref}
      host={after?.host ?? null}
      confirming={confirming}
      error={error}
      onAsk={() => setConfirming(true)}
      onCancel={() => {
        setConfirming(false);
        setError(null);
      }}
      onConfirm={() => void confirm()}
      onLeave={() => after?.leave()}
    />
  );
}

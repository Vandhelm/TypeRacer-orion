// COURSE-07 : le bouton « Abandonner » d'un coureur et sa confirmation. Le serveur refuse un spectateur, un abandon
// hors course ou après l'arrivée (SEC-01) ; la page ne montre le bouton qu'aux coureurs.
// Pendant la question, le clavier reste dans la boîte (dialogKey) : Tab y tourne, Échap ferme, la frappe ne fait pas
// avancer la course ; à la fermeture, le focus revient sur « Abandonner ».
import { useEffect, useReducer, useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { abandonStep, dialogKey, requestAbandon, type AbandonStep } from "./abandon";

const ERRORS = new Set(["not_racing", "already_finished", "not_player", "not_found", "network"]);
// Same look as the hanging "Leave" sign, smaller and without the wires
const TRIGGER =
  "unset relative z-1 mr-auto ml-[clamp(150px,14vw,190px)] flex min-h-[34px] cursor-pointer items-center border border-line bg-black px-3 font-mono text-[11px] leading-none font-medium tracking-[.2em] text-white uppercase " +
  "[box-shadow:inset_0_0_0_3px_#000,inset_0_0_0_4px_var(--color-line-faint)] transition-[background,color] duration-200 hover:bg-[#f2f2f2] hover:text-black " +
  "focus-visible:outline focus-visible:outline-offset-4 focus-visible:outline-white compact:ml-0 narrow:px-2 narrow:text-[10px]";
const BUTTON =
  "unset flex min-h-[38px] cursor-pointer items-center justify-center px-4 font-sans text-[12px] leading-none font-medium tracking-[.18em] uppercase transition-[background,color,border-color] duration-200 " +
  "focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-white";

type ViewProps = {
  step: AbandonStep;
  error: string | null;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  triggerRef?: RefObject<HTMLButtonElement | null>;
  dialogRef?: RefObject<HTMLDivElement | null>;
};

/** Le rendu seul, selon l'étape : testable sans navigateur. */
export function AbandonRaceView({ step, error, onAsk, onCancel, onConfirm, triggerRef, dialogRef }: ViewProps) {
  const { t } = useTranslation();
  if (step === "idle") {
    return <button ref={triggerRef} type="button" className={TRIGGER} onClick={onAsk}>{t("game.abandon.button")}</button>;
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,.82)] p-6">
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="game-abandon-title"
        aria-describedby="game-abandon-body"
        className="flex w-[min(420px,100%)] flex-col gap-4 border border-line bg-black px-6 py-5 text-center font-mono text-white [box-shadow:inset_0_0_0_4px_#000,inset_0_0_0_5px_var(--color-line-faint)]"
      >
        <h2 id="game-abandon-title" className="m-0 text-[13px] leading-[1.4] font-medium tracking-[.2em] uppercase">{t("game.abandon.title")}</h2>
        <p id="game-abandon-body" className="m-0 text-[12px] leading-[1.6] text-muted">{t("game.abandon.body")}</p>
        {error && <p className="m-0 text-[12px] leading-[1.4] text-red-text" role="alert">{t(`game.abandon.errors.${ERRORS.has(error) ? error : "network"}`)}</p>}
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" className={`${BUTTON} border border-[rgba(255,140,120,.45)] bg-red-solid text-white hover:bg-red-hover`} disabled={step === "sending"} onClick={onConfirm}>
            {t("game.abandon.confirm")}
          </button>
          {/* the safe choice gets the focus: Enter right after the question does not abandon */}
          <button type="button" autoFocus className={`${BUTTON} border border-line-soft bg-black text-white hover:border-[#f2f2f2] hover:bg-[#f2f2f2] hover:text-black`} disabled={step === "sending"} onClick={onCancel}>
            {t("game.abandon.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Tant que la question est posée : le clavier est capté avant la zone de frappe (fenêtre, phase de capture) et le focus
 * ne sort pas de la boîte. `onClose` : Échap.
 */
function useDialogKeyboard(open: boolean, dialogRef: RefObject<HTMLDivElement | null>, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const buttons = () => [...(dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? [])];
    function onKeyDown(event: KeyboardEvent) {
      const dialog = dialogRef.current;
      const inside = !!dialog && event.target instanceof Node && dialog.contains(event.target);
      const list = buttons();
      const action = dialogKey({ key: event.key, shift: event.shiftKey, focused: list.findIndex((b) => b === document.activeElement), count: list.length, inside });
      if (action.type === "pass") return;
      event.preventDefault();
      event.stopPropagation();
      if (action.type === "close") onClose();
      if (action.type === "focus") list[action.index]?.focus();
    }
    // un clic hors de la boîte ou un script qui rend le focus à la zone de frappe : il revient dans la boîte
    function onFocusIn(event: FocusEvent) {
      const dialog = dialogRef.current;
      if (dialog && event.target instanceof Node && !dialog.contains(event.target)) buttons().at(-1)?.focus();
    }
    window.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", onFocusIn, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocusIn, true);
    };
  }, [open, dialogRef, onClose]);
}

/** onAbandoned : appelé une fois, quand le serveur a enregistré l'abandon ; onSending : la demande part (true) ou échoue (false). */
export function AbandonRace({ code, onAbandoned, onSending }: { code: string; onAbandoned: () => void; onSending?: (sending: boolean) => void }) {
  const [step, dispatch] = useReducer(abandonStep, "idle");
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const asked = useRef(false);

  // à la fermeture de la question (annulation, Échap), le focus revient sur « Abandonner »
  useEffect(() => {
    if (step === "idle" && asked.current) triggerRef.current?.focus();
    if (step !== "idle") asked.current = true;
  }, [step]);

  const [cancel] = useState(() => () => {
    setError(null);
    dispatch("cancel");
  });
  useDialogKeyboard(step !== "idle", dialogRef, cancel);

  async function confirm() {
    if (step !== "confirming") return; // double clic : une seule demande
    dispatch("confirm");
    setError(null);
    onSending?.(true);
    const refused = await requestAbandon(code);
    if (refused) {
      onSending?.(false);
      setError(refused);
      dispatch("failed");
      return;
    }
    onAbandoned();
  }

  return <AbandonRaceView step={step} error={error} onAsk={() => dispatch("ask")} onCancel={cancel} onConfirm={() => void confirm()} triggerRef={triggerRef} dialogRef={dialogRef} />;
}

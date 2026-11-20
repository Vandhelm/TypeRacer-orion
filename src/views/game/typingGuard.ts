// COURSE-04 : seule la frappe au clavier écrit dans la zone de frappe. Coller (clavier, menu, clic du milieu),
// glisser-déposer, correction automatique et annuler/rétablir sont refusés ; frappe, touches mortes, IME et effacement passent.

/** Liste blanche : tout autre type d'insertion (insertFromPaste, insertFromDrop, insertReplacementText…) est refusé. */
const KEYBOARD_INPUT = new Set([
  "insertText",
  "insertCompositionText",
  "insertFromComposition",
  "deleteCompositionText",
  "deleteByComposition",
  "deleteContentBackward",
  "deleteContentForward",
  "deleteWordBackward",
  "deleteWordForward",
  "deleteSoftLineBackward",
  "deleteSoftLineForward",
  "deleteHardLineBackward",
  "deleteHardLineForward",
]);

export const isKeyboardInput = (inputType: unknown) => typeof inputType === "string" && KEYBOARD_INPUT.has(inputType);

const MIDDLE_BUTTON = 1;

/** Branche les refus sur le champ ; renvoie de quoi les retirer. */
export function guardTypingField(field: EventTarget): () => void {
  const refuse = (event: Event) => event.preventDefault();
  const handlers: [string, (event: Event) => void][] = [
    ["beforeinput", (event) => { if (!isKeyboardInput((event as InputEvent).inputType)) event.preventDefault(); }],
    ["paste", refuse],
    ["dragenter", refuse],
    ["dragover", refuse],
    ["drop", refuse],
    // clic du milieu : sous Linux, il colle la sélection primaire
    ["mousedown", (event) => { if ((event as MouseEvent).button === MIDDLE_BUTTON) event.preventDefault(); }],
    ["auxclick", (event) => { if ((event as MouseEvent).button === MIDDLE_BUTTON) event.preventDefault(); }],
  ];
  handlers.forEach(([type, handler]) => field.addEventListener(type, handler));
  return () => handlers.forEach(([type, handler]) => field.removeEventListener(type, handler));
}

/**
 * Touche morte ou IME : la lettre en cours de composition (« ´ ») s'affiche dans le champ sans être comptée ;
 * seule la lettre finale (« é ») part à la course, une seule fois (Safari envoie encore un input après compositionend).
 */
export type TypingDraft = { draft: string | null; committed: string | null };
export type TypingEvent = { kind: "change"; value: string; composing: boolean } | { kind: "end"; value: string };

export function typingStep(state: TypingDraft, event: TypingEvent): { state: TypingDraft; send: string | null } {
  if (event.kind === "end") return { state: { draft: null, committed: event.value }, send: event.value };
  if (event.composing) return { state: { draft: event.value, committed: null }, send: null };
  const idle = { draft: null, committed: null };
  return { state: idle, send: event.value === state.committed ? null : event.value };
}

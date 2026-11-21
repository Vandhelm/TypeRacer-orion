import { describe, expect, test } from "bun:test";
import { guardTypingField, isKeyboardInput, typingStep, type TypingDraft } from "./typingGuard";

/** A cancelable DOM event, with the fields the guard reads. */
function fire(target: EventTarget, type: string, fields: Record<string, unknown> = {}) {
  const event = Object.assign(new Event(type, { cancelable: true }), fields);
  target.dispatchEvent(event);
  return event.defaultPrevented;
}

describe("COURSE-04 — only keystrokes reach the typing field", () => {
  test("beforeinput from a paste, a drop or an autocorrect replacement is refused", () => {
    const field = new EventTarget();
    guardTypingField(field);
    for (const inputType of ["insertFromPaste", "insertFromPasteAsQuotation", "insertFromDrop", "insertReplacementText", "insertFromYank", "insertLink", "historyUndo", "historyRedo"]) {
      expect(fire(field, "beforeinput", { inputType })).toBe(true);
    }
  });

  test("beforeinput from typing, dead keys, an IME or erasing goes through", () => {
    const field = new EventTarget();
    guardTypingField(field);
    for (const inputType of ["insertText", "insertCompositionText", "insertFromComposition", "deleteCompositionText", "deleteContentBackward", "deleteContentForward", "deleteWordBackward"]) {
      expect(fire(field, "beforeinput", { inputType })).toBe(false);
    }
  });

  test("a beforeinput without a known type is refused", () => {
    const field = new EventTarget();
    guardTypingField(field);
    expect(fire(field, "beforeinput")).toBe(true);
    expect(fire(field, "beforeinput", { inputType: 42 })).toBe(true);
    expect(fire(field, "beforeinput", { inputType: "" })).toBe(true);
  });

  test("paste (keyboard, menu, Ctrl/Cmd+V) is refused", () => {
    const field = new EventTarget();
    guardTypingField(field);
    expect(fire(field, "paste")).toBe(true);
  });

  test("drag and drop onto the field is refused", () => {
    const field = new EventTarget();
    guardTypingField(field);
    expect(fire(field, "dragenter")).toBe(true);
    expect(fire(field, "dragover")).toBe(true);
    expect(fire(field, "drop")).toBe(true);
  });

  test("a middle click (primary selection paste) is refused, a left click is not", () => {
    const field = new EventTarget();
    guardTypingField(field);
    expect(fire(field, "mousedown", { button: 1 })).toBe(true);
    expect(fire(field, "auxclick", { button: 1 })).toBe(true);
    expect(fire(field, "mousedown", { button: 0 })).toBe(false);
  });

  test("removing the guard lets events through again", () => {
    const field = new EventTarget();
    guardTypingField(field)();
    expect(fire(field, "paste")).toBe(false);
  });

  test("isKeyboardInput only accepts typing, composition and erasing", () => {
    expect(isKeyboardInput("insertText")).toBe(true);
    expect(isKeyboardInput("insertFromPaste")).toBe(false);
    expect(isKeyboardInput("insertFromDrop")).toBe(false);
    expect(isKeyboardInput("insertReplacementText")).toBe(false);
  });
});

describe("COURSE-04 — dead keys and IME are counted once, on their final letter", () => {
  const idle: TypingDraft = { draft: null, committed: null };

  test("a plain keystroke is sent at once", () => {
    expect(typingStep(idle, { kind: "change", value: "l", composing: false })).toEqual({ state: idle, send: "l" });
  });

  test("the dead key's mark is shown but not sent, the accented letter is sent at the end", () => {
    const mark = typingStep(idle, { kind: "change", value: "´", composing: true });
    expect(mark).toEqual({ state: { draft: "´", committed: null }, send: null });
    const accent = typingStep(mark.state, { kind: "change", value: "é", composing: true });
    expect(accent.send).toBeNull();
    const end = typingStep(accent.state, { kind: "end", value: "é" });
    expect(end).toEqual({ state: { draft: null, committed: "é" }, send: "é" });
  });

  test("Safari's input after compositionend does not send the letter twice", () => {
    const after = typingStep({ draft: null, committed: "é" }, { kind: "change", value: "é", composing: false });
    expect(after).toEqual({ state: idle, send: null });
  });

  test("the next keystroke after a composition is sent", () => {
    const next = typingStep({ draft: null, committed: "é" }, { kind: "change", value: "ét", composing: false });
    expect(next).toEqual({ state: idle, send: "ét" });
  });
});

import { useImperativeHandle, useRef, useState, type ChangeEvent, type Ref } from "react";
import { useTranslation } from "react-i18next";
import { SMALL_BUTTON, SmallButton } from "../../components/buttons/SmallButton";
import { formatNumber } from "../../i18n/format";
import { countWords, MAX_TEXT_LENGTH, readSavedTexts, writeSavedTexts, type SavedText } from "./room";
import { LABEL } from "./styles";

const TEXT_TOOLS = {
  typography: (v: string) => v.replace(/[‘’‚‛]/g, "'").replace(/[“”„‟«»]/g, '"').replace(/[–—―]/g, "-").replace(/…/g, "...").replace(/ /g, " "),
  control: (v: string) => v.replace(/\\n/g, "\n").replace(/\\t/g, "\t"),
  space: (v: string) => v.replace(/\s*[\r\n]+\s*/g, " "),
  period: (v: string) => v.replace(/([^.!?:;,\s])\s*[\r\n]+\s*/g, "$1. ").replace(/\s*[\r\n]+\s*/g, " "),
  lowercase: (v: string) => v.toLocaleLowerCase(),
  shuffle: (v: string) => {
    const words = v.trim().split(/\s+/);
    for (let i = words.length - 1; i > 0; i--) {
      const k = Math.floor(Math.random() * (i + 1));
      [words[i], words[k]] = [words[k]!, words[i]!];
    }
    return words.join(" ");
  },
};
type ToolName = keyof typeof TEXT_TOOLS;

const TOOLS: { title: string; help: string; buttons: [ToolName, string][] }[] = [
  { title: "toolTypography", help: "helpTypography", buttons: [["typography", "apply"]] },
  { title: "toolControl", help: "helpControl", buttons: [["control", "apply"]] },
  { title: "toolLines", help: "helpLines", buttons: [["space", "space"], ["period", "periodSpace"]] },
  { title: "toolOther", help: "helpOther", buttons: [["lowercase", "lowercase"], ["shuffle", "shuffle"]] },
];

const SAVED = "flex items-center gap-2 border-b border-b-line-faint [border-bottom-style:dashed] font-mono text-[12px] leading-[1.3] font-normal";

export type TextEditorHandle = { open(): void };
type TextEditorDialogProps = { text: string; onUse: (text: string) => void; ref?: Ref<TextEditorHandle> };

/** Modal editor for the custom text: cleanup tools, import, saved texts. */
export function TextEditorDialog({ text, onUse, ref }: TextEditorDialogProps) {
  const { t, i18n } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState("");
  const [saveName, setSaveName] = useState("");
  const [saved, setSaved] = useState<SavedText[] | null>(null);
  const words = countWords(draft);

  useImperativeHandle(ref, () => ({
    open() {
      setDraft(text);
      setSaved(readSavedTexts());
      dialog.current?.showModal();
      area.current?.focus();
    },
  }), [text]);

  const close = () => dialog.current?.close();

  function persist(list: SavedText[]) {
    writeSavedTexts(list);
    setSaved(list);
  }
  function save() {
    const content = draft.trim();
    if (!content) return;
    const name = saveName.trim() || content.slice(0, 30);
    persist([{ name, text: content }, ...readSavedTexts().filter((s) => s.name !== name)].slice(0, 20));
    setSaveName("");
  }
  function remove(index: number) {
    persist(readSavedTexts().filter((_, i) => i !== index));
  }
  function importFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then((value) => setDraft(value.slice(0, MAX_TEXT_LENGTH)));
    e.target.value = "";
  }
  function use() {
    onUse(draft.trim());
    close();
  }

  return (
    <dialog
      ref={dialog}
      className="fixed inset-0 m-auto max-h-[calc(100vh-32px)] w-[min(780px,calc(100vw-32px))] overflow-y-auto border border-line bg-black p-0 text-white backdrop:bg-[rgba(0,0,0,.82)]" aria-labelledby="editor-title" onClick={(e) => e.target === dialog.current && close()}>
      <div className="p-[clamp(18px,3vh,28px)]">
        <h2 className="mb-[14px] font-sans text-[clamp(20px,3vh,28px)] leading-[1.1] font-light tracking-[.1em]" id="editor-title">{t("room.editorTitle")}</h2>
        <div className="mb-4 grid grid-cols-[repeat(2,minmax(0,1fr))] gap-x-6 gap-y-3 phone:grid-cols-[minmax(0,1fr)]">
          {TOOLS.map((tool) => (
            <div className="grid grid-rows-[auto_1fr_auto] [&_.small-button]:flex-1 [&_.small-button]:justify-center" key={tool.title}>
              <span className={LABEL}>{t(`room.${tool.title}`)}</span>
              <p className="mt-1 mb-2.5 font-mono text-[max(11px,1.2vh)] leading-[1.4] font-normal text-muted">{t(`room.${tool.help}`)}</p>
              <div className="flex gap-2">
                {tool.buttons.map(([name, label]) => (
                  <SmallButton key={name} onClick={() => setDraft(TEXT_TOOLS[name](draft))}>{t(`room.${label}`)}</SmallButton>
                ))}
              </div>
            </div>
          ))}
        </div>
        <label className="sr-only" htmlFor="editor-text">{t("room.editorTitle")}</label>
        <textarea
          ref={area}
          className="block h-[clamp(120px,26vh,260px)] w-full resize-y rounded-none border border-line bg-black p-3 font-mono text-[max(15px,1.9vh)] leading-[1.5] font-normal text-white caret-red-text focus:outline focus:outline-offset-2 focus:outline-white"
          id="editor-text" maxLength={MAX_TEXT_LENGTH} spellCheck={false} value={draft} onChange={(e) => setDraft(e.target.value)} />
        <p className="mt-2 mb-[14px] flex items-center justify-between gap-3 font-mono text-[max(11px,1.2vh)] leading-[1.4] font-normal text-muted"><span>{`${formatNumber(i18n.language, words)} ${t("room.wordsUnit")}`}</span><span>{t("room.maxChars", { n: formatNumber(i18n.language, MAX_TEXT_LENGTH) })}</span></p>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {/* A11Y-03 : le placeholder ne suffit pas comme libellé (il disparaît à la saisie) */}
          <label className="sr-only" htmlFor="editor-text-name">{t("room.textName")}</label>
          <input
            id="editor-text-name"
            className="unset box-border h-10 min-w-0 flex-[1_1_180px] border-b border-b-line-soft [border-bottom-style:dashed] font-mono text-[14px] leading-none font-normal text-white placeholder:text-muted focus:border-b-white"
            type="text" maxLength={40} autoComplete="off" placeholder={t("room.textName")} value={saveName} onChange={(e) => setSaveName(e.target.value)} />
          <SmallButton onClick={save}>{t("room.save")}</SmallButton>
          <label className={`${SMALL_BUTTON} relative overflow-hidden`}>
            <span>{t("room.import")}</span>
            <input className="absolute inset-0 size-full cursor-pointer opacity-0" type="file" accept=".txt,text/plain" onChange={importFile} />
          </label>
        </div>
        <span className={LABEL}>{t("room.savedTexts")}</span>
        <ul className="mb-[14px] list-none">
          {saved?.length === 0 && <li className={`${SAVED} min-h-[36px] text-muted`}>{t("room.noSavedText")}</li>}
          {saved?.map((entry, i) => (
            <li className={SAVED} key={entry.name}>
              <button
                className="unset flex min-h-[36px] min-w-0 flex-1 cursor-pointer items-center truncate hover:underline focus-visible:outline focus-visible:outline-white"
                type="button" onClick={() => setDraft(String(entry.text))}>{String(entry.name)}</button>
              <button
                className="unset flex min-h-[36px] cursor-pointer items-center px-1.5 text-muted hover:text-red-text focus-visible:outline focus-visible:outline-white"
                type="button" aria-label={`${t("room.delete")} ${entry.name}`} onClick={() => remove(i)}>×</button>
            </li>
          ))}
        </ul>
        <div className="room-editor-end flex justify-end gap-2.5">
          <SmallButton onClick={close}>{t("room.cancel")}</SmallButton>
          <SmallButton className="room-editor-use" disabled={!words} onClick={use}>{t("room.useText")}</SmallButton>
        </div>
      </div>
    </dialog>
  );
}

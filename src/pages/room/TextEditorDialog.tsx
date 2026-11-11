import { useImperativeHandle, useRef, useState, type ChangeEvent, type Ref } from "react";
import { useTranslation } from "react-i18next";
import { SmallButton } from "../../components/buttons/SmallButton";
import { countWords, MAX_TEXT_LENGTH, readSavedTexts, writeSavedTexts, type SavedText } from "./room";

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

export type TextEditorHandle = { open(): void };
type TextEditorDialogProps = { text: string; onUse: (text: string) => void; ref?: Ref<TextEditorHandle> };

/** Modal editor for the custom text: cleanup tools, import, saved texts. */
export function TextEditorDialog({ text, onUse, ref }: TextEditorDialogProps) {
  const { t } = useTranslation();
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
    <dialog ref={dialog} className="room-editor" aria-labelledby="editor-title" onClick={(e) => e.target === dialog.current && close()}>
      <div className="room-editor-body">
        <h2 id="editor-title">{t("room.editorTitle")}</h2>
        <div className="room-editor-tools">
          {TOOLS.map((tool) => (
            <div className="room-editor-tool" key={tool.title}>
              <span className="room-label">{t(`room.${tool.title}`)}</span>
              <p>{t(`room.${tool.help}`)}</p>
              <div className="room-editor-tool-buttons">
                {tool.buttons.map(([name, label]) => (
                  <SmallButton key={name} onClick={() => setDraft(TEXT_TOOLS[name](draft))}>{t(`room.${label}`)}</SmallButton>
                ))}
              </div>
            </div>
          ))}
        </div>
        <label className="sr-only" htmlFor="editor-text">{t("room.editorTitle")}</label>
        <textarea ref={area} className="room-editor-text" id="editor-text" maxLength={MAX_TEXT_LENGTH} spellCheck={false} value={draft} onChange={(e) => setDraft(e.target.value)} />
        <p className="room-editor-count"><span>{`${words} ${t("room.wordsUnit")}`}</span><span>{t("room.maxChars", { n: MAX_TEXT_LENGTH })}</span></p>
        <div className="room-editor-save">
          <input type="text" maxLength={40} autoComplete="off" placeholder={t("room.textName")} value={saveName} onChange={(e) => setSaveName(e.target.value)} />
          <SmallButton onClick={save}>{t("room.save")}</SmallButton>
          <label className="small-button room-import">
            <span>{t("room.import")}</span>
            <input type="file" accept=".txt,text/plain" onChange={importFile} />
          </label>
        </div>
        <span className="room-label">{t("room.savedTexts")}</span>
        <ul className="room-saved">
          {saved?.length === 0 && <li className="min-h-[36px] text-muted">{t("room.noSavedText")}</li>}
          {saved?.map((entry, i) => (
            <li key={entry.name}>
              <button className="room-saved-load" type="button" onClick={() => setDraft(String(entry.text))}>{String(entry.name)}</button>
              <button className="room-saved-delete" type="button" aria-label={`${t("room.delete")} ${entry.name}`} onClick={() => remove(i)}>×</button>
            </li>
          ))}
        </ul>
        <div className="room-editor-end">
          <SmallButton onClick={close}>{t("room.cancel")}</SmallButton>
          <SmallButton className="room-editor-use" disabled={!words} onClick={use}>{t("room.useText")}</SmallButton>
        </div>
      </div>
    </dialog>
  );
}

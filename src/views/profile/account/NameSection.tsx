import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { changeUsername } from "../../../accounts/client";
import { isValidUsername, USERNAME_MAX, USERNAME_MIN } from "../../../accounts/username";
import { AccountMessage, type Message } from "./AccountMessage";
import { ACCOUNT_BUTTON, ACCOUNT_SECTION, BOX, HELP, MAIN, SECTION_TITLE } from "../styles";

type Props = { name: string; onChange: (name: string) => void };

/** Pseudo (AUTH-05) : même règle qu'à l'inscription ; le serveur dit s'il est déjà pris. */
export function NameSection({ name, onChange }: Props) {
  const { t } = useTranslation();
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const next = value.trim();
  const invalid = next.length > 0 && !isValidUsername(next);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (invalid || next === name) return;
    setBusy(true);
    const { error } = await changeUsername(next).catch(() => ({ error: { code: "" } }));
    setBusy(false);
    if (error) {
      const taken = error.code === "USERNAME_IS_ALREADY_TAKEN";
      return setMessage({ kind: "error", text: t(taken ? "account.name.taken" : "account.name.failed") });
    }
    setValue(next);
    onChange(next);
    setMessage({ kind: "ok", text: t("account.name.saved") });
  }

  return (
    <section className={ACCOUNT_SECTION} aria-labelledby="name-title">
      <h2 id="name-title" className={SECTION_TITLE}>{t("account.name.title")}</h2>
      <form className={BOX} onSubmit={submit}>
        <div className={MAIN}>
          <div className="flex flex-wrap gap-x-4 gap-y-3 [align-items:end]">
            <label className="sr-only" htmlFor="name-input">{t("account.name.title")}</label>
            <input
              id="name-input"
              className={`min-w-0 flex-[1_1_200px] border-b bg-transparent [border-left-style:none] [border-right-style:none] [border-top-style:none] px-0 pt-1 pb-1.5 font-sans text-[clamp(20px,3vh,26px)] leading-[1.1] font-light tracking-[.08em] text-white outline-none transition-[border-color] duration-200 ease-[ease] ${invalid ? "border-red-text" : "border-b-line-soft focus:border-white"}`}
              value={value}
              maxLength={USERNAME_MAX}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={invalid || undefined}
              onChange={(event) => { setValue(event.target.value); setMessage(null); }}
            />
            <button className={ACCOUNT_BUTTON.normal} type="submit" disabled={busy || invalid || !next || next === name}>{t("account.name.save")}</button>
          </div>
          <p className={HELP}>
            {t("account.name.rule", { min: USERNAME_MIN, max: USERNAME_MAX })} · <span className="tabular-nums">{`${[...value].length} / ${USERNAME_MAX}`}</span>
            <br />
            {t("account.name.help")}
          </p>
          <AccountMessage message={invalid ? { kind: "error", text: t("account.name.invalid") } : message} />
        </div>
      </form>
    </section>
  );
}

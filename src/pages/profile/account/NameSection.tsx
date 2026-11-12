import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { changeUsername } from "../../../accounts/client";
import { isValidUsername, USERNAME_MAX, USERNAME_MIN } from "../../../accounts/username";
import { AccountMessage, type Message } from "./AccountMessage";

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
    <section className="profile-section" aria-labelledby="name-title">
      <h2 id="name-title" className="profile-section-title">{t("account.name.title")}</h2>
      <form className="acc-box" onSubmit={submit}>
        <div className="acc-main">
          <div className="name-field">
            <label className="sr-only" htmlFor="name-input">{t("account.name.title")}</label>
            <input
              id="name-input"
              className="name-input"
              value={value}
              maxLength={USERNAME_MAX}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={invalid || undefined}
              onChange={(event) => { setValue(event.target.value); setMessage(null); }}
            />
            <button className="acc-btn" type="submit" disabled={busy || invalid || !next || next === name}>{t("account.name.save")}</button>
          </div>
          <p className="acc-help">
            {t("account.name.rule", { min: USERNAME_MIN, max: USERNAME_MAX })} · <span className="name-count">{`${[...value].length} / ${USERNAME_MAX}`}</span>
            <br />
            {t("account.name.help")}
          </p>
          <AccountMessage message={invalid ? { kind: "error", text: t("account.name.invalid") } : message} />
        </div>
      </form>
    </section>
  );
}

import { useId, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { avatarProblem, saveAvatar, shrinkAvatar } from "../../../accounts/avatar";
import { ProfileAvatar } from "../ProfileAvatar";
import { AccountMessage, type Message } from "./AccountMessage";

type Props = { name: string; image: string | null; onChange: (image: string | null) => void };

/** Photo de profil (AUTH-04) : un clic sur le rond ou sur le bouton ouvre le choix d'image. */
export function PhotoSection({ name, image, onChange }: Props) {
  const { t } = useTranslation();
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  async function save(blob: Blob | null, done: string) {
    setBusy(true);
    const result = await saveAvatar(blob).catch(() => ({ error: "failed" }));
    setBusy(false);
    if ("error" in result) return setMessage({ kind: "error", text: t(`account.photo.errors.${result.error}`, { defaultValue: t("account.photo.errors.failed") }) });
    onChange(result.image);
    setMessage({ kind: "ok", text: done });
  }

  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const problem = avatarProblem(file);
    if (problem) return setMessage({ kind: "error", text: t(`account.photo.errors.${problem}`) });
    const blob = await shrinkAvatar(file).catch(() => null);
    if (!blob) return setMessage({ kind: "error", text: t("account.photo.errors.unreadable") });
    await save(blob, t("account.photo.saved"));
  }

  return (
    <section className="profile-section" aria-labelledby="photo-title">
      <h2 id="photo-title" className="profile-section-title">{t("account.photo.title")}</h2>
      <div className="acc-box">
        <label className="account-avatar" htmlFor={inputId} title={t("account.photo.change")}>
          <ProfileAvatar name={name} src={image} />
          <span className="avatar-change" aria-hidden="true">{t("account.photo.changeShort")}</span>
        </label>
        <div className="acc-main">
          <p className="acc-help">{t("account.photo.help")}</p>
          <div className="acc-actions">
            <label className="acc-btn" aria-disabled={busy || undefined}>
              {t("account.photo.choose")}
              <input id={inputId} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={pick} />
            </label>
            {image && (
              <button className="acc-btn acc-btn--quiet" type="button" disabled={busy} onClick={() => void save(null, t("account.photo.removed"))}>
                {t("account.photo.remove")}
              </button>
            )}
          </div>
          <AccountMessage message={message} />
        </div>
      </div>
    </section>
  );
}

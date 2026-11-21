import { useState } from "react";
import { useTranslation } from "react-i18next";
import { authClient } from "../../../accounts/client";
import { ACCOUNT_BUTTON, ACCOUNT_SECTION, BOX, HELP, MAIN, SECTION_TITLE } from "../styles";

/** Log out: the navbar's player card leads straight here, so the account tab carries the way out. */
export function SignOutSection() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await authClient.signOut().catch(() => undefined);
    location.assign("/home");
  }

  return (
    <section className={ACCOUNT_SECTION} aria-labelledby="sign-out-title">
      <h2 id="sign-out-title" className={SECTION_TITLE}>{t("account.signOut.title")}</h2>
      <div className={BOX}>
        <div className={MAIN}>
          <p className={HELP}>{t("account.signOut.help")}</p>
        </div>
        <button className={ACCOUNT_BUTTON.quiet} type="button" disabled={busy} onClick={() => void signOut()}>{t("account.signOut.button")}</button>
      </div>
    </section>
  );
}

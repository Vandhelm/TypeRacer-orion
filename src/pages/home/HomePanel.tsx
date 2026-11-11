import { useEffect, useRef, useState, type FormEvent, type Ref } from "react";
import { useTranslation } from "react-i18next";
import { LogoTitle } from "../../components/brand/LogoTitle";
import { FlipButton } from "../../components/buttons/FlipButton";
import { OutlineButton } from "../../components/buttons/OutlineButton";
import { TextField, TextInput } from "../../components/forms/TextField";
import { GithubIcon, GoogleIcon } from "../../components/icons";
import { Stamp } from "../../components/Stamp";
import { ViewTabs } from "../../components/tabs/ViewTabs";
import { cleanRoomCode } from "../../rooms/access";
import { NICKNAME_MAX, NICKNAME_PATTERN, saveNickname, storedNickname } from "../../players/nickname";
import { authClient, signInWithUsername, signUpWithUsername } from "../../accounts/client";
import { isValidUsername, PASSWORD_MIN } from "../../accounts/username";

type Pane = "play" | "account";
type StampKey = "stampPlay" | "stampAccount" | "stampCode";

const FORM = "col-start-1 row-start-1 flex flex-col gap-[2.1vh] [align-self:start]";

/** Home view panel: Play / Account forms. */
export function HomePanel({ ref }: { ref?: Ref<HTMLElement> }) {
  const { t } = useTranslation();
  const [pane, setPane] = useState<Pane>("play");
  const [code, setCode] = useState("");
  const [nickname, setNickname] = useState(() => storedNickname() ?? "");
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: session } = authClient.useSession();
  const me = session?.user as { displayUsername?: string | null; username?: string | null; name: string } | undefined;
  const [stamp, setStamp] = useState<{ key: StampKey | null; on: boolean; play: number }>({ key: null, on: false, play: 0 });
  const stampTimer = useRef<number>(undefined);
  const codeInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => clearTimeout(stampTimer.current), []);

  function showStamp(key: StampKey) {
    clearTimeout(stampTimer.current);
    setStamp((s) => ({ key, on: true, play: s.play + 1 }));
    stampTimer.current = window.setTimeout(() => setStamp((s) => ({ ...s, on: false })), 1700);
  }
  const submitWith = (key: StampKey) => (e: FormEvent) => {
    e.preventDefault();
    showStamp(key);
  };
  // AUTH-03 : un invité ne crée pas de salon, on l'envoie vers l'onglet compte
  function createRoom() {
    if (me) location.href = "/room?new";
    else {
      setPane("account");
      setAuthError(t("home.loginToCreate"));
    }
  }

  async function submitAccount(mode: "signIn" | "signUp") {
    setAuthError("");
    if (!isValidUsername(username)) return setAuthError(t("home.badUsername"));
    if (password.length < PASSWORD_MIN) return setAuthError(t("home.badPassword", { min: PASSWORD_MIN }));
    setBusy(true);
    const { error } = mode === "signIn" ? await signInWithUsername(username, password) : await signUpWithUsername(username, password);
    setBusy(false);
    if (error) return setAuthError(t(mode === "signIn" ? "home.signInFailed" : "home.signUpFailed"));
    setPassword("");
    showStamp("stampAccount");
  }

  // code saisi : on rejoint le salon avec le code déjà inscrit
  function enterCode() {
    showStamp("stampCode");
    if (code.length === 6) setTimeout(() => { location.href = "/room?code=" + code; }, 900);
    else codeInput.current?.focus();
  }

  return (
    <section ref={ref} className="panel">
      <Stamp label={stamp.key ? t(`home.${stamp.key}`) : ""} visible={stamp.on} playKey={stamp.play} />

      <LogoTitle overline={t("home.overline")} name="O.R.I.O.N" />

      <div className="flex w-full max-w-[45vh] min-w-[min(100%,300px)] flex-col gap-[2.6vh] phone:max-w-none phone:gap-[22px]">
        <ViewTabs
          ariaLabel={t("home.viewChoice")}
          value={pane}
          onChange={setPane}
          options={[
            { value: "play", num: "01", label: t("home.viewPlay") },
            { value: "account", num: "02", label: t("home.viewAccount") },
          ]}
        />

        <div className="panes grid grid-cols-[minmax(0,1fr)]">
          <form className={pane === "play" ? FORM : `is-hidden ${FORM}`} id="pane-play" aria-hidden={pane !== "play"} onSubmit={submitWith("stampPlay")}>
            <TextField
              id="nickname"
              num="01"
              label={t("home.nickname")}
              inputProps={{
                name: "nickname",
                autoComplete: "nickname",
                spellCheck: false,
                maxLength: NICKNAME_MAX,
                pattern: NICKNAME_PATTERN,
                title: t("home.nicknameRule"),
                placeholder: "Corail_418",
                value: nickname,
                onChange: (e) => {
                  setNickname(e.target.value);
                  saveNickname(e.target.value);
                },
              }}
            />

            <div className="flex flex-col gap-[1.3vh]">
              <FlipButton type="submit" label={t("home.play")} backLabel={t("home.playBack")} />
              <OutlineButton onClick={createRoom}>{t("home.createRoom")}</OutlineButton>
              <OutlineButton href="#rooms">{t("home.rooms")}</OutlineButton>
            </div>

            <TextField id="code" num="02" label={t("home.code")}>
              <div className="code-field">
                <TextInput
                  ref={codeInput}
                  id="code"
                  name="code"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={6}
                  placeholder="K7Q2M9"
                  value={code}
                  onChange={(e) => setCode(cleanRoomCode(e.target.value))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      enterCode();
                    }
                  }}
                />
                <OutlineButton id="enter-code" onClick={enterCode}>{t("home.enterCode")}</OutlineButton>
              </div>
            </TextField>
          </form>

          <form
            className={pane === "account" ? FORM : `is-hidden ${FORM}`}
            id="pane-account"
            aria-hidden={pane !== "account"}
            onSubmit={(e) => {
              e.preventDefault();
              if (!me) void submitAccount("signIn");
            }}
          >
            {me ? (
              <>
                <TextField id="signed-in" num="01" label={t("home.signedInAs")}>
                  <p className="py-[1.2vh] text-[max(18px,2.6vh)] tracking-[.08em]">{me.displayUsername || me.username || me.name}</p>
                </TextField>
                <div className="flex flex-col gap-[1.3vh]">
                  <OutlineButton href="/profile">{t("home.myProfile")}</OutlineButton>
                  <OutlineButton onClick={() => void authClient.signOut()}>{t("home.signOut")}</OutlineButton>
                </div>
              </>
            ) : (
              <>
            <TextField
              id="username"
              num="01"
              label={t("home.username")}
              inputProps={{ name: "username", autoComplete: "username", spellCheck: false, maxLength: 20, value: username, onChange: (e) => setUsername(e.target.value) }}
            />
            <TextField
              id="password"
              num="02"
              label={t("home.password")}
              inputProps={{ name: "password", type: showPassword ? "text" : "password", autoComplete: "current-password", value: password, onChange: (e) => setPassword(e.target.value) }}
              action={
                <button className="text-field-action" type="button" id="reveal-password" aria-pressed={showPassword} onClick={() => setShowPassword((v) => !v)}>
                  {t(showPassword ? "home.hide" : "home.show")}
                </button>
              }
            />
            <p role="alert" className="min-h-[1.4em] font-mono text-[max(11px,1.3vh)] tracking-[.08em] text-red-text">{authError}</p>
            <div className="flex flex-col gap-[1.3vh]">
              <FlipButton type="submit" label={t("home.logIn")} backLabel={t("home.logInBack")} disabled={busy} />
              <OutlineButton disabled={busy} onClick={() => void submitAccount("signUp")}>{t("home.createAccount")}</OutlineButton>
            </div>
            {/* Connexion via un fournisseur externe (OAuth : à brancher sur le serveur) */}
            <div className="flex items-center gap-[1.2vh] font-mono text-[max(10px,1.2vh)] leading-none tracking-[.2em] text-line-soft uppercase before:flex-1 before:border-t before:border-dashed before:border-line-faint after:flex-1 after:border-t after:border-dashed after:border-line-faint">
              {t("home.or")}
            </div>
            <div className="grid grid-cols-2 gap-[1.3vh]">
              <OutlineButton id="login-google" data-provider="google" aria-label={t("home.withGoogle")} icon={<GoogleIcon />}>GOOGLE</OutlineButton>
              <OutlineButton id="login-github" data-provider="github" aria-label={t("home.withGithub")} icon={<GithubIcon />}>GITHUB</OutlineButton>
            </div>
              </>
            )}
          </form>
        </div>
      </div>
    </section>
  );
}

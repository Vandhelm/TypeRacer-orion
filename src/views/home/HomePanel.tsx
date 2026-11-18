import { useEffect, useRef, useState, type FormEvent, type Ref } from "react";
import { useTranslation } from "react-i18next";
import { LogoTitle } from "../../components/brand/LogoTitle";
import { FlipButton } from "../../components/buttons/FlipButton";
import { OutlineButton } from "../../components/buttons/OutlineButton";
import { TextField, TextInput } from "../../components/forms/TextField";
import { DiscordIcon, GithubIcon } from "../../components/icons";
import { Stamp } from "../../components/Stamp";
import { ViewTabs } from "../../components/tabs/ViewTabs";
import { cleanRoomCode } from "../../rooms/access";
import { isValidNickname, NICKNAME_MAX, NICKNAME_PATTERN, startGuestSession, storedNickname } from "../../players/nickname";
import { authClient, changeUsername, isProvider, linkProvider, PROVIDER_NAMES, signInWith, signInWithUsername, signUpWithUsername, SOCIAL_PROVIDERS, type SocialProvider } from "../../accounts/client";
import { isValidUsername, PASSWORD_MIN } from "../../accounts/username";

type Pane = "play" | "account";
type StampKey = "stampPlay" | "stampAccount" | "stampCode";

const PROVIDER_ICONS: Record<SocialProvider, () => React.JSX.Element> = { github: GithubIcon, discord: DiscordIcon };

const FORM = "col-start-1 row-start-1 flex flex-col gap-[2.1vh] [align-self:start]";

/** Home view panel: Play / Account forms. */
// The panel with Play / Account forms, with blueprint-style corner marks.
const PANEL =
  "pointer-events-auto relative flex max-h-full w-full max-w-[min(520px,58vh)] flex-col items-center justify-center gap-[3.2vh] border border-line bg-black px-[3vh] pt-[6vh] pb-[4vh] " +
  "animate-[rise_.8s_.2s_cubic-bezier(.2,.8,.2,1)_both] motion-reduce:animate-none phone:max-w-[460px] phone:gap-7 phone:px-5 phone:pt-10 phone:pb-8 " +
  "before:absolute before:-top-[7px] before:-left-[7px] before:size-4 before:border-t before:border-l before:border-white " +
  "after:absolute after:-right-[7px] after:-bottom-[7px] after:size-4 after:border-r after:border-b after:border-white";

export function HomePanel({ ref }: { ref?: Ref<HTMLElement> }) {
  const { t } = useTranslation();
  const [pane, setPane] = useState<Pane>("play");
  const [code, setCode] = useState("");
  const [nickname, setNickname] = useState(() => storedNickname() ?? "");
  const [playError, setPlayError] = useState("");
  const nicknameInput = useRef<HTMLInputElement>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: session } = authClient.useSession();
  const me = session?.user as { id: string; displayUsername?: string | null; username?: string | null; name: string; needsUsername?: boolean } | undefined;
  const [linkedProviders, setLinkedProviders] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [stamp, setStamp] = useState<{ key: StampKey | null; on: boolean; play: number }>({ key: null, on: false, play: 0 });
  const stampTimer = useRef<number>(undefined);
  const codeInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => clearTimeout(stampTimer.current), []);
  // Retour de GitHub ou Discord (connexion ou liaison) : on ouvre l'onglet compte avec le message
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const failed = params.get("authError");
    const linked = params.get("linked");
    if (!failed && !linked) return;
    setPane("account");
    const providerOf = (value: string | null) => (isProvider(value) ? PROVIDER_NAMES[value] : "");
    if (failed === "link") setAuthError(t("home.linkFailed", { provider: providerOf(params.get("provider")) }));
    else if (failed) setAuthError(t("home.socialFailed", { provider: providerOf(failed) }));
    else setNotice(t("home.providerLinked", { provider: providerOf(linked) }));
    for (const key of ["authError", "linked", "provider", "error", "error_description"]) params.delete(key);
    history.replaceState(null, "", location.pathname + (params.size ? `?${params}` : ""));
  }, []);

  // Compte connecté : quels fournisseurs sont déjà liés ? Et un pseudo à choisir est pré-rempli.
  useEffect(() => {
    if (!me) return;
    void authClient.listAccounts().then(({ data }) => setLinkedProviders(data?.map((a) => a.providerId) ?? []));
    if (me.needsUsername) {
      setPane("account");
      setUsername(me.displayUsername || "");
    }
  }, [me?.id, me?.needsUsername]);

  function showStamp(key: StampKey) {
    clearTimeout(stampTimer.current);
    setStamp((s) => ({ key, on: true, play: s.play + 1 }));
    stampTimer.current = window.setTimeout(() => setStamp((s) => ({ ...s, on: false })), 1700);
  }
  // AUTH-02 : un invité choisit son pseudonyme avant de rejoindre ; le serveur le valide et pose le cookie signé
  async function ensurePlayer() {
    setPlayError("");
    if (me) return true;
    const ok = isValidNickname(nickname) && (await startGuestSession(nickname));
    if (!ok) {
      setPlayError(t(isValidNickname(nickname) ? "home.guestFailed" : "home.badNickname"));
      nicknameInput.current?.focus();
    }
    return ok;
  }
  async function play(e: FormEvent) {
    e.preventDefault();
    if (await ensurePlayer()) showStamp("stampPlay");
  }
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

  // Départ vers GitHub ou Discord : en cas d'erreur avant la redirection, on reste ici avec le message
  function goTo(provider: SocialProvider, action: "signIn" | "link") {
    setBusy(true);
    setAuthError("");
    void (action === "link" ? linkProvider(provider) : signInWith(provider)).then(({ error }) => {
      if (!error) return;
      setBusy(false);
      setAuthError(t(action === "link" ? "home.linkFailed" : "home.socialFailed", { provider: PROVIDER_NAMES[provider] }));
    });
  }

  async function submitUsername() {
    setAuthError("");
    if (!isValidUsername(username)) return setAuthError(t("home.badUsername"));
    setBusy(true);
    const { error } = await changeUsername(username);
    setBusy(false);
    if (error) return setAuthError(t("home.signUpFailed"));
    await authClient.getSession({ query: { disableCookieCache: true } });
    showStamp("stampAccount");
  }

  // code saisi : on rejoint le salon avec le code déjà inscrit
  async function enterCode() {
    if (code.length !== 6) return codeInput.current?.focus();
    if (!(await ensurePlayer())) return;
    showStamp("stampCode");
    setTimeout(() => { location.href = "/room?code=" + code; }, 900);
  }

  return (
    <section ref={ref} className={PANEL}>
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

        <div className="grid animate-[rise_.7s_.65s_cubic-bezier(.2,.8,.2,1)_both] grid-cols-[minmax(0,1fr)] motion-reduce:animate-none">
          <form className={pane === "play" ? FORM : `pointer-events-none invisible ${FORM}`} id="pane-play" aria-hidden={pane !== "play"} onSubmit={(e) => void play(e)}>
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
                ref: nicknameInput,
                required: !me,
                "aria-invalid": playError ? true : undefined,
                "aria-describedby": "play-error",
                onChange: (e) => setNickname(e.target.value),
              }}
            />
            <p id="play-error" role="alert" className="min-h-[1.4em] font-mono text-[max(11px,1.3vh)] tracking-[.08em] text-red-text">{playError}</p>

            <div className="flex flex-col gap-[1.3vh]">
              <FlipButton type="submit" label={t("home.play")} backLabel={t("home.playBack")} />
              <OutlineButton onClick={createRoom}>{t("home.createRoom")}</OutlineButton>
              <OutlineButton href="#rooms">{t("home.rooms")}</OutlineButton>
            </div>

            <TextField id="code" num="02" label={t("home.code")}>
              <div className="flex items-end gap-[1.6vh] [&_.outline-button]:h-[4.4vh] [&_.outline-button]:min-h-[40px] [&_.outline-button]:pr-[1.8vh] [&_.outline-button]:pl-[2.1vh] [&_.text-field-input]:min-w-0 [&_.text-field-input]:grow [&_input]:font-mono [&_input]:tracking-[.5em] [&_input]:uppercase">
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
                      void enterCode();
                    }
                  }}
                />
                <OutlineButton id="enter-code" onClick={() => void enterCode()}>{t("home.enterCode")}</OutlineButton>
              </div>
            </TextField>
          </form>

          <form
            className={pane === "account" ? FORM : `pointer-events-none invisible ${FORM}`}
            id="pane-account"
            aria-hidden={pane !== "account"}
            onSubmit={(e) => {
              e.preventDefault();
              if (!me) void submitAccount("signIn");
              else if (me.needsUsername) void submitUsername();
            }}
          >
            {me?.needsUsername ? (
              <>
                <TextField
                  id="new-username"
                  num="01"
                  label={t("home.chooseUsername")}
                  inputProps={{ name: "username", autoComplete: "username", spellCheck: false, maxLength: 20, value: username, onChange: (e) => setUsername(e.target.value) }}
                />
                <p role="alert" className="min-h-[1.4em] font-mono text-[max(11px,1.3vh)] tracking-[.08em] text-red-text">{authError || t("home.usernameTakenExternal")}</p>
                <FlipButton type="submit" label={t("home.confirmUsername")} backLabel={t("home.confirmUsername")} disabled={busy} />
              </>
            ) : me ? (
              <>
                <TextField id="signed-in" num="01" label={t("home.signedInAs")}>
                  <p className="py-[1.2vh] text-[max(18px,2.6vh)] tracking-[.08em]">{me.displayUsername || me.username || me.name}</p>
                </TextField>
                <div className="flex flex-col gap-[1.3vh]">
                  <OutlineButton href="/profile">{t("home.myProfile")}</OutlineButton>
                  {SOCIAL_PROVIDERS.filter((p) => !linkedProviders.includes(p)).map((provider) => {
                    const Icon = PROVIDER_ICONS[provider];
                    return (
                      <OutlineButton key={provider} icon={<Icon />} disabled={busy} onClick={() => goTo(provider, "link")}>
                        {t("home.linkProvider", { provider: PROVIDER_NAMES[provider].toUpperCase() })}
                      </OutlineButton>
                    );
                  })}
                  <OutlineButton onClick={() => void authClient.signOut()}>{t("home.signOut")}</OutlineButton>
                </div>
                <p role="status" className={`min-h-[1.4em] font-mono text-[max(11px,1.3vh)] tracking-[.08em] ${authError ? "text-red-text" : "text-line-soft"}`}>{authError || notice}</p>
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
                <button
                  className="unset min-h-[36px] cursor-pointer pl-3 font-mono text-[max(10px,1.1vh)] leading-none font-normal tracking-[.2em] text-line-soft hover:text-white focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-white"
                  type="button" id="reveal-password" aria-pressed={showPassword} onClick={() => setShowPassword((v) => !v)}>
                  {t(showPassword ? "home.hide" : "home.show")}
                </button>
              }
            />
            <p role="alert" className="min-h-[1.4em] font-mono text-[max(11px,1.3vh)] tracking-[.08em] text-red-text">{authError}</p>
            <div className="flex flex-col gap-[1.3vh]">
              <FlipButton type="submit" label={t("home.logIn")} backLabel={t("home.logInBack")} disabled={busy} />
              <OutlineButton disabled={busy} onClick={() => void submitAccount("signUp")}>{t("home.createAccount")}</OutlineButton>
            </div>
            {/* Connexion via un fournisseur externe */}
            <div className="flex items-center gap-[1.2vh] font-mono text-[max(10px,1.2vh)] leading-none tracking-[.2em] text-line-soft uppercase before:flex-1 before:border-t before:border-dashed before:border-line-faint after:flex-1 after:border-t after:border-dashed after:border-line-faint">
              {t("home.or")}
            </div>
            <div className="grid grid-cols-2 gap-[1.3vh]">
              <OutlineButton id="login-github" data-provider="github" aria-label={t("home.withGithub")} icon={<GithubIcon />} disabled={busy} onClick={() => goTo("github", "signIn")}>GITHUB</OutlineButton>
              <OutlineButton id="login-discord" data-provider="discord" aria-label={t("home.withDiscord")} icon={<DiscordIcon />} disabled={busy} onClick={() => goTo("discord", "signIn")}>DISCORD</OutlineButton>
            </div>
              </>
            )}
          </form>
        </div>
      </div>
    </section>
  );
}

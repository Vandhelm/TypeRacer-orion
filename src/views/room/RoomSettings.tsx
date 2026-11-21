import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { SmallButton } from "../../components/buttons/SmallButton";
import { NumberField } from "../../components/forms/NumberField";
import { TextChoice } from "../../components/forms/TextChoice";
import { InfoTip } from "../../components/InfoTip";
import { SectionTabs } from "../../components/tabs/SectionTabs";
import { BOT_LEVELS, canAddBot } from "../../rooms/bots";
import { DEFAULT_DURATION, MAX_DURATION, MIN_DURATION, ROLES } from "../../rooms/settings";
import { excludedApplies } from "../../rooms/text";
import type { RoomState } from "./hooks/useRoom";
import { cleanExcluded, compositionOptions, countWords, DURATION_PRESETS, durationChoice, guestComposition, isPlayer, withBotAdded, withBotLevel, withoutBot, type CompositionOption, type Room, type TextLength } from "./room";
import { LENGTH_KEY, useRoomLabels } from "./useRoomLabels";
import { DASHED_TOP, LABEL, PLAIN_VALUE, SHADE } from "./styles";

type Section = "room" | "content" | "typing" | "bots";
const SECTIONS: { value: Section; num: string; key: string }[] = [
  { value: "room", num: "01", key: "tabRoom" },
  { value: "content", num: "02", key: "tabContent" },
  { value: "typing", num: "03", key: "tabTyping" },
  { value: "bots", num: "04", key: "tabBots" },
];
const LENGTHS = ["very-short", "short", "medium", "long"] as const;

type RowProps = { id: string; label: string; help?: string; role?: "radiogroup" | "group"; inactive?: boolean; children: ReactNode };

// One setting per line: its name on the left, its choices on the right (stacked on narrow screens).
const ROW = "grid min-h-[42px] grid-cols-[minmax(150px,200px)_minmax(0,1fr)] items-center gap-x-6 narrow:min-h-0 narrow:grid-cols-[minmax(0,1fr)] narrow:gap-y-2 narrow:py-1";
const CHOICES = "flex flex-wrap items-center gap-x-4 gap-y-0.5 pt-0.5 narrow:gap-x-[22px] narrow:gap-y-1.5";
const PANEL = `${SHADE} grid gap-y-1 narrow:gap-y-[18px]`;
const SHORT_INPUT =
  "unset box-border h-[34px] w-[9em] border-b border-b-line-soft [border-bottom-style:dashed] font-mono text-[max(15px,1.9vh)] leading-none font-normal tracking-[.3em] text-white caret-red-text " +
  "focus:border-b-white focus:[border-bottom-style:solid] placeholder:tracking-[.04em] placeholder:text-muted";

// The help note: one short line under the choices, indented behind a hairline; opened by the "i".
const NOTE = "col-start-2 m-0 mb-1.5 max-w-[44ch] border-l border-l-line-soft pl-2.5 font-mono text-[11px] leading-normal text-white/70 narrow:col-start-1";

/** Open state of a row's help note; Escape closes it. */
function useHelp() {
  const [open, setOpen] = useState(false);
  const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape" && open) setOpen(false); };
  return { open, toggle: () => setOpen(!open), onKeyDown };
}

/** The setting's name, then its "i" when it has help. */
function Label({ id, label, help, open, toggle, htmlFor }: { id: string; label: string; help?: string; open: boolean; toggle: () => void; htmlFor?: string }) {
  const { t } = useTranslation();
  const name = htmlFor ? <label className={LABEL} htmlFor={htmlFor}>{label}</label> : <span className={LABEL} id={id}>{label}</span>;
  if (!help) return <span className="inline-flex items-center self-center">{name}</span>;
  return (
    <span className="inline-flex items-center gap-2.5">
      {name}
      <InfoTip label={t("room.helpFor", { name: label })} controls={`help-${id}`} open={open} onToggle={toggle} />
    </span>
  );
}

/** One setting: its name on the left, its choices on the right, its help note under the choices. */
function Row({ id, label, help, role = "radiogroup", inactive, children }: RowProps) {
  const { open, toggle, onKeyDown } = useHelp();
  return (
    <div className={ROW} role={role} aria-labelledby={id} aria-describedby={help ? `help-${id}` : undefined} onKeyDown={onKeyDown}>
      <Label id={id} label={label} help={help} open={open} toggle={toggle} />
      <div className={inactive ? `${CHOICES} opacity-35` : CHOICES}>{children}</div>
      {help && <p className={NOTE} id={`help-${id}`} hidden={!open}>{help}</p>}
    </div>
  );
}

function ExcludedRow({ room, host, update }: Pick<RoomState, "room" | "host" | "update">) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(room.excluded);
  // CONF-07 : seulement pour les mots aléatoires ; un passage ou une citation reste entier (CONF-04)
  const inactive = !excludedApplies(room.textType);
  const { open, toggle, onKeyDown } = useHelp();
  return (
    <div className={ROW} onKeyDown={onKeyDown}>
      <Label id="label-excluded" label={t("room.excluded")} help={t("room.helpExcluded")} open={open} toggle={toggle} htmlFor="room-excluded" />
      <div className={inactive ? `${CHOICES} opacity-35` : CHOICES}>
        <input
          className={`${SHORT_INPUT} ${inactive ? "opacity-35" : ""}`.trim()}
          id="room-excluded"
          aria-describedby="help-label-excluded"
          name="excluded"
          type="text"
          maxLength={20}
          autoComplete="off"
          spellCheck={false}
          placeholder={t("room.excludedExample")}
          value={draft}
          disabled={!host || inactive}
          readOnly={!host}
          tabIndex={host ? undefined : -1}
          onChange={(e) => { setDraft(e.target.value); update({ excluded: cleanExcluded(e.target.value) }); }}
          onBlur={() => setDraft(room.excluded)}
        />
      </div>
      <p className={NOTE} id="help-label-excluded" hidden={!open}>{t("room.helpExcluded")}</p>
    </div>
  );
}

type RoomSettingsProps = { state: RoomState; onEditText: () => void; action: ReactNode };

/** Race settings, grouped into four tabbed sections. Read-only for a guest. */
export function RoomSettings({ state, onEditText, action }: RoomSettingsProps) {
  const { t } = useTranslation();
  const { room, update, host } = state;
  const { durationLabel, lengthLabel, words } = useRoomLabels(room);
  const [section, setSection] = useState<Section>("room");
  const [customDuration, setCustomDuration] = useState(false);
  const durationInput = useRef<HTMLInputElement>(null);
  const lengthInput = useRef<HTMLInputElement>(null);

  /** Radio choices of one setting; a guest only sees the current one. */
  function radios<K extends keyof Room>(name: K, options: [Room[K], string][], pick: (value: Room[K]) => void = (value) => update({ [name]: value } as Partial<Room>), disabled = !host) {
    return options.map(([value, key]) => (
      <TextChoice key={String(value)} type="radio" name={name} value={String(value)} label={t(`room.${key}`)} checked={room[name] === value} disabled={disabled} hidden={!host && room[name] !== value} onChange={() => pick(value)} />
    ));
  }
  // CONF-06 : l'hôte coche ou décoche ; les autres membres ne voient que les options cochées qui ont un effet, en lecture seule
  const composition = compositionOptions(room);
  const shown = guestComposition(room);
  const checkbox = ({ name, locked, inactive }: CompositionOption) => (
    <TextChoice key={name} type="checkbox" name={name} label={t(`room.${name}`)} checked={room[name]} disabled={!host || locked} inactive={inactive} hidden={!host && !shown.includes(name)} onChange={(e) => update({ [name]: e.target.checked })} />
  );

  function pickTextType(textType: Room["textType"]) {
    if (textType === "custom" && !countWords(room.text)) { onEditText(); return; }
    update({ textType, length: textType === "quote" && room.length === "other" ? "medium" : room.length });
  }
  function pickDuration(value: number | null | "other") {
    if (value === "other") {
      flushSync(() => setCustomDuration(true));
      durationInput.current?.focus();
      return;
    }
    setCustomDuration(false);
    update({ duration: value });
  }
  function pickLength(length: TextLength) {
    flushSync(() => update({ length }));
    if (length === "other") lengthInput.current?.focus();
  }

  const checkedDuration = durationChoice(room.duration, customDuration);
  const isCustom = room.textType === "custom";
  const usesBots = room.bots;
  // CONF-10 : les humains assis comptent dans la capacité ; un bot sans place attend qu'une place se libère
  const humans = state.seats.filter((seat) => isPlayer(seat) && !seat.bot).length;
  const seated = new Set(state.seats.filter((seat) => isPlayer(seat) && seat.bot).map((seat) => (isPlayer(seat) ? seat.name : "")));
  const setBots = (botList: Room["botList"]) => update({ botList, bots: botList.length > 0 });

  const help = {
    visibility: t(`room.help${{ private: "Private", semi: "SemiPrivate", public: "Public" }[room.visibility]}`),
    accuracy: t(`room.help${{ shaky: "Shaky", decent: "Decent", high: "High" }[room.botAccuracy]}`),
    type: t(`room.help${{ coherent: "Coherent", quote: "Quote", words: "Scrambled", custom: "Custom" }[room.textType]}`),
    mistakes: t(`room.help${{ fix: "Fix", "carry-on": "CarryOn", fatal: "Fatal" }[room.mistakes]}`),
  };

  return (
    <div className={`relative mt-[clamp(20px,3.4vh,36px)] pt-[clamp(16px,2.6vh,24px)] [grid-area:settings] ${DASHED_TOP} narrow:mt-[26px] narrow:pt-[22px]`}>
      <div className="mb-[clamp(12px,2vh,20px)] flex flex-wrap items-center justify-between gap-x-6 gap-y-[14px] phone:flex-col-reverse phone:items-stretch narrow:mb-[22px]">
        <SectionTabs
          ariaLabel={t("room.settingsSections")}
          value={section}
          onChange={setSection}
          options={SECTIONS.map((s) => ({ value: s.value, num: s.num, label: t(`room.${s.key}`), id: `tab-${s.value}`, panelId: `panel-${s.value}` }))}
        />
      </div>

      <div className={PANEL} role="tabpanel" id="panel-room" aria-labelledby="tab-room" hidden={section !== "room"}>
        <Row id="label-visibility" label={t("room.visibility")} help={help.visibility}>
          {radios("visibility", [["private", "private"], ["semi", "semiPrivate"], ["public", "public"]])}
        </Row>
        {host && (
          <Row id="label-role" label={t("room.role")}>
            {ROLES.map((role) => (
              <TextChoice key={role} type="radio" name="role" value={role} label={t(`room.role_${role}`)} checked={state.role === role} onChange={() => state.setRole(role)} />
            ))}
          </Row>
        )}
        <Row id="label-duration" label={t("room.raceLength")} help={t(room.duration === null && checkedDuration !== "other" ? "room.helpNoLimit" : "room.helpRaceLength")}>
          {host ? (
            <>
              {DURATION_PRESETS.map((value) => (
                <TextChoice key={String(value)} type="radio" name="duration" value={value === null ? "none" : String(value)} label={durationLabel(value)} checked={checkedDuration === (value ?? "none")} onChange={() => pickDuration(value)} />
              ))}
              <TextChoice type="radio" name="duration" value="other" label={t("room.other")} checked={checkedDuration === "other"} onChange={() => pickDuration("other")} />
              {checkedDuration === "other" && (
                <NumberField ref={durationInput} value={room.duration ?? DEFAULT_DURATION} min={MIN_DURATION} max={MAX_DURATION} step={5} ariaLabel={t("room.raceLength")} onCommit={(duration) => update({ duration })} />
              )}
            </>
          ) : (
            <span className={PLAIN_VALUE}>{durationLabel(room.duration)}</span>
          )}
        </Row>
        {/* CONF-09 : bonus de remontée ; les non-hôtes voient seulement la valeur choisie */}
        <Row id="label-catch-up" label={t("room.catchUpBonus")} help={t("room.helpCatchUpBonus")}>
          {[true, false].map((value) => (
            <TextChoice key={String(value)} type="radio" name="catchUpBonus" value={value ? "yes" : "no"} label={t(value ? "room.yes" : "room.no")} checked={room.catchUpBonus === value} disabled={!host} hidden={!host && room.catchUpBonus !== value} onChange={() => update({ catchUpBonus: value })} />
          ))}
        </Row>
      </div>

      <div className={PANEL} role="tabpanel" id="panel-bots" aria-labelledby="tab-bots" hidden={section !== "bots"}>
        {/* CONF-10 : l'hôte ajoute et retire les bots un par un, chacun à son niveau ; les autres voient la liste */}
        <Row id="label-bots" label={t("room.bots")} help={t("room.helpBotList")} role="group">
          {!room.botList.length && <span className={PLAIN_VALUE}>{t("room.noBots")}</span>}
          {host && <SmallButton onClick={() => setBots(withBotAdded(room.botList))} disabled={!canAddBot(room, humans)}>{t("room.addBot")}</SmallButton>}
        </Row>
        {room.botList.map((bot) => (
          <Row key={bot.name} id={`label-bot-${bot.name}`} label={bot.name} help={t(`room.helpLevel_${bot.level}`)}>
            {BOT_LEVELS.map((level) => (
              <TextChoice key={level} type="radio" name={`bot-level-${bot.name}`} value={level} label={t(`room.level_${level}`)} checked={bot.level === level} disabled={!host} inactive={!seated.has(bot.name)} hidden={!host && bot.level !== level} onChange={() => setBots(withBotLevel(room.botList, bot.name, level))} />
            ))}
            {!seated.has(bot.name) && <span className={PLAIN_VALUE}>{t("room.botWaiting")}</span>}
            {host && <SmallButton aria-label={t("room.removeBotLabel", { name: bot.name })} onClick={() => setBots(withoutBot(room.botList, bot.name))}>{t("room.removeBot")}</SmallButton>}
          </Row>
        ))}
        <Row id="label-accuracy" label={t("room.botAccuracy")} help={help.accuracy} inactive={!usesBots}>
          {radios("botAccuracy", [["shaky", "shaky"], ["decent", "decent"], ["high", "high"]], undefined, !host || !usesBots)}
        </Row>
      </div>

      <div className={PANEL} role="tabpanel" id="panel-content" aria-labelledby="tab-content" hidden={section !== "content"}>
        <Row id="label-type" label={t("room.textType")} help={help.type}>
          {radios("textType", [["coherent", "coherent"], ["quote", "quote"], ["words", "scrambled"], ["custom", "custom"]], pickTextType)}
        </Row>
        <Row id="label-composition" label={t("room.composition")} role="group" inactive={isCustom}>
          {composition.map(checkbox)}
          <span className={PLAIN_VALUE} hidden={host || shown.length > 0}>{t("room.noOption")}</span>
        </Row>
        <Row id="label-text" label={t("room.text")} role="group">
          {/* COURSE-03 : avant le lancement, le serveur ne donne le texte personnalisé qu'à l'hôte */}
          <span className={PLAIN_VALUE}>{countWords(room.text) ? words : t(!host && isCustom ? "room.textAtLaunch" : "room.noText")}</span>
          {host && <SmallButton onClick={onEditText}>{t("room.edit")}</SmallButton>}
        </Row>
      </div>

      <div className={PANEL} role="tabpanel" id="panel-typing" aria-labelledby="tab-typing" hidden={section !== "typing"}>
        <Row id="label-language" label={t("room.textLanguage")}>
          {radios("language", [["fr", "french"], ["en", "english"]])}
        </Row>
        <Row id="label-level" label={t("room.difficulty")} inactive={room.textType !== "words"}>
          {radios("level", [["common", "common"], ["rich", "rich"], ["expert", "expert"]], undefined, !host || room.textType !== "words")}
        </Row>
        <Row id="label-length" label={t("room.length")}>
          {isCustom ? (
            <span className={PLAIN_VALUE}>{words}</span>
          ) : !host ? (
            <span className={PLAIN_VALUE}>{lengthLabel}</span>
          ) : (
            <>
              {LENGTHS.map((value) => (
                <TextChoice key={value} type="radio" name="length" value={value} label={t(`room.${LENGTH_KEY[value]}`)} checked={room.length === value} onChange={() => pickLength(value)} />
              ))}
              {/* une citation n'a que des longueurs prédéfinies */}
              {room.textType !== "quote" && (
                <>
                  <TextChoice type="radio" name="length" value="other" label={t("room.other")} checked={room.length === "other"} onChange={() => pickLength("other")} />
                  {room.length === "other" && (
                    <NumberField ref={lengthInput} value={room.wordCount} min={1} max={1000} step={5} ariaLabel={t("room.wordCount")} onCommit={(wordCount) => update({ wordCount })} />
                  )}
                </>
              )}
            </>
          )}
        </Row>
        <Row id="label-mistakes" label={t("room.mistakes")} help={help.mistakes}>
          {radios("mistakes", [["fix", "fix"], ["carry-on", "carryOn"], ["fatal", "fatal"]])}
        </Row>
        <ExcludedRow room={room} host={host} update={update} />
      </div>
      {/* A11Y-04 : le départ, fixé en bas de l'écran, vient au clavier après les réglages de l'onglet ouvert */}
      {action}
    </div>
  );
}

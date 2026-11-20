import { useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { SmallButton } from "../../components/buttons/SmallButton";
import { NumberField } from "../../components/forms/NumberField";
import { TextChoice } from "../../components/forms/TextChoice";
import { InfoTip } from "../../components/InfoTip";
import { SectionTabs } from "../../components/tabs/SectionTabs";
import { DEFAULT_DURATION, MAX_DURATION, MIN_DURATION, ROLES } from "../../rooms/settings";
import type { RoomState } from "./hooks/useRoom";
import { cleanExcluded, countWords, DURATION_PRESETS, durationChoice, type Room, type TextLength } from "./room";
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
  "focus:border-b-white focus:[border-bottom-style:solid] placeholder:tracking-[.04em] placeholder:text-[rgba(255,255,255,.35)]";

/** One setting: its name on the left, its choices on the right. */
function Row({ id, label, help, role = "radiogroup", inactive, children }: RowProps) {
  return (
    <div className={ROW} role={role} aria-labelledby={id}>
      {help ? (
        <span className="inline-flex items-center gap-2.5">
          <span className={LABEL} id={id}>{label}</span>
          <InfoTip text={help} />
        </span>
      ) : (
        <span className={`${LABEL} self-center`} id={id}>{label}</span>
      )}
      <div className={inactive ? `${CHOICES} opacity-35` : CHOICES}>{children}</div>
    </div>
  );
}

function ExcludedRow({ room, host, update }: Pick<RoomState, "room" | "host" | "update">) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(room.excluded);
  const inactive = room.textType === "custom";
  return (
    <div className={ROW}>
      <label className={`${LABEL} self-center`} htmlFor="room-excluded">{t("room.excluded")}</label>
      <div className={inactive ? `${CHOICES} opacity-35` : CHOICES}>
        <input
          className={`${SHORT_INPUT} ${inactive ? "opacity-35" : ""}`.trim()}
          id="room-excluded"
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
  const checkbox = (name: "punctuation" | "numbers" | "specials" | "accents", key: string, disabled: boolean, inactive?: boolean) => (
    <TextChoice type="checkbox" name={name} label={t(`room.${key}`)} checked={room[name]} disabled={disabled} inactive={inactive} hidden={!host && !room[name]} onChange={(e) => update({ [name]: e.target.checked })} />
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

  const help = {
    visibility: t(`room.help${{ private: "Private", semi: "SemiPrivate", public: "Public" }[room.visibility]}`),
    speed: t(`room.help${{ slow: "Slow", medium: "Medium", fast: "Fast", mixed: "Mixed" }[room.botSpeed]}`),
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
        {action}
      </div>

      <div className={PANEL} role="tabpanel" id="panel-room" aria-labelledby="tab-room" hidden={section !== "room"}>
        <Row id="label-visibility" label={t("room.visibility")} help={help.visibility}>
          {radios("visibility", [["private", "private"], ["semi", "semiPrivate"], ["public", "public"]])}
        </Row>
        {host && (
          <Row id="label-role" label={t("room.role")} help={t("room.helpRole")}>
            {ROLES.map((role) => (
              <TextChoice key={role} type="radio" name="role" value={role} label={t(`room.role_${role}`)} checked={state.role === role} onChange={() => state.setRole(role)} />
            ))}
          </Row>
        )}
        <Row id="label-duration" label={t("room.raceLength")} help={t("room.helpRaceTime")}>
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
      </div>

      <div className={PANEL} role="tabpanel" id="panel-bots" aria-labelledby="tab-bots" hidden={section !== "bots"}>
        <Row id="label-bots" label={t("room.bots")} help={t("room.helpBots")}>
          {[true, false].map((value) => (
            <TextChoice key={String(value)} type="radio" name="bots" value={value ? "yes" : "no"} label={t(value ? "room.yes" : "room.no")} checked={room.bots === value} disabled={!host} hidden={!host && room.bots !== value} onChange={() => update({ bots: value })} />
          ))}
        </Row>
        <Row id="label-speed" label={t("room.botSpeed")} help={help.speed} inactive={!usesBots}>
          {radios("botSpeed", [["slow", "slow"], ["medium", "botMedium"], ["fast", "fast"], ["mixed", "mixed"]], undefined, !host || !usesBots)}
        </Row>
        <Row id="label-accuracy" label={t("room.botAccuracy")} help={help.accuracy} inactive={!usesBots}>
          {radios("botAccuracy", [["shaky", "shaky"], ["decent", "decent"], ["high", "high"]], undefined, !host || !usesBots)}
        </Row>
      </div>

      <div className={PANEL} role="tabpanel" id="panel-content" aria-labelledby="tab-content" hidden={section !== "content"}>
        <Row id="label-type" label={t("room.textType")} help={help.type}>
          {radios("textType", [["coherent", "coherent"], ["quote", "quote"], ["words", "scrambled"], ["custom", "custom"]], pickTextType)}
        </Row>
        <Row id="label-composition" label={t("room.composition")} role="group" inactive={isCustom}>
          {checkbox("punctuation", "punctuation", !host || room.textType !== "words", room.textType !== "words" && !isCustom)}
          {checkbox("numbers", "numbers", !host || isCustom)}
          {checkbox("specials", "specials", !host || isCustom)}
          {checkbox("accents", "accents", !host || isCustom)}
          <span className={PLAIN_VALUE} hidden={host || room.punctuation || room.numbers || room.specials || room.accents}>{t("room.noOption")}</span>
        </Row>
        <Row id="label-text" label={t("room.text")} role="group">
          <span className={PLAIN_VALUE}>{countWords(room.text) ? words : t("room.noText")}</span>
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
    </div>
  );
}

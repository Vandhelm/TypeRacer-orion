import type { InputHTMLAttributes } from "react";

type TextChoiceProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  type: "radio" | "checkbox";
  label: string;
  /** Dims the choice when it does not apply. */
  inactive?: boolean;
};

const TEXT =
  "flex min-h-[40px] items-center border-b-2 border-b-transparent pb-0.5 font-sans text-[clamp(17px,2.6vh,24px)] leading-[1.1] font-light text-muted " +
  "transition-[color,border-color] duration-200 ease-[ease] motion-reduce:transition-none narrow:min-h-[44px] narrow:text-[21px] " +
  "peer-focus-visible:outline peer-focus-visible:outline-offset-3 peer-focus-visible:outline-white";
const LIT = "peer-hover:text-white peer-checked:border-b-red-text peer-checked:text-white";
// A11Y-01 : une option qui ne s'applique pas mais qu'on peut encore cocher reste lisible : texte muted (6,3:1),
// soulignement line-soft, sans s'allumer. Une opacité de 35 % la ferait tomber à 1,6:1. Désactivée aussi (salle vue par
// un membre), elle reste une valeur affichée : même rendu, sans opacité.
const UNLIT = "peer-checked:border-b-line-soft";

/** Radio or checkbox shown as plain text, underlined when checked (Tailwind). */
export function TextChoice({ label, inactive, hidden, className = "", ...props }: TextChoiceProps) {
  return (
    <label className={`text-choice relative ${className}`.trim()} hidden={hidden}>
      <input className="peer absolute inset-0 m-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed" {...props} />
      <span className={`${TEXT} ${inactive ? UNLIT : LIT}`}>{label}</span>
    </label>
  );
}

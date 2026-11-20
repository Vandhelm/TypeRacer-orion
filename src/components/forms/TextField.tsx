import type { InputHTMLAttributes, ReactNode, Ref } from "react";

type TextFieldProps = {
  id: string;
  label: string;
  /** Small index shown before the label ("01"). */
  num?: string;
  /** Defaults to a single TextInput; pass children for custom layouts (e.g. .code-field). */
  children?: ReactNode;
  inputProps?: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> };
  /** Small button inside the input line (e.g. show password). */
  action?: ReactNode;
};

/** Labeled text input with animated underline (Tailwind). */
export function TextField({ id, label, num, children, inputProps, action }: TextFieldProps) {
  return (
    <div className="flex flex-col gap-[.6vh]">
      <label
        className="flex items-center gap-2.5 font-mono text-[max(10px,1.2vh)] leading-none font-normal tracking-[.2em] text-muted uppercase after:flex-1 after:[border-top:1px_dashed_var(--color-line-faint)]"
        htmlFor={id}
      >
        {num && <span className="text-white">{num}</span>}
        <span>{label}</span>
      </label>
      {children ?? <TextInput id={id} action={action} {...inputProps} />}
    </div>
  );
}

type TextInputProps = InputHTMLAttributes<HTMLInputElement> & { action?: ReactNode; ref?: Ref<HTMLInputElement> };

// The underline grows from the left while the input has focus.
const INPUT_LINE =
  "text-field-input relative flex items-center border-b border-b-line-soft " +
  "after:absolute after:inset-x-0 after:-bottom-px after:h-px after:origin-left after:bg-white after:[transform:scaleX(0)] " +
  "after:transition-[transform] after:duration-[.35s] after:ease-[cubic-bezier(.2,.8,.2,1)] focus-within:after:[transform:scaleX(1)] motion-reduce:after:transition-none";
const INPUT =
  "unset min-h-[36px] h-[4.4vh] min-w-0 grow font-sans text-[max(15px,1.8vh)] leading-none font-normal tracking-[.04em] text-white caret-red-text " +
  "placeholder:text-[rgba(255,255,255,.3)]";

export function TextInput({ action, ref, type = "text", className = "", ...props }: TextInputProps) {
  return (
    <div className={INPUT_LINE}>
      <input ref={ref} type={type} className={`${INPUT} ${className}`.trim()} {...props} />
      {action}
    </div>
  );
}

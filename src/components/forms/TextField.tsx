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

/** Labeled text input with animated underline (styles: components/forms/text-field.css). */
export function TextField({ id, label, num, children, inputProps, action }: TextFieldProps) {
  return (
    <div className="text-field">
      <label className="text-field-label" htmlFor={id}>
        {num && <span className="num">{num}</span>}
        <span>{label}</span>
      </label>
      {children ?? <TextInput id={id} action={action} {...inputProps} />}
    </div>
  );
}

type TextInputProps = InputHTMLAttributes<HTMLInputElement> & { action?: ReactNode; ref?: Ref<HTMLInputElement> };

export function TextInput({ action, ref, type = "text", ...props }: TextInputProps) {
  return (
    <div className="text-field-input">
      <input ref={ref} type={type} {...props} />
      {action}
    </div>
  );
}

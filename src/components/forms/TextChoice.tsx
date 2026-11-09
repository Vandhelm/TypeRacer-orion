import type { InputHTMLAttributes } from "react";

type TextChoiceProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  type: "radio" | "checkbox";
  label: string;
  /** Dims the choice when it does not apply. */
  inactive?: boolean;
};

/** Radio or checkbox shown as plain text, underlined when checked (styles: components/forms/text-choice.css). */
export function TextChoice({ label, inactive, hidden, className = "", ...props }: TextChoiceProps) {
  return (
    <label className={`text-choice ${inactive ? "inactive" : ""} ${className}`.trim().replace(/\s+/g, " ")} hidden={hidden}>
      <input {...props} />
      <span>{label}</span>
    </label>
  );
}

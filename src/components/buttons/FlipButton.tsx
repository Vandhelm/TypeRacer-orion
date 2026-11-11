import type { ButtonHTMLAttributes } from "react";
import { ArrowIcon } from "../icons";

type FlipButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  /** Text shown on the face revealed on hover. */
  backLabel: string;
};

/** Primary button: a 3D block that flips on hover (styles: components/buttons/flip-button.css). */
export function FlipButton({ label, backLabel, className = "", type = "button", ...props }: FlipButtonProps) {
  return (
    <button className={`flip-button ${className}`.trim()} type={type} {...props}>
      <span className="flip-button-inner">
        <span className="flip-button-face flip-button-front">
          <span>{label}</span>
          <ArrowIcon aria-hidden />
        </span>
        <span className="flip-button-face flip-button-bottom" aria-hidden="true">
          <span>{backLabel}</span>
          <ArrowIcon />
        </span>
      </span>
    </button>
  );
}

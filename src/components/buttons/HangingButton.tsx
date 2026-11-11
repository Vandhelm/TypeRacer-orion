import type { AnchorHTMLAttributes, Ref } from "react";

/** Link hanging from two wires (styles: components/buttons/hanging-button.css). */
export function HangingButton({ className = "", ref, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { ref?: Ref<HTMLAnchorElement> }) {
  return <a ref={ref} className={`hanging-button ${className}`.trim()} {...props} />;
}

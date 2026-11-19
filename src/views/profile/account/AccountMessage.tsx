export type Message = { kind: "ok" | "error"; text: string } | null;

/** La réponse à un réglage, lue par les lecteurs d'écran. */
export function AccountMessage({ message }: { message: Message }) {
  return <p className={`font-mono text-[12px] leading-[1.4] font-normal empty:hidden ${message?.kind === "error" ? "text-red-text" : message?.kind === "ok" ? "text-white" : ""}`.trim()} role="status">{message?.text}</p>;
}

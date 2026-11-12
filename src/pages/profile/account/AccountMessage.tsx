export type Message = { kind: "ok" | "error"; text: string } | null;

/** La réponse à un réglage, lue par les lecteurs d'écran. */
export function AccountMessage({ message }: { message: Message }) {
  return <p className={`acc-msg${message ? ` is-${message.kind}` : ""}`} role="status">{message?.text}</p>;
}

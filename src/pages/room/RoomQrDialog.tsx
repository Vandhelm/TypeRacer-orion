import { useImperativeHandle, useRef, type Ref } from "react";
import { useTranslation } from "react-i18next";
import { SmallButton } from "../../components/buttons/SmallButton";
import { QrCode } from "../../components/QrCode";

export type RoomQrHandle = { open(): void };

/** The entry code as a QR code: scanning it opens /room?code=…, the same door as typing the code. */
export function RoomQrDialog({ code, ref }: { code: string; ref?: Ref<RoomQrHandle> }) {
  const { t } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const close = () => dialog.current?.close();
  const url = `${location.origin}/room?code=${code}`;

  useImperativeHandle(ref, () => ({ open: () => dialog.current?.showModal() }), []);

  return (
    <dialog ref={dialog} className="room-qr" aria-labelledby="qr-title" onClick={(e) => e.target === dialog.current && close()}>
      <h2 id="qr-title">{t("room.qrTitle")}</h2>
      <QrCode className="room-qr-code" value={url} label={t("room.qrLabel", { code })} />
      <p className="room-qr-value">{code}</p>
      <p className="room-qr-help">{t("room.qrHelp")}</p>
      <SmallButton autoFocus onClick={close}>{t("room.close")}</SmallButton>
    </dialog>
  );
}

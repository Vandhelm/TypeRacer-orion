import { useCallback, useEffect, useState } from "react";
import { inviteApi, type RoomError } from "../api";
import type { InviteView } from "../invites";

/**
 * SALLE-04 : les liens d'invitation du salon, pour l'hôte. Relus à chaque changement des membres (`members`) : un
 * invité qui arrive par son lien le fait passer à « utilisé par… ». Rien n'est demandé si l'on n'est pas l'hôte.
 */
export function useInvites(code: string, host: boolean, members: unknown) {
  const [invites, setInvites] = useState<InviteView[]>([]);
  const [error, setError] = useState<RoomError | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!code || !host) return;
    let live = true;
    inviteApi.list(code).then((reply) => {
      if (!live) return;
      if (reply.ok) {
        setInvites(reply.data.invites);
        setError((current) => (current === "invite_limit" ? current : null));
      } else setError(reply.error);
    });
    return () => {
      live = false;
    };
  }, [code, host, members]);

  const create = useCallback(async () => {
    setBusy(true);
    const reply = await inviteApi.create(code);
    setBusy(false);
    if (!reply.ok) {
      setError(reply.error);
      return null;
    }
    setError(null);
    setInvites((current) => [...current, reply.data.invite]);
    return reply.data.invite;
  }, [code]);

  return { invites, error, busy, create };
}

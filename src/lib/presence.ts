import {
  subscribeRustRealtime,
  type RustRealtimeSubscription,
} from "./rust-api";

export type PresenceSubscription = {
  close: () => void;
};

export function subscribeToMemberPresence(
  memberId: string,
  onChange: (onlineMemberIds: ReadonlySet<string>) => void,
  onError?: (message: string) => void,
): PresenceSubscription {
  let closed = false;
  let current: RustRealtimeSubscription | null = null;
  let latest = new Set<string>();

  const publish = (ids: Iterable<string>) => {
    if (closed) return;
    latest = new Set(ids);
    latest.add(memberId);
    onChange(new Set(latest));
  };

  void subscribeRustRealtime((event) => {
    if (event.type === "presenceSnapshot") publish(event.payload.memberIds);
  }, (status) => {
    if (status === "error" || status === "disconnected") {
      onError?.("A presença em tempo real foi interrompida.");
    }
  }).then((subscription) => {
    if (closed) subscription.close();
    else current = subscription;
  }).catch(() => onError?.("Não foi possível conectar a presença em tempo real."));

  return {
    close: () => {
      closed = true;
      current?.close();
      latest.clear();
    },
  };
}

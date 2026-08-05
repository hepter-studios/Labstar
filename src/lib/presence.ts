import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabaseClient } from "./supabase";

export type PresenceSubscription = {
  channel: RealtimeChannel;
  close: () => void;
};

type PresencePayload = {
  memberId: string;
  activeAt: string;
};

function requireClient() {
  if (!supabaseClient) throw new Error("supabase_not_configured");
  return supabaseClient;
}

function readOnlineMembers(channel: RealtimeChannel) {
  const state = channel.presenceState() as Record<string, PresencePayload[]>;
  const online = new Set<string>();

  for (const [presenceKey, entries] of Object.entries(state)) {
    const memberId = entries.find((entry) => typeof entry?.memberId === "string")?.memberId ?? presenceKey;
    if (memberId) online.add(memberId);
  }

  return online;
}

export function subscribeToMemberPresence(
  memberId: string,
  onChange: (onlineMemberIds: ReadonlySet<string>) => void,
  onError?: (message: string) => void,
): PresenceSubscription {
  const client = requireClient();
  const channel = client.channel("labstar-presence-v2", {
    config: {
      presence: { key: memberId },
    },
  });

  let closed = false;
  let heartbeat = 0;
  let tracked = false;

  const publishSnapshot = () => {
    if (closed) return;
    const online = readOnlineMembers(channel);
    if (tracked && document.visibilityState === "visible") online.add(memberId);
    onChange(online);
  };

  const track = async () => {
    if (closed || document.visibilityState !== "visible") return;
    const result = await channel.track({
      memberId,
      activeAt: new Date().toISOString(),
    } satisfies PresencePayload);
    tracked = result === "ok";
    if (!tracked) onError?.("Não foi possível atualizar a presença agora.");
    publishSnapshot();
  };

  const untrack = async () => {
    if (closed || !tracked) return;
    tracked = false;
    await channel.untrack().catch(() => undefined);
    publishSnapshot();
  };

  channel
    .on("presence", { event: "sync" }, publishSnapshot)
    .on("presence", { event: "join" }, publishSnapshot)
    .on("presence", { event: "leave" }, publishSnapshot)
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void track();
        heartbeat = window.setInterval(() => void track(), 25_000);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        tracked = false;
        publishSnapshot();
        onError?.("A presença em tempo real foi interrompida.");
      }
    });

  const handleVisibility = () => {
    if (document.visibilityState === "visible") void track();
    else void untrack();
  };
  const handlePageHide = () => {
    void untrack();
  };

  document.addEventListener("visibilitychange", handleVisibility);
  window.addEventListener("pagehide", handlePageHide);

  return {
    channel,
    close: () => {
      if (closed) return;
      closed = true;
      tracked = false;
      window.clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", handlePageHide);
      void channel.untrack();
      void client.removeChannel(channel);
    },
  };
}

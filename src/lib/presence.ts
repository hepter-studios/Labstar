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
  const channel = client.channel("labstar-presence-v1", {
    config: {
      presence: { key: memberId },
    },
  });

  let closed = false;
  let heartbeat = 0;

  const publishSnapshot = () => {
    if (!closed) onChange(readOnlineMembers(channel));
  };

  const track = async () => {
    if (closed) return;
    const result = await channel.track({
      memberId,
      activeAt: new Date().toISOString(),
    } satisfies PresencePayload);
    if (result !== "ok") onError?.("Não foi possível atualizar a presença agora.");
  };

  channel
    .on("presence", { event: "sync" }, publishSnapshot)
    .on("presence", { event: "join" }, publishSnapshot)
    .on("presence", { event: "leave" }, publishSnapshot)
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void track();
        heartbeat = window.setInterval(() => void track(), 25_000);
        publishSnapshot();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        onError?.("A presença em tempo real foi interrompida.");
      }
    });

  const handleVisibility = () => {
    if (document.visibilityState === "visible") void track();
  };
  const handlePageHide = () => {
    void channel.untrack();
  };

  document.addEventListener("visibilitychange", handleVisibility);
  window.addEventListener("pagehide", handlePageHide);

  return {
    channel,
    close: () => {
      if (closed) return;
      closed = true;
      window.clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", handlePageHide);
      void channel.untrack();
      void client.removeChannel(channel);
    },
  };
}

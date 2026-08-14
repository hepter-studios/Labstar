import type { RealtimeChannel } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { supabaseClient } from "./supabase";

export type PresenceSubscription = {
  channel: RealtimeChannel;
  close: () => void;
};

type PresencePayload = {
  memberId: string;
  connectedAt: string;
};

type PresenceListener = {
  onChange: (onlineMemberIds: ReadonlySet<string>) => void;
  onError?: (message: string) => void;
};

let sharedChannel: RealtimeChannel | null = null;
let sharedMemberId = "";
let sharedSnapshot: ReadonlySet<string> = new Set();
let listenerSequence = 0;
const listeners = new Map<number, PresenceListener>();

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

function notifySnapshot() {
  for (const listener of listeners.values()) listener.onChange(sharedSnapshot);
}

function notifyError(message: string) {
  for (const listener of listeners.values()) listener.onError?.(message);
}

function closeSharedChannel() {
  const channel = sharedChannel;
  sharedChannel = null;
  sharedMemberId = "";
  sharedSnapshot = new Set();
  if (!channel || !supabaseClient) return;
  void channel.untrack().catch(() => undefined);
  void supabaseClient.removeChannel(channel);
}

function ensureSharedChannel(memberId: string) {
  if (sharedChannel && sharedMemberId === memberId) return sharedChannel;
  closeSharedChannel();

  const client = requireClient();
  const channel = client.channel("labstar-presence-v3", {
    config: { presence: { key: memberId } },
  });
  sharedChannel = channel;
  sharedMemberId = memberId;

  const publish = () => {
    if (sharedChannel !== channel) return;
    sharedSnapshot = readOnlineMembers(channel);
    notifySnapshot();
  };

  channel
    .on("presence", { event: "sync" }, publish)
    .on("presence", { event: "join" }, publish)
    .on("presence", { event: "leave" }, publish)
    .subscribe((status) => {
      if (sharedChannel !== channel) return;
      if (status === "SUBSCRIBED") {
        void channel.track({
          memberId,
          connectedAt: new Date().toISOString(),
        } satisfies PresencePayload).then((result) => {
          if (result !== "ok") notifyError("Não foi possível atualizar a presença agora.");
          publish();
        });
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        sharedSnapshot = new Set();
        notifySnapshot();
        notifyError("A presença em tempo real foi interrompida.");
      }
    });

  return channel;
}

export function subscribeToMemberPresence(
  memberId: string,
  onChange: (onlineMemberIds: ReadonlySet<string>) => void,
  onError?: (message: string) => void,
): PresenceSubscription {
  if (!memberId) throw new Error("member_id_required");
  const id = ++listenerSequence;
  listeners.set(id, { onChange, onError });
  const channel = ensureSharedChannel(memberId);
  onChange(sharedSnapshot);

  let closed = false;
  return {
    channel,
    close: () => {
      if (closed) return;
      closed = true;
      listeners.delete(id);
      if (!listeners.size) closeSharedChannel();
    },
  };
}

export function useMemberPresence(memberId: string, onError?: (message: string) => void) {
  const [onlineMemberIds, setOnlineMemberIds] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (!memberId) {
      setOnlineMemberIds(new Set());
      return undefined;
    }
    try {
      const subscription = subscribeToMemberPresence(memberId, (online) => setOnlineMemberIds(new Set(online)), onError);
      return subscription.close;
    } catch {
      setOnlineMemberIds(new Set());
      onError?.("A presença em tempo real não está disponível.");
      return undefined;
    }
  }, [memberId, onError]);

  return onlineMemberIds;
}

export function memberPresenceStatus(
  onlineMemberIds: ReadonlySet<string>,
  currentMemberId: string,
  targetMemberId: string,
): "online" | "offline" | undefined {
  if (!targetMemberId || targetMemberId === currentMemberId) return undefined;
  return onlineMemberIds.has(targetMemberId) ? "online" : "offline";
}

import { useEffect } from "react";
import { getCurrentAccessIdentity, subscribeToAccessChanges } from "../lib/access";
import { clearPresence, publishPresence, type PresenceStatus } from "../lib/presence";
import { supabaseClient } from "../lib/supabase";

const HEARTBEAT_MS = 35_000;
const REFRESH_MS = 30_000;
const ONLINE_WINDOW_MS = 95_000;

type PresenceRow = {
  id: string;
  name: string;
  status: "pending" | "active" | "suspended";
  last_seen_at: string | null;
};

function presenceStatus(row: PresenceRow, currentMemberId: string): PresenceStatus {
  if (row.status !== "active") return "offline";
  if (row.id === currentMemberId && document.visibilityState === "visible") return "online";
  const seen = row.last_seen_at ? new Date(row.last_seen_at).getTime() : 0;
  return seen > 0 && Date.now() - seen <= ONLINE_WINDOW_MS ? "online" : "offline";
}

export function PresenceBridge() {
  useEffect(() => {
    if (!supabaseClient) {
      clearPresence();
      return;
    }

    let disposed = false;
    let heartbeatTimer: number | null = null;
    let refreshTimer: number | null = null;
    let realtimeChannel: ReturnType<NonNullable<typeof supabaseClient>["channel"]> | null = null;
    let currentMemberId = "";

    const clearTimers = () => {
      if (heartbeatTimer !== null) window.clearInterval(heartbeatTimer);
      if (refreshTimer !== null) window.clearInterval(refreshTimer);
      heartbeatTimer = null;
      refreshTimer = null;
    };

    const refresh = async () => {
      if (disposed || !currentMemberId) return;
      const { data, error } = await supabaseClient
        .from("members")
        .select("id,name,status,last_seen_at")
        .order("name", { ascending: true });
      if (disposed || error || !data) return;
      publishPresence((data as PresenceRow[]).map((row) => ({
        id: row.id,
        name: row.name,
        status: presenceStatus(row, currentMemberId),
        lastSeenAt: row.last_seen_at ?? "",
      })));
    };

    const heartbeat = async () => {
      if (disposed || !currentMemberId || document.visibilityState !== "visible") return;
      const now = new Date().toISOString();
      await supabaseClient
        .from("members")
        .update({ last_seen_at: now })
        .eq("id", currentMemberId);
      if (!disposed) await refresh();
    };

    const stopRealtime = async () => {
      if (realtimeChannel) {
        await supabaseClient.removeChannel(realtimeChannel).catch(() => undefined);
      }
      realtimeChannel = null;
    };

    const start = async () => {
      clearTimers();
      await stopRealtime();
      clearPresence();
      currentMemberId = "";

      try {
        const identity = await getCurrentAccessIdentity();
        if (disposed || !identity?.member || identity.authorization !== "active") return;
        currentMemberId = identity.member.id;

        await heartbeat();
        if (disposed) return;

        realtimeChannel = supabaseClient
          .channel(`labstar-presence-members-${currentMemberId}`)
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "members" },
            () => void refresh(),
          );
        realtimeChannel.subscribe();

        heartbeatTimer = window.setInterval(() => void heartbeat(), HEARTBEAT_MS);
        refreshTimer = window.setInterval(() => void refresh(), REFRESH_MS);
      } catch {
        clearPresence();
      }
    };

    const visibility = () => {
      if (document.visibilityState === "visible") void heartbeat();
      else void refresh();
    };

    void start();
    const unsubscribeAuth = subscribeToAccessChanges(() => void start());
    document.addEventListener("visibilitychange", visibility);

    return () => {
      disposed = true;
      clearTimers();
      unsubscribeAuth();
      document.removeEventListener("visibilitychange", visibility);
      void stopRealtime();
      clearPresence();
    };
  }, []);

  return null;
}

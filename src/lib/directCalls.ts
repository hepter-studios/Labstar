import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabaseClient } from "./supabase";

export type DirectCallKind = "audio" | "video";
export type DirectCallStatus = "ringing" | "accepted" | "rejected" | "ended" | "missed";
export type DirectCallSignalType = "offer" | "answer" | "ice" | "hangup" | "reject";
export type DirectCallListenerScope = "surface" | "global";

declare global {
  interface Window {
    __LABSTAR_GLOBAL_CALL_BRIDGE__?: boolean;
  }
}

export type DirectCallSession = {
  id: string;
  threadId: string;
  initiatorId: string;
  recipientId: string;
  kind: DirectCallKind;
  status: DirectCallStatus;
  createdAt: string;
  answeredAt: string | null;
  endedAt: string | null;
};

export type DirectCallSignal = {
  id: string;
  callId: string;
  senderId: string;
  recipientId: string;
  signalType: DirectCallSignalType;
  payload: Record<string, unknown> | null;
  createdAt: string;
};

function requireClient() {
  if (!supabaseClient) throw new Error("supabase_not_configured");
  return supabaseClient;
}

function globalBridgeOwnsIncomingCalls(scope: DirectCallListenerScope) {
  return scope === "surface"
    && typeof window !== "undefined"
    && window.__LABSTAR_GLOBAL_CALL_BRIDGE__ === true;
}

function sessionFromRow(row: Record<string, unknown>): DirectCallSession {
  return {
    id: String(row.id),
    threadId: String(row.thread_id),
    initiatorId: String(row.initiator_id),
    recipientId: String(row.recipient_id),
    kind: String(row.kind) as DirectCallKind,
    status: String(row.status) as DirectCallStatus,
    createdAt: String(row.created_at),
    answeredAt: row.answered_at ? String(row.answered_at) : null,
    endedAt: row.ended_at ? String(row.ended_at) : null,
  };
}

function signalFromRow(row: Record<string, unknown>): DirectCallSignal {
  const payload = row.payload && typeof row.payload === "object"
    ? row.payload as Record<string, unknown>
    : null;
  return {
    id: String(row.id),
    callId: String(row.call_id),
    senderId: String(row.sender_id),
    recipientId: String(row.recipient_id),
    signalType: String(row.signal_type) as DirectCallSignalType,
    payload,
    createdAt: String(row.created_at),
  };
}

export async function createDirectCall(
  threadId: string,
  recipientId: string,
  kind: DirectCallKind,
) {
  const { data, error } = await requireClient().rpc("create_direct_call", {
    target_thread_id: threadId,
    target_recipient_id: recipientId,
    target_kind: kind,
  });
  if (error) throw error;
  return String(data);
}

export async function getDirectCall(callId: string) {
  const { data, error } = await requireClient()
    .from("direct_call_sessions")
    .select("*")
    .eq("id", callId)
    .single();
  if (error) throw error;
  return sessionFromRow(data as Record<string, unknown>);
}

export async function listPendingIncomingCalls(
  memberId: string,
  scope: DirectCallListenerScope = "surface",
) {
  if (globalBridgeOwnsIncomingCalls(scope)) return [];
  const recentThreshold = new Date(Date.now() - 90_000).toISOString();
  const { data, error } = await requireClient()
    .from("direct_call_sessions")
    .select("*")
    .eq("recipient_id", memberId)
    .eq("status", "ringing")
    .gte("created_at", recentThreshold)
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) throw error;
  return (data ?? []).map((row) => sessionFromRow(row as Record<string, unknown>));
}

export async function setDirectCallStatus(callId: string, status: DirectCallStatus) {
  const { error } = await requireClient().rpc("set_direct_call_status", {
    target_call_id: callId,
    target_status: status,
  });
  if (error) throw error;
}

export async function sendDirectCallSignal(
  callId: string,
  recipientId: string,
  signalType: DirectCallSignalType,
  payload: Record<string, unknown> | null,
) {
  const { error } = await requireClient().rpc("send_direct_call_signal", {
    target_call_id: callId,
    target_recipient_id: recipientId,
    target_signal_type: signalType,
    target_payload: payload ?? {},
  });
  if (error) throw error;
}

export async function listDirectCallSignals(callId: string) {
  const { data, error } = await requireClient()
    .from("direct_call_signals")
    .select("*")
    .eq("call_id", callId)
    .order("id", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => signalFromRow(row as Record<string, unknown>));
}

export function subscribeIncomingDirectCalls(
  recipientId: string,
  onCall: (session: DirectCallSession) => void,
  scope: DirectCallListenerScope = "surface",
): RealtimeChannel | null {
  if (globalBridgeOwnsIncomingCalls(scope)) return null;
  return requireClient()
    .channel(`labstar-incoming-call-${scope}-${recipientId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "direct_call_sessions",
        filter: `recipient_id=eq.${recipientId}`,
      },
      (payload) => onCall(sessionFromRow(payload.new as Record<string, unknown>)),
    )
    .subscribe();
}

export function subscribeDirectCall(
  callId: string,
  onSession: (session: DirectCallSession) => void,
  onSignal: (signal: DirectCallSignal) => void,
): RealtimeChannel {
  return requireClient()
    .channel(`labstar-direct-call-${callId}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "direct_call_sessions", filter: `id=eq.${callId}` },
      (payload) => onSession(sessionFromRow(payload.new as Record<string, unknown>)),
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "direct_call_signals", filter: `call_id=eq.${callId}` },
      (payload) => onSignal(signalFromRow(payload.new as Record<string, unknown>)),
    )
    .subscribe();
}

export function unsubscribeDirectCall(channel: RealtimeChannel | null) {
  if (channel) void requireClient().removeChannel(channel);
}

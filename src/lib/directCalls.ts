import {
  jsonBody,
  rustApi,
  subscribeRustRealtime,
  type RustRealtimeSubscription,
} from "./rust-api";

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

export type DirectCallSubscription = {
  close: () => void;
};

function globalBridgeOwnsIncomingCalls(scope: DirectCallListenerScope) {
  return scope === "surface"
    && typeof window !== "undefined"
    && window.__LABSTAR_GLOBAL_CALL_BRIDGE__ === true;
}

export async function createDirectCall(
  threadId: string,
  recipientId: string,
  kind: DirectCallKind,
) {
  const response = await rustApi<{ callId: string }>("/v1/calls", {
    method: "POST",
    body: jsonBody({ threadId, recipientId, kind }),
  });
  return response.callId;
}

export async function getDirectCall(callId: string) {
  return rustApi<DirectCallSession>(`/v1/calls/${encodeURIComponent(callId)}`);
}

export async function listPendingIncomingCalls(
  _memberId: string,
  scope: DirectCallListenerScope = "surface",
) {
  if (globalBridgeOwnsIncomingCalls(scope)) return [];
  return rustApi<DirectCallSession[]>("/v1/calls/pending");
}

export async function setDirectCallStatus(callId: string, status: DirectCallStatus) {
  await rustApi(`/v1/calls/${encodeURIComponent(callId)}/status`, {
    method: "POST",
    body: jsonBody({ status }),
  });
}

export async function sendDirectCallSignal(
  callId: string,
  recipientId: string,
  signalType: DirectCallSignalType,
  payload: Record<string, unknown> | null,
) {
  await rustApi(`/v1/calls/${encodeURIComponent(callId)}/signals`, {
    method: "POST",
    body: jsonBody({ recipientId, signalType, payload: payload ?? {} }),
  });
}

export async function listDirectCallSignals(callId: string) {
  return rustApi<DirectCallSignal[]>(`/v1/calls/${encodeURIComponent(callId)}/signals`);
}

export function subscribeIncomingDirectCalls(
  _recipientId: string,
  onCall: (session: DirectCallSession) => void,
  scope: DirectCallListenerScope = "surface",
): DirectCallSubscription | null {
  if (globalBridgeOwnsIncomingCalls(scope)) return null;

  let closed = false;
  let current: RustRealtimeSubscription | null = null;
  void subscribeRustRealtime((event) => {
    if (event.type !== "callCreated") return;
    void getDirectCall(event.payload.callId)
      .then((session) => {
        if (!closed && session.status === "ringing") onCall(session);
      })
      .catch(() => undefined);
  }).then((subscription) => {
    if (closed) subscription.close();
    else current = subscription;
  }).catch(() => undefined);

  return {
    close: () => {
      closed = true;
      current?.close();
    },
  };
}

export function subscribeDirectCall(
  callId: string,
  onSession: (session: DirectCallSession) => void,
  onSignal: (signal: DirectCallSignal) => void,
): DirectCallSubscription {
  let closed = false;
  let current: RustRealtimeSubscription | null = null;
  const processedSignals = new Set<string>();

  void subscribeRustRealtime((event) => {
    if (event.type === "callUpdated" && event.payload.callId === callId) {
      void getDirectCall(callId)
        .then((session) => {
          if (!closed) onSession(session);
        })
        .catch(() => undefined);
      return;
    }

    if (event.type === "callSignal" && event.payload.callId === callId) {
      void listDirectCallSignals(callId)
        .then((signals) => {
          for (const signal of signals) {
            if (processedSignals.has(signal.id)) continue;
            processedSignals.add(signal.id);
            if (!closed) onSignal(signal);
          }
        })
        .catch(() => undefined);
    }
  }).then((subscription) => {
    if (closed) subscription.close();
    else current = subscription;
  }).catch(() => undefined);

  return {
    close: () => {
      closed = true;
      current?.close();
    },
  };
}

export function unsubscribeDirectCall(subscription: DirectCallSubscription | null) {
  subscription?.close();
}

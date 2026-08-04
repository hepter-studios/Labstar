import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentAccessIdentity, subscribeToAccessChanges } from "../lib/access";
import {
  listPendingIncomingCalls,
  subscribeIncomingDirectCalls,
  unsubscribeDirectCall,
  type DirectCallSession,
} from "../lib/directCalls";
import { subscribeToMemberPresence } from "../lib/presence";
import { listMembers, type Member } from "../lib/supabase";
import { PrivateCallOverlay } from "./PrivateCallOverlay";

if (typeof window !== "undefined") {
  window.__LABSTAR_GLOBAL_CALL_BRIDGE__ = true;
}

type IncomingCall = {
  session: DirectCallSession;
  contact: Member;
};

export function GlobalDirectCallBridge() {
  const [member, setMember] = useState<Member | null>(null);
  const [contacts, setContacts] = useState<Member[]>([]);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [onlineMemberIds, setOnlineMemberIds] = useState<ReadonlySet<string>>(new Set());
  const incomingRef = useRef<IncomingCall | null>(null);

  useEffect(() => {
    incomingRef.current = incomingCall;
  }, [incomingCall]);

  const receiveCall = useCallback((session: DirectCallSession, availableContacts: Member[]) => {
    if (session.status !== "ringing" || incomingRef.current) return;
    const contact = availableContacts.find((item) => item.id === session.initiatorId);
    if (!contact) return;
    const next = { session, contact };
    incomingRef.current = next;
    setIncomingCall(next);
  }, []);

  useEffect(() => {
    let disposed = false;
    let incomingSubscription: ReturnType<typeof subscribeIncomingDirectCalls> = null;
    let closePresence: (() => void) | null = null;

    const start = async () => {
      unsubscribeDirectCall(incomingSubscription);
      incomingSubscription = null;
      closePresence?.();
      closePresence = null;

      try {
        const identity = await getCurrentAccessIdentity();
        if (disposed || identity?.authorization !== "active" || !identity.member) {
          if (!disposed) {
            setMember(null);
            setContacts([]);
            setIncomingCall(null);
            incomingRef.current = null;
          }
          return;
        }

        const team = await listMembers();
        if (disposed) return;
        const currentMember = identity.member;
        const availableContacts = team.members.filter((item) => item.id !== currentMember.id);
        setMember(currentMember);
        setContacts(availableContacts);

        const presence = subscribeToMemberPresence(
          currentMember.id,
          (online) => {
            if (!disposed) setOnlineMemberIds(new Set(online));
          },
        );
        closePresence = presence.close;

        incomingSubscription = subscribeIncomingDirectCalls(
          currentMember.id,
          (session) => receiveCall(session, availableContacts),
          "global",
        );

        const pending = await listPendingIncomingCalls(currentMember.id, "global");
        if (!disposed && pending[0]) receiveCall(pending[0], availableContacts);
      } catch {
        // A ponte permanece silenciosa quando a sessão ou a migração ainda não
        // estão disponíveis. A interface principal nunca pode deixar de abrir.
      }
    };

    void start();
    const unsubscribeAccess = subscribeToAccessChanges(() => void start());

    return () => {
      disposed = true;
      unsubscribeAccess();
      unsubscribeDirectCall(incomingSubscription);
      closePresence?.();
    };
  }, [receiveCall]);

  if (!member || !incomingCall) return null;

  return (
    <PrivateCallOverlay
      member={member}
      contact={incomingCall.contact}
      session={incomingCall.session}
      direction="incoming"
      contactOnline={onlineMemberIds.has(incomingCall.contact.id)}
      onFinished={() => {
        incomingRef.current = null;
        setIncomingCall(null);
      }}
    />
  );
}

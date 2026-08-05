import { Bell, Check, MessageSquare, PhoneIncoming, Video, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentAccessIdentity, subscribeToAccessChanges } from "../lib/access";
import {
  armCommunicationAudio,
  getCommunicationNotificationPermission,
  requestCommunicationNotifications,
  showCommunicationNotification,
  startIncomingCallRingtone,
  stopIncomingCallRingtone,
  type CommunicationNotification,
  type CommunicationNotificationPermission,
} from "../lib/communication-notifications";
import {
  listPendingIncomingCalls,
  subscribeIncomingDirectCalls,
  unsubscribeDirectCall,
  type DirectCallSession,
} from "../lib/directCalls";
import {
  listDirectThreads,
  subscribeToAllDirectMessages,
  unsubscribeDirect,
  type DirectThreadSummary,
} from "../lib/directMessages";
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

type RuntimeToast = CommunicationNotification & {
  id: string;
};

export function GlobalDirectCallBridge() {
  const [member, setMember] = useState<Member | null>(null);
  const [contacts, setContacts] = useState<Member[]>([]);
  const [threads, setThreads] = useState<DirectThreadSummary[]>([]);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [onlineMemberIds, setOnlineMemberIds] = useState<ReadonlySet<string>>(new Set());
  const [permission, setPermission] = useState<CommunicationNotificationPermission>(() => getCommunicationNotificationPermission());
  const [toast, setToast] = useState<RuntimeToast | null>(null);
  const incomingRef = useRef<IncomingCall | null>(null);
  const notifiedCallIds = useRef<Set<string>>(new Set());
  const toastTimer = useRef(0);

  useEffect(() => {
    incomingRef.current = incomingCall;
  }, [incomingCall]);

  useEffect(() => {
    const arm = () => armCommunicationAudio();
    window.addEventListener("pointerdown", arm, { once: true, capture: true });
    window.addEventListener("keydown", arm, { once: true, capture: true });
    return () => {
      window.removeEventListener("pointerdown", arm, true);
      window.removeEventListener("keydown", arm, true);
    };
  }, []);

  useEffect(() => {
    const receiveNotification = (event: Event) => {
      const detail = (event as CustomEvent<CommunicationNotification>).detail;
      if (!detail) return;
      window.clearTimeout(toastTimer.current);
      setToast({ ...detail, id: `${detail.tag}-${Date.now()}` });
      toastTimer.current = window.setTimeout(() => setToast(null), detail.requireInteraction ? 12_000 : 6500);
    };
    window.addEventListener("labstar:communication-notification", receiveNotification);
    return () => {
      window.removeEventListener("labstar:communication-notification", receiveNotification);
      window.clearTimeout(toastTimer.current);
    };
  }, []);

  const receiveCall = useCallback((session: DirectCallSession, availableContacts: Member[]) => {
    if (session.status !== "ringing" || incomingRef.current) return;
    const contact = availableContacts.find((item) => item.id === session.initiatorId);
    if (!contact) return;
    const next = { session, contact };
    incomingRef.current = next;
    setIncomingCall(next);
    startIncomingCallRingtone();

    if (!notifiedCallIds.current.has(session.id)) {
      notifiedCallIds.current.add(session.id);
      void showCommunicationNotification({
        title: session.kind === "video" ? `Videochamada de ${contact.name}` : `Ligação de ${contact.name}`,
        body: "O Labstar está chamando. Atenda ou recuse a chamada privada.",
        tag: `labstar-call-${session.id}`,
        kind: session.kind === "video" ? "video-call" : "audio-call",
        contactName: contact.name,
        requireInteraction: true,
        critical: true,
      });
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    let incomingSubscription: ReturnType<typeof subscribeIncomingDirectCalls> = null;
    let messagesSubscription: ReturnType<typeof subscribeToAllDirectMessages> | null = null;
    let closePresence: (() => void) | null = null;

    const start = async () => {
      unsubscribeDirectCall(incomingSubscription);
      incomingSubscription = null;
      unsubscribeDirect(messagesSubscription);
      messagesSubscription = null;
      closePresence?.();
      closePresence = null;

      try {
        const identity = await getCurrentAccessIdentity();
        if (disposed || identity?.authorization !== "active" || !identity.member) {
          if (!disposed) {
            setMember(null);
            setContacts([]);
            setThreads([]);
            setIncomingCall(null);
            incomingRef.current = null;
            stopIncomingCallRingtone();
          }
          return;
        }

        const [teamResult, threadResult] = await Promise.allSettled([
          listMembers(),
          listDirectThreads(),
        ]);
        if (disposed) return;

        const currentMember = identity.member;
        const availableContacts = teamResult.status === "fulfilled"
          ? teamResult.value.members.filter((item) => item.id !== currentMember.id)
          : [];
        const availableThreads = threadResult.status === "fulfilled" ? threadResult.value : [];
        setMember(currentMember);
        setContacts(availableContacts);
        setThreads(availableThreads);

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

        messagesSubscription = subscribeToAllDirectMessages((message) => {
          if (disposed || message.authorId === currentMember.id) return;
          const thread = availableThreads.find((item) => item.threadId === message.threadId);
          const contact = availableContacts.find((item) => item.id === (thread?.otherMemberId ?? message.authorId));
          const contactName = contact?.name ?? "Membro da equipe";
          void showCommunicationNotification({
            title: `Nova mensagem de ${contactName}`,
            body: message.body || "Enviou um anexo",
            tag: `labstar-message-${message.id}`,
            kind: "message",
            contactName,
          });
        });
      } catch {
        // A ponte permanece silenciosa quando a sessão ainda não está pronta.
        // A interface principal nunca pode deixar de abrir.
      }
    };

    void start();
    const unsubscribeAccess = subscribeToAccessChanges(() => void start());

    return () => {
      disposed = true;
      unsubscribeAccess();
      unsubscribeDirectCall(incomingSubscription);
      unsubscribeDirect(messagesSubscription);
      closePresence?.();
      stopIncomingCallRingtone();
    };
  }, [receiveCall]);

  async function enableNotifications() {
    const result = await requestCommunicationNotifications();
    setPermission(result);
    if (result === "granted") {
      void showCommunicationNotification({
        title: "Notificações ativadas",
        body: "O Labstar avisará sobre mensagens e chamadas privadas.",
        tag: "labstar-notifications-enabled",
        kind: "message",
      });
    }
  }

  function openToast() {
    if (!toast) return;
    window.dispatchEvent(new CustomEvent("labstar:open-direct", {
      detail: toast.contactName ? { query: toast.contactName } : {},
    }));
    setToast(null);
  }

  return (
    <>
      {member && permission === "default" && (
        <aside className="communication-permission-card" role="status">
          <span><Bell size={17} /></span>
          <div>
            <strong>Ativar notificações</strong>
            <small>Receba mensagens e chamadas mesmo em outra tela.</small>
          </div>
          <button type="button" onClick={() => void enableNotifications()}>Ativar</button>
          <button className="close" type="button" aria-label="Fechar" onClick={() => setPermission("denied")}><X size={14} /></button>
        </aside>
      )}

      {toast && (
        <aside className={`communication-runtime-toast ${toast.kind}`} role="status">
          <span>{toast.kind === "video-call" ? <Video size={18} /> : toast.kind === "audio-call" ? <PhoneIncoming size={18} /> : <MessageSquare size={18} />}</span>
          <div><strong>{toast.title}</strong><small>{toast.body}</small></div>
          <button type="button" onClick={openToast}>{toast.kind === "message" ? "Abrir" : "Ver chamada"}</button>
          <button className="close" type="button" aria-label="Fechar" onClick={() => setToast(null)}><X size={14} /></button>
        </aside>
      )}

      {member && incomingCall && (
        <PrivateCallOverlay
          member={member}
          contact={incomingCall.contact}
          session={incomingCall.session}
          direction="incoming"
          contactOnline={onlineMemberIds.has(incomingCall.contact.id)}
          onFinished={() => {
            stopIncomingCallRingtone();
            incomingRef.current = null;
            setIncomingCall(null);
          }}
        />
      )}

      {member && permission === "granted" && !toast && !incomingCall && (
        <span className="communication-runtime-ready" aria-hidden="true"><Check size={10} /></span>
      )}
    </>
  );
}

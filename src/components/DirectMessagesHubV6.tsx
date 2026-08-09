import {
  AtSign,
  ArrowLeft,
  Bell,
  Check,
  Clock3,
  Copy,
  Download,
  Edit3,
  File,
  FileCode2,
  FileImage,
  Inbox,
  LoaderCircle,
  Link2,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Phone,
  Pin,
  Plus,
  Reply,
  Save,
  Search,
  Send,
  ShieldCheck,
  Smile,
  Star,
  UserPlus,
  Users,
  Video,
  Volume2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  createDirectCall,
  listPendingIncomingCalls,
  subscribeIncomingDirectCalls,
  unsubscribeDirectCall,
  type DirectCallKind,
  type DirectCallSession,
} from "../lib/directCalls";
import {
  deleteDirectMessage,
  editDirectMessage,
  getOrCreateDirectThread,
  listDirectMessages,
  listDirectThreads,
  markDirectThreadRead,
  pinDirectMessage,
  sendDirectMessage,
  subscribeToDirectThread,
  unsubscribeDirect,
  type DirectMessage,
  type DirectThreadSummary,
} from "../lib/directMessages";
import { useMemberPresence } from "../lib/presence";
import {
  MAX_CHAT_FILE_BYTES,
  MAX_CHAT_FILES,
  chatFileErrorMessage,
  createLargePasteAttachment,
  formatChatBytes,
  mergeChatFiles,
} from "../lib/programmer-files";
import {
  listMembers,
  listNotifications,
  loadCollaboration,
  markAllNotificationsRead,
  markNotificationRead,
  type CollaborationSpace,
  type LabstarNotification,
  type Member,
} from "../lib/supabase";
import { Avatar } from "./Avatar";
import {
  DeveloperAttachmentCard,
  DeveloperFileQueue,
  DeveloperMessageBody,
  markdownAttachmentReference,
} from "./DeveloperChatContent";
import { PrivateCallOverlay } from "./PrivateCallOverlay";
import { DeveloperComposerTools, handleDeveloperComposerKeyDown } from "./DeveloperComposerTools";
import { DeveloperCreateMenu, DeveloperMarkdownStudio, README_TEMPLATE } from "./DeveloperMarkdownStudio";

const dmEmojiSet = [
  "😀", "😃", "😄", "😁", "😂", "🤣", "😊", "🥹",
  "😍", "🥰", "😎", "🤔", "🫡", "😮", "😢", "😭",
  "😡", "👍", "👎", "👏", "🙌", "🤝", "💪", "🙏",
  "👀", "🧠", "💡", "❤️", "💙", "💚", "🔥", "✨",
  "⭐", "🚀", "✅", "❌", "⚠️", "🎯", "📌", "📎",
  "📝", "🎉", "🥳", "💬", "🔒", "🔔", "☕", "💻",
];

const FAVORITES_KEY = "labstar-dm-favorites-v1";
const DM_LOAD_TIMEOUT_MS = 10_000;

function withDmLoadTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("dm_load_timeout")), DM_LOAD_TIMEOUT_MS);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function scrollInside(container: HTMLElement | null, target: HTMLElement | null) {
  if (!container || !target) return;
  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const top = container.scrollTop
    + targetRect.top
    - containerRect.top
    - Math.max(0, (container.clientHeight - targetRect.height) / 2);
  container.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

type Props = {
  member: Member;
  onOpenWorkspace: (channelId?: string) => void;
};

type Contact = {
  member: Member;
  thread: DirectThreadSummary | null;
};

type DirectoryTab = "friends" | "all" | "pending";
type HomeTab = "for-you" | "recent" | "favorites";
type ActiveCall = {
  session: DirectCallSession;
  contact: Member;
  direction: "incoming" | "outgoing";
};

type ToastState = {
  tone: "info" | "success" | "warning" | "error";
  message: string;
} | null;

function loadFavoriteIds() {
  try {
    const value = JSON.parse(window.localStorage.getItem(FAVORITES_KEY) ?? "[]") as unknown;
    return new Set(Array.isArray(value) ? value.map(String) : []);
  } catch {
    return new Set<string>();
  }
}

function memberIsOnline(onlineIds: ReadonlySet<string>, memberId: string) {
  return onlineIds.has(memberId);
}

export function DirectMessagesHub({ member, onOpenWorkspace }: Props) {
  const [spaces, setSpaces] = useState<CollaborationSpace[]>([]);
  const [firstChannels, setFirstChannels] = useState<Record<string, string>>({});
  const [members, setMembers] = useState<Member[]>([]);
  const [threads, setThreads] = useState<DirectThreadSummary[]>([]);
  const [notifications, setNotifications] = useState<LabstarNotification[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dmAvailable, setDmAvailable] = useState(true);
  const [query, setQuery] = useState("");
  const [directoryTab, setDirectoryTab] = useState<DirectoryTab>("friends");
  const [homeTab, setHomeTab] = useState<HomeTab>("for-you");
  const [inboxTab, setInboxTab] = useState<"unread" | "mentions">("unread");
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => loadFavoriteIds());
  const [toast, setToast] = useState<ToastState>(null);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef(0);

  const showToast = useCallback((message: string, tone: NonNullable<ToastState>["tone"] = "info") => {
    window.clearTimeout(toastTimerRef.current);
    setToast({ message, tone });
    toastTimerRef.current = window.setTimeout(() => setToast(null), 4200);
  }, []);
  const handlePresenceError = useCallback((message: string) => showToast(message, "warning"), [showToast]);
  const onlineMemberIds = useMemberPresence(member.id, handlePresenceError);

  const refreshThreads = useCallback(async (silent = false) => {
    try {
      setThreads(await withDmLoadTimeout(listDirectThreads()));
      setDmAvailable(true);
    } catch {
      setDmAvailable(false);
      if (!silent) showToast("A estrutura segura das mensagens privadas ainda não respondeu. Tentando recuperar…", "error");
    }
  }, [showToast]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [teamResult, collaborationResult, notificationResult] = await Promise.allSettled([
        withDmLoadTimeout(listMembers()),
        withDmLoadTimeout(loadCollaboration()),
        withDmLoadTimeout(listNotifications(member.id)),
      ]);
      if (cancelled) return;

      if (teamResult.status === "fulfilled") setMembers(teamResult.value.members);
      else showToast("Não foi possível carregar a equipe agora.", "error");

      if (collaborationResult.status === "fulfilled") {
        setSpaces(collaborationResult.value.spaces);
        const map: Record<string, string> = {};
        for (const space of collaborationResult.value.spaces) {
          const first = collaborationResult.value.channels.find((channel) => channel.spaceId === space.id);
          if (first) map[space.id] = first.id;
        }
        setFirstChannels(map);
      }

      if (notificationResult.status === "fulfilled") setNotifications(notificationResult.value);
      await refreshThreads(true);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(toastTimerRef.current);
    };
  }, [member.id, refreshThreads, showToast]);

  useEffect(() => {
    if (!members.length) return undefined;
    const receive = (session: DirectCallSession) => {
      if (session.status !== "ringing" || activeCall) return;
      const contact = members.find((item) => item.id === session.initiatorId);
      if (!contact) return;
      setActiveCall({ session, contact, direction: "incoming" });
    };

    const subscription = subscribeIncomingDirectCalls(member.id, receive);
    void listPendingIncomingCalls(member.id)
      .then((pending) => pending[0] && receive(pending[0]))
      .catch(() => undefined);

    return () => unsubscribeDirectCall(subscription);
  }, [activeCall, member.id, members]);

  const threadByMember = useMemo(() => {
    const map = new Map<string, DirectThreadSummary>();
    for (const thread of threads) map.set(thread.otherMemberId, thread);
    return map;
  }, [threads]);

  const allContacts = useMemo<Contact[]>(() => members
    .filter((item) => item.id !== member.id)
    .map((item) => ({ member: item, thread: threadByMember.get(item.id) ?? null })), [member.id, members, threadByMember]);

  const activeContacts = allContacts.filter((contact) => contact.member.status === "active");
  const pendingContacts = allContacts.filter((contact) => contact.member.status === "pending");
  const friendContacts = activeContacts.filter((contact) => contact.thread || favoriteIds.has(contact.member.id));

  const directoryContacts = useMemo(() => {
    const source = directoryTab === "pending"
      ? pendingContacts
      : directoryTab === "all"
        ? activeContacts
        : friendContacts;
    const normalized = query.trim().toLocaleLowerCase();
    const filtered = normalized
      ? source.filter(({ member: contact }) => `${contact.name} ${contact.email} ${contact.jobTitle} ${contact.area}`.toLocaleLowerCase().includes(normalized))
      : source;

    return [...filtered].sort((a, b) => {
      const onlineDifference = Number(memberIsOnline(onlineMemberIds, b.member.id)) - Number(memberIsOnline(onlineMemberIds, a.member.id));
      if (onlineDifference) return onlineDifference;
      const aTime = a.thread?.lastMessageAt ?? a.thread?.updatedAt ?? a.member.lastSeenAt;
      const bTime = b.thread?.lastMessageAt ?? b.thread?.updatedAt ?? b.member.lastSeenAt;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });
  }, [activeContacts, directoryTab, friendContacts, onlineMemberIds, pendingContacts, query]);

  const homeContacts = useMemo(() => {
    if (homeTab === "favorites") return activeContacts.filter((contact) => favoriteIds.has(contact.member.id));
    if (homeTab === "recent") {
      return activeContacts
        .filter((contact) => contact.thread)
        .sort((a, b) => new Date(b.thread?.lastMessageAt ?? 0).getTime() - new Date(a.thread?.lastMessageAt ?? 0).getTime());
    }
    return [...activeContacts]
      .sort((a, b) => {
        const aScore = (a.thread?.unreadCount ?? 0) * 100 + (memberIsOnline(onlineMemberIds, a.member.id) ? 30 : 0) + (favoriteIds.has(a.member.id) ? 20 : 0);
        const bScore = (b.thread?.unreadCount ?? 0) * 100 + (memberIsOnline(onlineMemberIds, b.member.id) ? 30 : 0) + (favoriteIds.has(b.member.id) ? 20 : 0);
        return bScore - aScore;
      })
      .slice(0, 8);
  }, [activeContacts, favoriteIds, homeTab, onlineMemberIds]);

  const selectedContact = selectedMemberId
    ? allContacts.find((contact) => contact.member.id === selectedMemberId) ?? null
    : null;

  const unreadDirect = threads.reduce((sum, thread) => sum + thread.unreadCount, 0);
  const unreadNotifications = notifications.filter((item) => !item.isRead);
  const mentions = unreadNotifications.filter((item) => /menç|mencion|@/i.test(`${item.title} ${item.body}`));
  const inboxItems = inboxTab === "mentions" ? mentions : unreadNotifications;

  function toggleFavorite(memberId: string) {
    setFavoriteIds((current) => {
      const next = new Set(current);
      if (next.has(memberId)) {
        next.delete(memberId);
        showToast("Removido dos favoritos.", "info");
      } else {
        next.add(memberId);
        showToast("Contato adicionado aos favoritos.", "success");
      }
      window.localStorage.setItem(FAVORITES_KEY, JSON.stringify([...next]));
      return next;
    });
  }

  async function openContact(contact: Contact) {
    if (contact.member.status !== "active") {
      showToast("Este membro ainda está pendente e não pode receber mensagens privadas.", "warning");
      return;
    }

    setSelectedMemberId(contact.member.id);
    if (contact.thread) {
      setSelectedThreadId(contact.thread.threadId);
      void markDirectThreadRead(contact.thread.threadId)
        .then(() => refreshThreads(true))
        .catch(() => undefined);
      return;
    }

    try {
      const threadId = await getOrCreateDirectThread(contact.member.id);
      setSelectedThreadId(threadId);
      setDmAvailable(true);
      await refreshThreads(true);
    } catch {
      setDmAvailable(false);
      setSelectedThreadId(null);
      showToast("Não foi possível criar a conversa privada. A atualização segura do banco será aplicada antes da publicação.", "error");
    }
  }

  function goHome() {
    setSelectedMemberId(null);
    setSelectedThreadId(null);
  }

  function startNewMessage() {
    goHome();
    setDirectoryTab("all");
    setQuery("");
    window.requestAnimationFrame(() => searchRef.current?.focus());
  }

  function openSecureInvite() {
    const button = document.querySelector<HTMLButtonElement>(".secure-invite-button");
    if (button) button.click();
    else showToast("Abra a área Equipe para criar um convite seguro.", "info");
  }

  async function markInboxRead() {
    try {
      await markAllNotificationsRead(member.id);
      setNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
      showToast("Caixa de entrada marcada como lida.", "success");
    } catch {
      showToast("Não foi possível marcar a caixa de entrada como lida.", "error");
    }
  }

  async function openInboxItem(item: LabstarNotification) {
    if (!item.isRead) {
      await markNotificationRead(item.id).catch(() => undefined);
      setNotifications((current) => current.map((entry) => entry.id === item.id ? { ...entry, isRead: true } : entry));
    }
    if (item.channelId) onOpenWorkspace(item.channelId);
  }

  async function startPrivateCall(contact: Member, threadId: string | null, kind: DirectCallKind) {
    if (!threadId) {
      showToast("Abra ou crie a conversa antes de iniciar uma chamada.", "warning");
      return;
    }
    if (activeCall) {
      showToast("Já existe uma chamada em andamento.", "warning");
      return;
    }
    try {
      const callId = await createDirectCall(threadId, contact.id, kind);
      setActiveCall({
        session: {
          id: callId,
          threadId,
          initiatorId: member.id,
          recipientId: contact.id,
          kind,
          status: "ringing",
          createdAt: new Date().toISOString(),
          answeredAt: null,
          endedAt: null,
        },
        contact,
        direction: "outgoing",
      });
    } catch {
      showToast("Não foi possível iniciar a chamada privada agora.", "error");
    }
  }

  if (loading) {
    return (
      <section className="dm-loading">
        <LoaderCircle className="spin" />
        <strong>Abrindo mensagens diretas</strong>
        <span>Organizando contatos, presença e conversas…</span>
      </section>
    );
  }

  return (
    <section className={`direct-hub dm-v4 dm-v5 dm-v6 ${selectedContact ? "conversation-open" : ""}`}>
      <aside className="dm-space-rail" aria-label="Labstar e espaços">
        <button className="dm-home-mark active" onClick={goHome} title="Mensagens diretas" aria-label="Mensagens diretas">
          <img className="labstar-dm-logo" src="/labstar-dm.svg" alt="" aria-hidden="true" />
          <i />
        </button>
        <div className="dm-space-list">
          {spaces.map((space) => (
            <button
              key={space.id}
              title={space.name}
              style={{ "--space-color": space.color } as React.CSSProperties}
              onClick={() => onOpenWorkspace(firstChannels[space.id])}
            >
              {space.logoUrl ? <img src={space.logoUrl} alt="" /> : <span>{space.icon || "★"}</span>}
            </button>
          ))}
        </div>
        <button className="dm-add-space" onClick={() => onOpenWorkspace()} title="Abrir espaços"><Plus size={20} /></button>
      </aside>

      <aside className="dm-sidebar">
        <label className="dm-search">
          <Search size={14} />
          <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Encontre ou comece uma conversa" />
          <span className="dm-search-hint">⌘K</span>
        </label>

        <nav className="dm-navigation" aria-label="Mensagens diretas">
          <button className={directoryTab === "friends" && !selectedContact ? "active" : ""} onClick={() => { goHome(); setDirectoryTab("friends"); }}><Users size={17} /><span>Amigos</span><b>{friendContacts.length}</b></button>
          <button className={directoryTab === "all" && !selectedContact ? "active" : ""} onClick={() => { goHome(); setDirectoryTab("all"); }}><Users size={17} /><span>Todos</span><b>{activeContacts.length}</b></button>
          <button className={directoryTab === "pending" && !selectedContact ? "active" : ""} onClick={() => { goHome(); setDirectoryTab("pending"); }}><Clock3 size={17} /><span>Pendentes</span>{pendingContacts.length > 0 && <b>{pendingContacts.length}</b>}</button>
          <button onClick={startNewMessage}><UserPlus size={17} /><span>Nova conversa</span></button>
        </nav>

        <div className="dm-divider" />
        <div className="dm-list-heading">
          <span>{directoryTab === "pending" ? "ACESSOS PENDENTES" : "MENSAGENS DIRETAS"}</span>
          <button onClick={startNewMessage} title="Nova mensagem"><Plus size={15} /></button>
        </div>

        <div className="dm-contact-list">
          {directoryContacts.map((contact) => {
            const online = memberIsOnline(onlineMemberIds, contact.member.id);
            return (
              <div className={`dm-contact-entry ${selectedMemberId === contact.member.id ? "active" : ""}`} key={contact.member.id}>
                <button className="dm-contact-main" disabled={contact.member.status !== "active"} onClick={() => void openContact(contact)}>
                  <Avatar name={contact.member.name} url={contact.member.avatarUrl} size="sm" status={online ? "online" : "offline"} />
                  <span>
                    <strong>{contact.member.name}</strong>
                    <small>{contact.member.status === "pending" ? "Aguardando ativação" : online ? "No Labstar agora" : contact.thread?.lastMessageBody || contact.member.jobRoles[0]?.name || contact.member.jobTitle || "Offline"}</small>
                  </span>
                  {contact.thread?.unreadCount
                    ? <b className="dm-unread">{Math.min(99, contact.thread.unreadCount)}</b>
                    : contact.thread?.lastMessageAt
                      ? <time>{formatCompactTime(contact.thread.lastMessageAt)}</time>
                      : null}
                </button>
                {contact.member.status === "active" && (
                  <button
                    className={`dm-favorite-contact ${favoriteIds.has(contact.member.id) ? "active" : ""}`}
                    title={favoriteIds.has(contact.member.id) ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                    data-skip-destructive-guard="true"
                    onClick={() => toggleFavorite(contact.member.id)}
                  >
                    <Star size={12} fill={favoriteIds.has(contact.member.id) ? "currentColor" : "none"} />
                  </button>
                )}
              </div>
            );
          })}
          {!directoryContacts.length && (
            <div className="dm-no-contacts">
              <MessageSquare size={20} />
              <span>{directoryTab === "friends" ? "Comece uma conversa ou favorite alguém para aparecer aqui." : directoryTab === "pending" ? "Nenhum acesso pendente." : "Nenhum contato encontrado."}</span>
            </div>
          )}
        </div>

        <footer className="dm-own-profile">
          <Avatar name={member.name} url={member.avatarUrl} size="sm" />
          <span><strong>{member.name}</strong><small>{member.jobRoles[0]?.name || member.jobTitle || "Membro"}</small></span>
          <b>{memberIsOnline(onlineMemberIds, member.id) ? "Online" : "Conectando"}</b>
        </footer>
      </aside>

      {selectedContact ? (
        <DirectConversation
          member={member}
          contact={selectedContact.member}
          threadId={selectedThreadId}
          dmAvailable={dmAvailable}
          favorite={favoriteIds.has(selectedContact.member.id)}
          contactOnline={memberIsOnline(onlineMemberIds, selectedContact.member.id)}
          onToggleFavorite={() => toggleFavorite(selectedContact.member.id)}
          onThreadsChanged={() => refreshThreads(true)}
          onStartCall={(kind) => void startPrivateCall(selectedContact.member, selectedThreadId, kind)}
          onBack={goHome}
          onToast={showToast}
        />
      ) : (
        <>
          <main className="dm-home-main">
            <header className="dm-home-header">
              <div><Users size={20} /><strong>Mensagens diretas</strong></div>
              <div>
                <button title="Escrever nova mensagem" onClick={startNewMessage}><Pencil size={16} /></button>
                <button title="Convidar pessoa com segurança" onClick={openSecureInvite}><UserPlus size={16} /></button>
              </div>
            </header>

            <div className="dm-home-tabs">
              <button className={homeTab === "for-you" ? "active" : ""} onClick={() => setHomeTab("for-you")}>Para você</button>
              <button className={homeTab === "recent" ? "active" : ""} onClick={() => setHomeTab("recent")}>Recentes</button>
              <button className={homeTab === "favorites" ? "active" : ""} onClick={() => setHomeTab("favorites")}>Favoritos</button>
            </div>

            <section className="dm-home-empty dm-home-dashboard">
              <div className="dm-orbit" aria-hidden="true" />
              <h2>{homeTab === "favorites" ? "Seus favoritos" : homeTab === "recent" ? "Conversas recentes" : "Sua central de conversas"}</h2>
              <p>{homeTab === "favorites" ? "Pessoas que você marcou para acesso rápido." : homeTab === "recent" ? "Continue de onde parou nas conversas mais novas." : "Prioriza pessoas online, mensagens não lidas e favoritos."}</p>
              {homeContacts.length ? (
                <div className="dm-home-contact-grid">
                  {homeContacts.map((contact) => {
                    const online = memberIsOnline(onlineMemberIds, contact.member.id);
                    return (
                      <button key={contact.member.id} onClick={() => void openContact(contact)}>
                        <Avatar name={contact.member.name} url={contact.member.avatarUrl} size="md" status={online ? "online" : "offline"} />
                        <span><strong>{contact.member.name}</strong><small>{online ? "Online agora" : contact.thread?.lastMessageBody || contact.member.jobRoles[0]?.name || "Offline"}</small></span>
                        {favoriteIds.has(contact.member.id) && <Star size={12} fill="currentColor" />}
                        {contact.thread?.unreadCount ? <b>{contact.thread.unreadCount}</b> : null}
                      </button>
                    );
                  })}
                </div>
              ) : <button className="dm-primary" onClick={startNewMessage}><Pencil size={16} /> Nova mensagem</button>}
            </section>
          </main>

          <InboxPanel
            inboxTab={inboxTab}
            setInboxTab={setInboxTab}
            items={inboxItems}
            unreadCount={unreadNotifications.length + unreadDirect}
            mentionCount={mentions.length}
            onMarkAll={() => void markInboxRead()}
            onOpenItem={(item) => void openInboxItem(item)}
          />
        </>
      )}

      {toast && (
        <div className={`labstar-toast ${toast.tone}`} role="status">
          <span>{toast.tone === "success" ? <Check size={15} /> : toast.tone === "error" ? <X size={15} /> : <ShieldCheck size={15} />}</span>
          <p>{toast.message}</p>
          <button type="button" onClick={() => setToast(null)} aria-label="Fechar aviso"><X size={14} /></button>
        </div>
      )}

      {activeCall && (
        <PrivateCallOverlay
          member={member}
          contact={activeCall.contact}
          session={activeCall.session}
          direction={activeCall.direction}
          contactOnline={memberIsOnline(onlineMemberIds, activeCall.contact.id)}
          onFinished={() => setActiveCall(null)}
        />
      )}
    </section>
  );
}

function InboxPanel({
  inboxTab,
  setInboxTab,
  items,
  unreadCount,
  mentionCount,
  onMarkAll,
  onOpenItem,
}: {
  inboxTab: "unread" | "mentions";
  setInboxTab: (value: "unread" | "mentions") => void;
  items: LabstarNotification[];
  unreadCount: number;
  mentionCount: number;
  onMarkAll: () => void;
  onOpenItem: (item: LabstarNotification) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? items : items.slice(0, 7);
  return (
    <aside className="dm-inbox">
      <header>
        <div><Inbox size={19} /><strong>Caixa de entrada</strong></div>
        <div><button title="Marcar tudo como lido" onClick={onMarkAll}><Check size={15} /></button></div>
      </header>
      <div className="dm-inbox-tabs">
        <button className={inboxTab === "unread" ? "active" : ""} onClick={() => setInboxTab("unread")}>Não lidas <b>{unreadCount}</b></button>
        <button className={inboxTab === "mentions" ? "active" : ""} onClick={() => setInboxTab("mentions")}>Menções <b>{mentionCount}</b></button>
      </div>
      <div className="dm-inbox-list">
        {visible.map((item, index) => (
          <article key={item.id} className={item.channelId ? "clickable" : ""} onClick={() => onOpenItem(item)}>
            <span className="dm-inbox-icon">{index % 2 ? <Bell size={18} /> : <AtSign size={18} />}</span>
            <div><strong>{item.title}</strong><small>{item.body}</small><em>{item.channelId ? "Abrir canal" : "Atualização"}</em></div>
            <time>{formatCompactTime(item.createdAt)}</time>
            {!item.isRead && <b>1</b>}
          </article>
        ))}
        {!items.length && <div className="dm-inbox-empty"><Inbox size={25} /><strong>Tudo em dia</strong><span>Nenhuma mensagem pendente nesta caixa.</span></div>}
      </div>
      <button className="dm-inbox-all" onClick={() => setShowAll((value) => !value)}>{showAll ? "Mostrar menos" : "Ver todas as mensagens"}</button>
    </aside>
  );
}

function DirectConversation({
  member,
  contact,
  threadId,
  dmAvailable,
  favorite,
  contactOnline,
  onToggleFavorite,
  onThreadsChanged,
  onStartCall,
  onBack,
  onToast,
}: {
  member: Member;
  contact: Member;
  threadId: string | null;
  dmAvailable: boolean;
  favorite: boolean;
  contactOnline: boolean;
  onToggleFavorite: () => void;
  onThreadsChanged: () => void;
  onStartCall: (kind: DirectCallKind) => void;
  onBack: () => void;
  onToast: (message: string, tone?: NonNullable<ToastState>["tone"]) => void;
}) {
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [loading, setLoading] = useState(Boolean(threadId));
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [note, setNote] = useState("");
  const [replying, setReplying] = useState<DirectMessage | null>(null);
  const [editing, setEditing] = useState<DirectMessage | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [codeMode, setCodeMode] = useState(false);
  const [markdownStudio, setMarkdownStudio] = useState<{ mode: "compose" | "edit"; value: string } | null>(null);
  const [uploadNotice, setUploadNotice] = useState("");
  const [uploadNoticeError, setUploadNoticeError] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const imageTargetRef = useRef<"composer" | "studio">("composer");
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const messageScrollRef = useRef<HTMLDivElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);

  const refresh = useCallback(async (scroll = false) => {
    if (!threadId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    try {
      setMessages(await withDmLoadTimeout(listDirectMessages(threadId)));
      void markDirectThreadRead(threadId).catch(() => undefined);
      if (scroll) window.requestAnimationFrame(() => {
        const container = messageScrollRef.current;
        container?.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      });
      setError("");
    } catch {
      setError("Não foi possível carregar esta conversa privada.");
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    setLoading(Boolean(threadId));
    setDraft("");
    setFiles([]);
    setError("");
    setPinnedOnly(false);
    setReplying(null);
    setEditing(null);
    setEmojiOpen(false);
    setCreateMenuOpen(false);
    setCodeMode(false);
    setMarkdownStudio(null);
    setUploadNotice("");
    setUploadNoticeError(false);
    setDragActive(false);
    setNote(window.localStorage.getItem(`labstar-dm-note-${contact.id}`) ?? "");
    void refresh(true);

    if (!threadId) return undefined;
    const subscription = subscribeToDirectThread(threadId, () => void refresh());
    return () => unsubscribeDirect(subscription);
  }, [contact.id, refresh, threadId]);

  useEffect(() => {
    if (!emojiOpen) return undefined;
    const close = (event: PointerEvent) => {
      const node = event.target as Node;
      if (emojiRef.current?.contains(node) || emojiButtonRef.current?.contains(node)) return;
      setEmojiOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setEmojiOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", escape);
    };
  }, [emojiOpen]);

  useEffect(() => {
    if (!createMenuOpen) return undefined;
    const close = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest(".developer-create-menu") || target.closest("[data-developer-create-trigger]")) return;
      setCreateMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCreateMenuOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", escape);
    };
  }, [createMenuOpen]);

  const visibleMessages = messages.filter((message) => (
    (!pinnedOnly || message.isPinned)
    && (!search.trim() || `${message.body} ${message.author?.name ?? ""}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
  ));
  const sharedAssignments = contact.assignments.filter((assignment) => member.assignments.includes(assignment));
  const sharedFiles = messages.flatMap((message) => message.attachments).slice(-4).reverse();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!threadId || sending) return;
    if (editing && !draft.trim()) return;
    if (!editing && !draft.trim() && !files.length) return;

    setSending(true);
    setError("");
    setUploadNotice("");
    setUploadNoticeError(false);
    try {
      if (editing) await editDirectMessage(editing.id, draft);
      else await sendDirectMessage({ threadId, authorId: member.id, body: draft, replyTo: replying?.id ?? null, files });
      setDraft("");
      setFiles([]);
      setEditing(null);
      setReplying(null);
      setEmojiOpen(false);
      await refresh(true);
      onThreadsChanged();
    } catch (sendError) {
      setError(editing ? "Não foi possível editar esta mensagem." : chatFileErrorMessage(sendError));
    } finally {
      setSending(false);
    }
  }

  function addFiles(incoming: Iterable<File>, notice = "") {
    if (editing) return;
    try {
      const next = mergeChatFiles(files, incoming);
      setFiles(next);
      setUploadNotice(notice || `${next.length} de ${MAX_CHAT_FILES} arquivos preparados.`);
      setUploadNoticeError(false);
    } catch (fileError) {
      setUploadNotice(chatFileErrorMessage(fileError));
      setUploadNoticeError(true);
    }
  }

  function pasteIntoComposer(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    if (editing) return;
    const clipboardFiles = Array.from(event.clipboardData.files);
    if (clipboardFiles.length) {
      event.preventDefault();
      addFiles(clipboardFiles, "Arquivo colado e preparado para envio.");
      return;
    }
    const attachment = createLargePasteAttachment(event.clipboardData.getData("text/plain"));
    if (!attachment) return;
    event.preventDefault();
    addFiles([attachment], "A colagem grande virou um anexo para manter o chat leve.");
  }

  function beginReply(message: DirectMessage) {
    setReplying(message);
    setEditing(null);
    setMarkdownStudio(null);
    setDraft("");
    window.requestAnimationFrame(() => composerRef.current?.focus());
  }

  function beginEdit(message: DirectMessage) {
    setEditing(message);
    setReplying(null);
    setFiles([]);
    setUploadNotice("");
    setDraft(message.body);
    setMarkdownStudio({ mode: "edit", value: message.body });
  }

  function clearContext() {
    setEditing(null);
    setReplying(null);
    setMarkdownStudio(null);
    setDraft("");
  }

  function appendTemplate(value: string) {
    setDraft((current) => `${current}${current.trim() ? "\n" : ""}${value.trimStart()}`);
    window.requestAnimationFrame(() => composerRef.current?.focus());
  }

  function openMarkdownStudio() {
    setMarkdownStudio({ mode: "compose", value: draft.trim() ? draft : README_TEMPLATE });
  }

  function requestMarkdownImage(target: "composer" | "studio") {
    if (editing) {
      onToast("Durante a edição, os anexos originais são preservados.");
      return;
    }
    imageTargetRef.current = target;
    imageRef.current?.click();
  }

  function addMarkdownImages(incoming: File[]) {
    if (!incoming.length || editing) return;
    addFiles(incoming, `${incoming.length} imagem(ns) anexada(s) e inserida(s) no Markdown.`);
    const markdown = incoming.map((file) => {
      const alt = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
      return `![${alt || "Imagem"}](${markdownAttachmentReference(file.name)})`;
    }).join("\n\n");
    if (imageTargetRef.current === "studio") {
      setMarkdownStudio((current) => current ? { ...current, value: `${current.value}${current.value.trim() ? "\n\n" : ""}${markdown}` } : current);
    } else {
      setDraft((current) => `${current}${current.trim() ? "\n\n" : ""}${markdown}`);
      window.requestAnimationFrame(() => composerRef.current?.focus());
    }
  }

  async function confirmMarkdownStudio(attachReadme: boolean) {
    if (!markdownStudio || sending) return;
    if (markdownStudio.mode === "edit" && editing) {
      setSending(true);
      setError("");
      try {
        await editDirectMessage(editing.id, markdownStudio.value);
        setDraft("");
        setEditing(null);
        setMarkdownStudio(null);
        await refresh();
        onThreadsChanged();
      } catch {
        setError("Não foi possível salvar a edição em Markdown.");
      } finally {
        setSending(false);
      }
      return;
    }

    setDraft(markdownStudio.value);
    if (attachReadme) {
      addFiles([new globalThis.File([markdownStudio.value], "README.md", { type: "text/markdown" })], "README.md preparado para envio.");
    }
    setMarkdownStudio(null);
    window.requestAnimationFrame(() => composerRef.current?.focus());
  }

  function saveNote(value: string) {
    setNote(value);
    window.localStorage.setItem(`labstar-dm-note-${contact.id}`, value);
  }

  return (
    <>
      <main className="dm-conversation">
        <header className="dm-conversation-header">
          <button className="dm-mobile-back" type="button" onClick={onBack} aria-label="Voltar para mensagens diretas"><ArrowLeft size={19} /></button>
          <div className="dm-conversation-person">
            <Avatar name={contact.name} url={contact.avatarUrl} size="sm" status={contactOnline ? "online" : "offline"} />
            <span><strong>{contact.name}</strong><small><i /> {contactOnline ? "Online no Labstar" : "Offline"} {contact.jobRoles[0]?.name && <b>{contact.jobRoles[0].name}</b>}</small></span>
          </div>
          <div className="dm-conversation-actions">
            <button data-skip-destructive-guard="true" className={favorite ? "active" : ""} title={favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"} onClick={onToggleFavorite}><Star size={17} fill={favorite ? "currentColor" : "none"} /></button>
            <button title="Iniciar ligação privada" onClick={() => onStartCall("audio")}><Phone size={17} /></button>
            <button title="Iniciar videochamada privada" onClick={() => onStartCall("video")}><Video size={17} /></button>
            <button className={pinnedOnly ? "active" : ""} title={pinnedOnly ? "Mostrar todas" : "Mostrar fixadas"} onClick={() => setPinnedOnly((value) => !value)}><Pin size={17} /></button>
            <label><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nesta conversa" /></label>
          </div>
        </header>

        <div ref={messageScrollRef} className="dm-message-scroll">
          <section className="dm-thread-intro">
            <Avatar name={contact.name} url={contact.avatarUrl} size="xl" status={contactOnline ? "online" : "offline"} />
            <h2>{contact.name}</h2>
            <span>{contact.jobRoles[0]?.name || contact.jobTitle || "Membro da Labstar"}</span>
            <p>Este é o início da sua conversa direta e privada com <b>{contact.name}</b>.</p>
          </section>

          {loading && <div className="dm-thread-loading"><LoaderCircle className="spin" /> Carregando conversa</div>}
          {!loading && visibleMessages.map((message) => (
            <DirectMessageRow
              key={message.id}
              message={message}
              reply={message.replyTo ? messages.find((item) => item.id === message.replyTo) ?? null : null}
              own={message.authorId === member.id}
              onReply={() => beginReply(message)}
              onEdit={() => beginEdit(message)}
              onRefresh={() => refresh()}
              onThreadsChanged={onThreadsChanged}
              onError={(messageValue) => onToast(messageValue, "error")}
            />
          ))}
          {!loading && threadId && !visibleMessages.length && (
            <div className="dm-thread-empty"><MessageSquare size={25} /><strong>{pinnedOnly ? "Nenhuma mensagem fixada" : "Nenhuma mensagem ainda"}</strong><span>{pinnedOnly ? "Fixe mensagens importantes para encontrá-las aqui." : `Envie a primeira mensagem para ${contact.name}.`}</span></div>
          )}
          {!threadId && <div className="dm-thread-empty"><MessageSquare size={25} /><strong>Conversa indisponível</strong><span>A estrutura privada ainda não foi ativada neste ambiente.</span></div>}
        </div>

        <form
          className={`dm-composer ${dragActive ? "developer-drop-active" : ""}`}
          onSubmit={submit}
          onDragEnter={(event) => { if (!editing) { event.preventDefault(); setDragActive(true); } }}
          onDragOver={(event) => { if (!editing) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false); }}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            addFiles(Array.from(event.dataTransfer.files), "Arquivos soltos e preparados para envio.");
          }}
        >
          {(replying || editing) && (
            <div className="dm-composer-context">
              {editing ? <Edit3 size={13} /> : <Reply size={13} />}
              <span>{editing ? "Editando sua mensagem" : <>Respondendo a <b>{replying?.author?.name || "Membro"}</b><small>{replying?.body}</small></>}</span>
              <button type="button" onClick={clearContext}><X size={13} /></button>
            </div>
          )}

          {!!files.length && <DeveloperFileQueue files={files} onRemove={(index) => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} />}
          {uploadNotice && <p className={`developer-composer-notice ${uploadNoticeError ? "error" : ""}`}>{uploadNotice}</p>}

          {error && <div className="dm-composer-notice error">{error}</div>}
          {!dmAvailable && <div className="dm-composer-notice error">Mensagens privadas aguardam a migração segura do banco.</div>}

          {createMenuOpen && (
            <DeveloperCreateMenu
              onUpload={() => fileRef.current?.click()}
              onImage={() => requestMarkdownImage("composer")}
              onCode={() => {
                setCodeMode(true);
                window.requestAnimationFrame(() => composerRef.current?.focus());
              }}
              onMarkdown={openMarkdownStudio}
              onTemplate={appendTemplate}
              onClose={() => setCreateMenuOpen(false)}
            />
          )}

          {codeMode && (
            <DeveloperComposerTools
              textareaRef={composerRef}
              value={draft}
              onChange={setDraft}
              disabled={sending || !threadId || !dmAvailable}
              onClose={() => setCodeMode(false)}
            />
          )}

          {emojiOpen && (
            <div ref={emojiRef} className="dm-emoji-picker" role="listbox" aria-label="Emojis disponíveis">
              <header><strong>Emojis</strong><button type="button" onClick={() => setEmojiOpen(false)} aria-label="Fechar emojis"><X size={14} /></button></header>
              <div>{dmEmojiSet.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  title={`Inserir ${emoji}`}
                  aria-label={`Inserir emoji ${emoji}`}
                  onClick={() => {
                    setDraft((value) => `${value}${emoji}`);
                    setEmojiOpen(false);
                    window.requestAnimationFrame(() => composerRef.current?.focus());
                  }}
                >{emoji}</button>
              ))}</div>
            </div>
          )}

          <div>
            <button data-developer-create-trigger type="button" className={createMenuOpen ? "active" : ""} disabled={Boolean(editing)} aria-expanded={createMenuOpen} onClick={() => setCreateMenuOpen((value) => !value)} title={editing ? "Anexos não mudam durante edição" : `Criar ou anexar até ${MAX_CHAT_FILES} arquivos de ${formatChatBytes(MAX_CHAT_FILE_BYTES)}`}><Plus size={20} /></button>
            <textarea
              ref={composerRef}
              rows={1}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onPaste={pasteIntoComposer}
              onKeyDown={(event) => {
                if (codeMode && handleDeveloperComposerKeyDown(event, draft, setDraft)) return;
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder={editing ? "Edite sua mensagem" : `Mensagem para @${contact.name}`}
              disabled={!threadId || !dmAvailable}
            />
            <button ref={emojiButtonRef} type="button" className={emojiOpen ? "active" : ""} aria-expanded={emojiOpen} title="Escolher emoji" onClick={() => setEmojiOpen((value) => !value)}><Smile size={18} /></button>
            <button type="submit" className="dm-send" disabled={sending || !threadId || (editing ? !draft.trim() : (!draft.trim() && !files.length))}>{sending ? <LoaderCircle className="spin" size={17} /> : editing ? <Save size={17} /> : <Send size={17} />}</button>
          </div>
          <input ref={fileRef} hidden multiple type="file" onChange={(event) => {
            addFiles(Array.from(event.target.files ?? []));
            event.currentTarget.value = "";
          }} />
          <input ref={imageRef} hidden multiple type="file" accept="image/*" onChange={(event) => {
            addMarkdownImages(Array.from(event.target.files ?? []));
            event.currentTarget.value = "";
          }} />
        </form>
      </main>

      {markdownStudio && (
        <DeveloperMarkdownStudio
          value={markdownStudio.value}
          files={files}
          attachments={editing?.attachments ?? []}
          mode={markdownStudio.mode}
          busy={sending}
          onChange={(value) => setMarkdownStudio((current) => current ? { ...current, value } : current)}
          onRequestImage={() => requestMarkdownImage("studio")}
          onCancel={() => {
            if (markdownStudio.mode === "edit") clearContext();
            else setMarkdownStudio(null);
          }}
          onConfirm={(attachReadme) => void confirmMarkdownStudio(attachReadme)}
        />
      )}

      <aside className="dm-profile-panel">
        <div className="dm-profile-hero">
          <Avatar name={contact.name} url={contact.avatarUrl} size="xl" status={contactOnline ? "online" : "offline"} />
          <div><h2>{contact.name}</h2><span>{contact.jobRoles[0]?.name || contact.jobTitle || "Membro"}</span><small>{contactOnline ? "Online agora" : "Offline"}</small></div>
        </div>
        <div className="dm-profile-actions">
          <button onClick={() => composerRef.current?.focus()}><MessageSquare size={16} /><span>Mensagem</span></button>
          <button onClick={() => onStartCall("audio")}><Phone size={16} /><span>Ligação</span></button>
          <button onClick={() => onStartCall("video")}><Video size={16} /><span>Vídeo</span></button>
          <button data-skip-destructive-guard="true" className={favorite ? "active" : ""} onClick={onToggleFavorite}><Star size={16} fill={favorite ? "currentColor" : "none"} /><span>{favorite ? "Favorito" : "Favoritar"}</span></button>
        </div>
        <section><h3>SOBRE</h3><p>{contact.area ? `${contact.jobTitle || "Membro"} · ${contact.area}.` : "Membro da equipe Labstar."}</p></section>
        <section><h3>RESPONSABILIDADE</h3><p>{contact.jobRoles[0]?.department || contact.area || "Colaboração geral"}</p></section>
        <section><h3>PROJETOS COMPARTILHADOS — {sharedAssignments.length}</h3>{sharedAssignments.length ? sharedAssignments.map((assignment) => <div className="dm-shared-item" key={assignment}><span><Star size={13} /></span><div><strong>{assignment}</strong><small>Projeto compartilhado</small></div></div>) : <p>Nenhum projeto compartilhado registrado.</p>}</section>
        <section><h3>ARQUIVOS COMPARTILHADOS</h3>{sharedFiles.length ? sharedFiles.map((attachment) => <a className="dm-shared-file" key={attachment.id} href={attachment.url} target="_blank" rel="noreferrer"><File size={13} /><span>{attachment.fileName}</span><Download size={12} /></a>) : <p>Os arquivos desta conversa aparecerão aqui conforme forem enviados.</p>}</section>
        <section><h3>NOTA PRIVADA</h3><textarea className="dm-note-field" value={note} onChange={(event) => saveNote(event.target.value)} placeholder="Adicione uma nota privada sobre este contato…" /></section>
      </aside>
    </>
  );
}

function DirectMessageRow({
  message,
  reply,
  own,
  onReply,
  onEdit,
  onRefresh,
  onThreadsChanged,
  onError,
}: {
  message: DirectMessage;
  reply: DirectMessage | null;
  own: boolean;
  onReply: () => void;
  onEdit: () => void;
  onRefresh: () => Promise<void>;
  onThreadsChanged: () => void;
  onError: (message: string) => void;
}) {
  const primaryRole = message.author?.jobRoles[0];
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const embeddedAttachmentNames = new Set(
    message.attachments
      .filter((attachment) => message.body.includes(markdownAttachmentReference(attachment.fileName)))
      .map((attachment) => attachment.fileName),
  );
  const visibleAttachments = message.attachments.filter((attachment) => !embeddedAttachmentNames.has(attachment.fileName));

  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", escape);
    };
  }, [menuOpen]);

  async function copyValue(value: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMenuOpen(false);
    } catch {
      onError(`Não foi possível ${successMessage.toLocaleLowerCase()}.`);
    }
  }

  function downloadMarkdownMessage() {
    const blob = new Blob([message.body], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `mensagem-${message.id.slice(0, 8)}.md`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setMenuOpen(false);
  }

  function speakMessage() {
    if (!("speechSynthesis" in window)) {
      onError("A leitura de mensagens não está disponível neste navegador.");
      return;
    }
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(message.body));
    setMenuOpen(false);
  }

  async function togglePin() {
    try {
      await pinDirectMessage(message.id, !message.isPinned);
      await onRefresh();
      setMenuOpen(false);
    } catch {
      onError("Não foi possível alterar a fixação desta mensagem.");
    }
  }

  async function remove() {
    try {
      await deleteDirectMessage(message.id);
      await onRefresh();
      onThreadsChanged();
      setMenuOpen(false);
    } catch {
      onError("Não foi possível excluir esta mensagem.");
    }
  }

  return (
    <article className="dm-message" id={`dm-message-${message.id}`}>
      {reply && (
        <button className="dm-reply-preview" type="button" onClick={(event) => scrollInside(event.currentTarget.closest<HTMLElement>(".dm-message-scroll"), document.getElementById(`dm-message-${reply.id}`))}>
          <Reply size={11} /><b>{reply.author?.name || "Membro"}</b><span>{reply.body}</span>
        </button>
      )}
      <Avatar name={message.author?.name || "Membro"} url={message.author?.avatarUrl} size="md" />
      <div className="dm-message-body">
        <header>
          <strong style={{ color: primaryRole?.color || undefined }}>{message.author?.name || "Membro"}</strong>
          {primaryRole && <b className="dm-role-chip" style={{ "--role-color": primaryRole.color } as React.CSSProperties}>{primaryRole.name}</b>}
          <time>{formatMessageDate(message.createdAt)}</time>
          {message.editedAt && <em>(editada)</em>}
        </header>
        <DeveloperMessageBody body={message.body} attachments={message.attachments} />
        {!!visibleAttachments.length && (
          <div className="dm-attachments">
            {visibleAttachments.map((attachment) => attachment.mimeType.startsWith("image/")
              ? <a key={attachment.id} href={attachment.url} target="_blank" rel="noreferrer" className="dm-image-attachment"><img src={attachment.url} alt={attachment.fileName} /><span><FileImage size={13} />{attachment.fileName}</span></a>
              : <DeveloperAttachmentCard
                  key={attachment.id}
                  fileName={attachment.fileName}
                  mimeType={attachment.mimeType}
                  sizeBytes={attachment.sizeBytes}
                  url={attachment.url}
                />)}
          </div>
        )}
      </div>
      <div className="dm-message-actions">
        <button title="Responder" onClick={onReply}><Reply size={13} /></button>
        {own && <button title="Editar" onClick={onEdit}><Pencil size={13} /></button>}
        <button className={menuOpen ? "active" : ""} title="Mais ações" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}><MoreHorizontal size={14} /></button>
        {menuOpen && (
          <div ref={menuRef} className="dm-message-menu" role="menu">
            <header><strong>Ações da mensagem</strong><small>{formatMessageDate(message.createdAt)}</small></header>
            <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onReply(); }}><Reply size={15} /><span>Responder</span></button>
            {own && <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onEdit(); }}><Pencil size={15} /><span>Editar em Markdown</span></button>}
            <button type="button" role="menuitem" onClick={() => void togglePin()}><Pin size={15} /><span>{message.isPinned ? "Desafixar mensagem" : "Fixar mensagem"}</span></button>
            <i />
            <button type="button" role="menuitem" onClick={() => void copyValue(message.body, "copiar o texto")}><Copy size={15} /><span>Copiar texto</span></button>
            <button type="button" role="menuitem" onClick={() => void copyValue(`${window.location.origin}${window.location.pathname}#dm-message-${message.id}`, "copiar o link")}><Link2 size={15} /><span>Copiar link da mensagem</span></button>
            <button type="button" role="menuitem" onClick={downloadMarkdownMessage}><FileCode2 size={15} /><span>Baixar como Markdown</span></button>
            <button type="button" role="menuitem" onClick={speakMessage}><Volume2 size={15} /><span>Ler mensagem</span></button>
            {own && <><i /><button className="danger" type="button" role="menuitem" data-destructive="true" onClick={() => void remove()}><X size={15} /><span>Excluir mensagem</span></button></>}
          </div>
        )}
      </div>
    </article>
  );
}

function formatCompactTime(value: string) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Ontem";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function formatMessageDate(value: string) {
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

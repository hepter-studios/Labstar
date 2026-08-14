import {
  AtSign,
  Bell,
  Check,
  Clock3,
  Download,
  Edit3,
  File,
  FileImage,
  Inbox,
  LoaderCircle,
  MessageSquare,
  Paperclip,
  Pencil,
  Phone,
  Pin,
  Plus,
  Reply,
  Save,
  Search,
  Send,
  Smile,
  Star,
  UserPlus,
  Users,
  Video,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { Avatar } from "./Avatar";

const dmEmojiSet = ["😀", "😃", "😄", "😁", "😂", "🤣", "😊", "🥹", "😍", "🥰", "😎", "🤔", "🫡", "😮", "😢", "😭", "😡", "👍", "👎", "👏", "🙌", "🤝", "💪", "🙏", "👀", "🧠", "💡", "❤️", "💙", "💚", "🔥", "✨", "⭐", "🚀", "✅", "❌", "⚠️", "🎯", "📌", "📎", "📝", "🎉", "🥳", "💬", "🔒", "🔔", "☕", "💻"];

type Props = { member: Member; onOpenWorkspace: (channelId?: string) => void };
type Contact = { member: Member; thread: DirectThreadSummary | null };
type DirectoryTab = "friends" | "all" | "pending";
type HomeTab = "for-you" | "recent" | "favorites";
const FAVORITES_KEY = "labstar-dm-favorites-v1";

function loadFavoriteIds() {
  try {
    const value = JSON.parse(window.localStorage.getItem(FAVORITES_KEY) ?? "[]") as unknown;
    return new Set(Array.isArray(value) ? value.map(String) : []);
  } catch { return new Set<string>(); }
}

export function DirectMessagesHub({ member, onOpenWorkspace }: Props) {
  const [spaces, setSpaces] = useState<CollaborationSpace[]>([]);
  const [firstChannels, setFirstChannels] = useState<Record<string, string>>({});
  const [firstVoiceChannelId, setFirstVoiceChannelId] = useState<string | null>(null);
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
  const [notice, setNotice] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  async function refreshThreads(silent = false) {
    try { setThreads(await listDirectThreads()); setDmAvailable(true); }
    catch { setDmAvailable(false); if (!silent) setNotice("Mensagens privadas ainda não estão disponíveis no banco deste ambiente."); }
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [teamResult, collaborationResult, notificationResult] = await Promise.allSettled([listMembers(), loadCollaboration(), listNotifications(member.id)]);
      if (cancelled) return;
      if (teamResult.status === "fulfilled") setMembers(teamResult.value.members);
      if (collaborationResult.status === "fulfilled") {
        setSpaces(collaborationResult.value.spaces);
        const map: Record<string, string> = {};
        for (const space of collaborationResult.value.spaces) {
          const first = collaborationResult.value.channels.find((channel) => channel.spaceId === space.id);
          if (first) map[space.id] = first.id;
        }
        setFirstChannels(map);
        setFirstVoiceChannelId(collaborationResult.value.channels.find((channel) => channel.type === "voice")?.id ?? null);
      }
      if (notificationResult.status === "fulfilled") setNotifications(notificationResult.value);
      await refreshThreads(true);
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [member.id]);

  const threadByMember = useMemo(() => {
    const map = new Map<string, DirectThreadSummary>();
    threads.forEach((thread) => map.set(thread.otherMemberId, thread));
    return map;
  }, [threads]);
  const allContacts = useMemo<Contact[]>(() => members.filter((item) => item.id !== member.id).map((item) => ({ member: item, thread: threadByMember.get(item.id) ?? null })), [members, member.id, threadByMember]);
  const activeContacts = allContacts.filter((contact) => contact.member.status === "active");
  const pendingContacts = allContacts.filter((contact) => contact.member.status === "pending");
  const friendContacts = activeContacts.filter((contact) => contact.thread || favoriteIds.has(contact.member.id));

  const directoryContacts = useMemo(() => {
    const source = directoryTab === "pending" ? pendingContacts : directoryTab === "all" ? activeContacts : friendContacts;
    const normalized = query.trim().toLocaleLowerCase();
    const filtered = normalized ? source.filter(({ member: contact }) => `${contact.name} ${contact.email} ${contact.jobTitle} ${contact.area}`.toLocaleLowerCase().includes(normalized)) : source;
    return [...filtered].sort((a, b) => {
      const aTime = a.thread?.lastMessageAt ?? a.thread?.updatedAt ?? a.member.lastSeenAt;
      const bTime = b.thread?.lastMessageAt ?? b.thread?.updatedAt ?? b.member.lastSeenAt;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });
  }, [directoryTab, pendingContacts, activeContacts, friendContacts, query]);

  const homeContacts = useMemo(() => {
    if (homeTab === "favorites") return activeContacts.filter((contact) => favoriteIds.has(contact.member.id));
    if (homeTab === "recent") return activeContacts.filter((contact) => contact.thread).sort((a, b) => new Date(b.thread?.lastMessageAt ?? b.thread?.updatedAt ?? 0).getTime() - new Date(a.thread?.lastMessageAt ?? a.thread?.updatedAt ?? 0).getTime());
    return [...activeContacts].sort((a, b) => ((b.thread?.unreadCount ?? 0) * 100 + (favoriteIds.has(b.member.id) ? 25 : 0) + (b.thread ? 10 : 0)) - ((a.thread?.unreadCount ?? 0) * 100 + (favoriteIds.has(a.member.id) ? 25 : 0) + (a.thread ? 10 : 0))).slice(0, 8);
  }, [homeTab, activeContacts, favoriteIds]);

  const selectedContact = selectedMemberId ? allContacts.find((contact) => contact.member.id === selectedMemberId) ?? null : null;
  const unreadDirect = threads.reduce((sum, thread) => sum + thread.unreadCount, 0);
  const unreadNotifications = notifications.filter((item) => !item.isRead);
  const mentions = unreadNotifications.filter((item) => /menç|mencion|@/i.test(`${item.title} ${item.body}`));
  const inboxItems = inboxTab === "mentions" ? mentions : unreadNotifications;

  function toggleFavorite(memberId: string) {
    setFavoriteIds((current) => {
      const next = new Set(current);
      if (next.has(memberId)) next.delete(memberId); else next.add(memberId);
      window.localStorage.setItem(FAVORITES_KEY, JSON.stringify([...next]));
      return next;
    });
  }

  async function openContact(contact: Contact) {
    if (contact.member.status !== "active") { setNotice("Este membro ainda está pendente e não pode receber mensagens privadas."); return; }
    setSelectedMemberId(contact.member.id); setNotice("");
    if (contact.thread) {
      setSelectedThreadId(contact.thread.threadId);
      void markDirectThreadRead(contact.thread.threadId).then(() => refreshThreads(true)).catch(() => undefined);
      return;
    }
    if (!dmAvailable) { setSelectedThreadId(null); setNotice("As mensagens privadas ainda não estão disponíveis neste ambiente."); return; }
    try { const threadId = await getOrCreateDirectThread(contact.member.id); setSelectedThreadId(threadId); await refreshThreads(true); }
    catch { setDmAvailable(false); setSelectedThreadId(null); setNotice("Não foi possível criar a conversa privada agora."); }
  }

  function goHome() { setSelectedMemberId(null); setSelectedThreadId(null); setNotice(""); }
  function startNewMessage() { goHome(); setDirectoryTab("all"); setQuery(""); window.requestAnimationFrame(() => searchRef.current?.focus()); }
  async function markInboxRead() { try { await markAllNotificationsRead(member.id); setNotifications((current) => current.map((item) => ({ ...item, isRead: true }))); } catch { setNotice("Não foi possível marcar a caixa de entrada como lida."); } }
  async function openInboxItem(item: LabstarNotification) {
    if (!item.isRead) { await markNotificationRead(item.id).catch(() => undefined); setNotifications((current) => current.map((entry) => entry.id === item.id ? { ...entry, isRead: true } : entry)); }
    if (item.channelId) onOpenWorkspace(item.channelId);
  }

  if (loading) return <section className="dm-loading"><LoaderCircle className="spin" /><strong>Abrindo mensagens diretas</strong><span>Organizando contatos, caixa de entrada e conversas…</span></section>;

  return <section className={`direct-hub dm-v4 dm-v5 ${selectedContact ? "conversation-open" : ""}`}>
    <aside className="dm-space-rail" aria-label="Labstar e espaços"><button className="dm-home-mark active" onClick={goHome} title="Mensagens diretas" aria-label="Mensagens diretas"><img className="labstar-dm-logo" src="/labstar-dm.svg" alt="" aria-hidden="true" /><i /></button><div className="dm-space-list">{spaces.map((space) => <button key={space.id} title={space.name} style={{ "--space-color": space.color } as React.CSSProperties} onClick={() => onOpenWorkspace(firstChannels[space.id])}>{space.logoUrl ? <img src={space.logoUrl} alt="" /> : <span>{space.icon || "★"}</span>}</button>)}</div><button className="dm-add-space" onClick={() => onOpenWorkspace()} title="Abrir espaços"><Plus size={20} /></button></aside>
    <aside className="dm-sidebar">
      <label className="dm-search"><Search size={14} /><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Encontre ou comece uma conversa" /><span className="dm-search-hint">⌘K</span></label>
      <nav className="dm-navigation" aria-label="Mensagens diretas"><button className={directoryTab === "friends" && !selectedContact ? "active" : ""} onClick={() => { goHome(); setDirectoryTab("friends"); }}><Users size={17} /><span>Amigos</span><b>{friendContacts.length}</b></button><button className={directoryTab === "all" && !selectedContact ? "active" : ""} onClick={() => { goHome(); setDirectoryTab("all"); }}><Users size={17} /><span>Todos</span><b>{activeContacts.length}</b></button><button className={directoryTab === "pending" && !selectedContact ? "active" : ""} onClick={() => { goHome(); setDirectoryTab("pending"); }}><Clock3 size={17} /><span>Pendentes</span>{pendingContacts.length > 0 && <b>{pendingContacts.length}</b>}</button><button onClick={startNewMessage}><UserPlus size={17} /><span>Nova conversa</span></button></nav>
      <div className="dm-divider" /><div className="dm-list-heading"><span>{directoryTab === "pending" ? "ACESSOS PENDENTES" : "MENSAGENS DIRETAS"}</span><button onClick={startNewMessage} title="Nova mensagem"><Plus size={15} /></button></div>
      <div className="dm-contact-list">{directoryContacts.map((contact) => <div className={`dm-contact-entry ${selectedMemberId === contact.member.id ? "active" : ""}`} key={contact.member.id}><button className="dm-contact-main" disabled={contact.member.status !== "active"} onClick={() => void openContact(contact)}><Avatar name={contact.member.name} url={contact.member.avatarUrl} size="sm" status={contact.member.status === "active" ? "online" : "offline"} /><span><strong>{contact.member.name}</strong><small>{contact.member.status === "pending" ? "Aguardando ativação" : contact.thread?.lastMessageBody || contact.member.jobRoles[0]?.name || contact.member.jobTitle || "Membro da equipe"}</small></span>{contact.thread?.unreadCount ? <b className="dm-unread">{Math.min(99, contact.thread.unreadCount)}</b> : contact.thread?.lastMessageAt ? <time>{formatCompactTime(contact.thread.lastMessageAt)}</time> : null}</button>{contact.member.status === "active" && <button className={`dm-favorite-contact ${favoriteIds.has(contact.member.id) ? "active" : ""}`} title={favoriteIds.has(contact.member.id) ? "Remover dos favoritos" : "Adicionar aos favoritos"} onClick={() => toggleFavorite(contact.member.id)}><Star size={12} fill={favoriteIds.has(contact.member.id) ? "currentColor" : "none"} /></button>}</div>)}{!directoryContacts.length && <div className="dm-no-contacts"><MessageSquare size={20} /><span>{directoryTab === "friends" ? "Comece uma conversa ou favorite alguém para aparecer aqui." : directoryTab === "pending" ? "Nenhum acesso pendente." : "Nenhum contato encontrado."}</span></div>}</div>
      <footer className="dm-own-profile"><Avatar name={member.name} url={member.avatarUrl} size="sm" status="online" /><span><strong>{member.name}</strong><small>{member.jobRoles[0]?.name || member.jobTitle || "Membro"}</small></span><b>Online</b></footer>
    </aside>
    {selectedContact ? <DirectConversation member={member} contact={selectedContact.member} threadId={selectedThreadId} dmAvailable={dmAvailable} notice={notice} favorite={favoriteIds.has(selectedContact.member.id)} onToggleFavorite={() => toggleFavorite(selectedContact.member.id)} onThreadsChanged={() => refreshThreads(true)} onStartCall={() => onOpenWorkspace(firstVoiceChannelId ?? undefined)} /> : <><main className="dm-home-main"><header className="dm-home-header"><div><Users size={20} /><strong>Mensagens diretas</strong></div><div><button title="Nova mensagem" onClick={startNewMessage}><Pencil size={16} /></button><button title="Nova conversa" onClick={startNewMessage}><UserPlus size={16} /></button></div></header><div className="dm-home-tabs"><button className={homeTab === "for-you" ? "active" : ""} onClick={() => setHomeTab("for-you")}>Para você</button><button className={homeTab === "recent" ? "active" : ""} onClick={() => setHomeTab("recent")}>Recentes</button><button className={homeTab === "favorites" ? "active" : ""} onClick={() => setHomeTab("favorites")}>Favoritos</button></div><section className="dm-home-empty dm-home-dashboard"><div className="dm-orbit" aria-hidden="true"/><h2>{homeTab === "favorites" ? "Seus favoritos" : homeTab === "recent" ? "Conversas recentes" : "Sua central de conversas"}</h2><p>{homeTab === "favorites" ? "Pessoas que você marcou para acesso rápido." : homeTab === "recent" ? "Continue de onde parou nas conversas mais novas." : "Prioriza mensagens não lidas, favoritos e conversas ativas."}</p>{homeContacts.length ? <div className="dm-home-contact-grid">{homeContacts.map((contact) => <button key={contact.member.id} onClick={() => void openContact(contact)}><Avatar name={contact.member.name} url={contact.member.avatarUrl} size="md" status="online" /><span><strong>{contact.member.name}</strong><small>{contact.thread?.lastMessageBody || contact.member.jobRoles[0]?.name || contact.member.jobTitle || "Membro"}</small></span>{favoriteIds.has(contact.member.id) && <Star size={12} fill="currentColor" />}{contact.thread?.unreadCount ? <b>{contact.thread.unreadCount}</b> : null}</button>)}</div> : <button className="dm-primary" onClick={startNewMessage}><Pencil size={16} /> Nova mensagem</button>}</section></main><InboxPanel inboxTab={inboxTab} setInboxTab={setInboxTab} items={inboxItems} unreadCount={unreadNotifications.length + unreadDirect} mentionCount={mentions.length} onMarkAll={() => void markInboxRead()} onOpenItem={(item) => void openInboxItem(item)} /></>}
  </section>;
}

function InboxPanel({ inboxTab, setInboxTab, items, unreadCount, mentionCount, onMarkAll, onOpenItem }: { inboxTab: "unread" | "mentions"; setInboxTab: (value: "unread" | "mentions") => void; items: LabstarNotification[]; unreadCount: number; mentionCount: number; onMarkAll: () => void; onOpenItem: (item: LabstarNotification) => void }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? items : items.slice(0, 7);
  return <aside className="dm-inbox"><header><div><Inbox size={19} /><strong>Caixa de entrada</strong></div><div><button title="Marcar tudo como lido" onClick={onMarkAll}><Check size={15} /></button></div></header><div className="dm-inbox-tabs"><button className={inboxTab === "unread" ? "active" : ""} onClick={() => setInboxTab("unread")}>Não lidas <b>{unreadCount}</b></button><button className={inboxTab === "mentions" ? "active" : ""} onClick={() => setInboxTab("mentions")}>Menções <b>{mentionCount}</b></button></div><div className="dm-inbox-list">{visible.map((item,index) => <article key={item.id} className={item.channelId ? "clickable" : ""} onClick={() => onOpenItem(item)}><span className="dm-inbox-icon">{index % 2 ? <Bell size={18}/> : <AtSign size={18}/>}</span><div><strong>{item.title}</strong><small>{item.body}</small><em>{item.channelId ? "Abrir canal" : "Atualização"}</em></div><time>{formatCompactTime(item.createdAt)}</time>{!item.isRead && <b>1</b>}</article>)}{!items.length && <div className="dm-inbox-empty"><Inbox size={25}/><strong>Tudo em dia</strong><span>Nenhuma mensagem pendente nesta caixa.</span></div>}</div><button className="dm-inbox-all" onClick={() => setShowAll((value) => !value)}>{showAll ? "Mostrar menos" : "Ver todas as mensagens"}</button></aside>;
}

function DirectConversation({ member, contact, threadId, dmAvailable, notice, favorite, onToggleFavorite, onThreadsChanged, onStartCall }: { member: Member; contact: Member; threadId: string | null; dmAvailable: boolean; notice: string; favorite: boolean; onToggleFavorite: () => void; onThreadsChanged: () => void; onStartCall: () => void }) {
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
  const fileRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  async function refresh(scroll = false) {
    if (!threadId) { setMessages([]); setLoading(false); return; }
    try { setMessages(await listDirectMessages(threadId)); void markDirectThreadRead(threadId).catch(() => undefined); if (scroll) requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth" })); setError(""); }
    catch { setError("Não foi possível carregar esta conversa privada."); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    setLoading(Boolean(threadId)); setDraft(""); setFiles([]); setError(""); setPinnedOnly(false); setReplying(null); setEditing(null); setEmojiOpen(false);
    setNote(window.localStorage.getItem(`labstar-dm-note-${contact.id}`) ?? ""); void refresh(true);
    if (!threadId) return;
    const subscription = subscribeToDirectThread(threadId, () => void refresh());
    return () => unsubscribeDirect(subscription);
  }, [threadId, contact.id]);

  const visibleMessages = messages.filter((message) => (!pinnedOnly || message.isPinned) && (!search.trim() || `${message.body} ${message.author?.name ?? ""}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())));
  const sharedAssignments = contact.assignments.filter((assignment) => member.assignments.includes(assignment));
  const sharedFiles = messages.flatMap((message) => message.attachments).slice(-4).reverse();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!threadId) return;
    if (editing && !draft.trim()) return;
    if (!editing && !draft.trim() && !files.length) return;
    setSending(true); setError("");
    try {
      if (editing) await editDirectMessage(editing.id, draft);
      else await sendDirectMessage({ threadId, authorId: member.id, body: draft, replyTo: replying?.id ?? null, files });
      setDraft(""); setFiles([]); setEditing(null); setReplying(null); await refresh(true); onThreadsChanged();
    } catch { setError(editing ? "Não foi possível editar esta mensagem." : "Não foi possível enviar agora. Tente novamente."); }
    finally { setSending(false); }
  }

  function beginReply(message: DirectMessage) { setReplying(message); setEditing(null); setDraft(""); window.requestAnimationFrame(() => composerRef.current?.focus()); }
  function beginEdit(message: DirectMessage) { setEditing(message); setReplying(null); setFiles([]); setDraft(message.body); window.requestAnimationFrame(() => composerRef.current?.focus()); }
  function clearContext() { setEditing(null); setReplying(null); setDraft(""); }
  function saveNote(value: string) { setNote(value); window.localStorage.setItem(`labstar-dm-note-${contact.id}`, value); }

  return <><main className="dm-conversation"><header className="dm-conversation-header"><div className="dm-conversation-person"><Avatar name={contact.name} url={contact.avatarUrl} size="sm" status="online"/><span><strong>{contact.name}</strong><small><i/> Online {contact.jobRoles[0]?.name && <b>{contact.jobRoles[0].name}</b>}</small></span></div><div className="dm-conversation-actions"><button className={favorite ? "active" : ""} title={favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"} onClick={onToggleFavorite}><Star size={17} fill={favorite ? "currentColor" : "none"}/></button><button title="Abrir sala de voz" onClick={onStartCall}><Phone size={17}/></button><button title="Abrir sala para vídeo" onClick={onStartCall}><Video size={17}/></button><button className={pinnedOnly ? "active" : ""} title={pinnedOnly ? "Mostrar todas" : "Mostrar fixadas"} onClick={() => setPinnedOnly((value) => !value)}><Pin size={17}/></button><label><Search size={14}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nesta conversa"/></label></div></header>
    <div className="dm-message-scroll"><section className="dm-thread-intro"><Avatar name={contact.name} url={contact.avatarUrl} size="xl" status="online"/><h2>{contact.name}</h2><span>{contact.jobRoles[0]?.name || contact.jobTitle || "Membro da Labstar"}</span><p>Este é o início da sua conversa direta com <b>{contact.name}</b>.</p></section>{loading ? <div className="dm-thread-loading"><LoaderCircle className="spin"/> Carregando conversa</div> : visibleMessages.map((message) => <DirectMessageRow key={message.id} message={message} reply={message.replyTo ? messages.find((item) => item.id === message.replyTo) ?? null : null} own={message.authorId === member.id} onReply={() => beginReply(message)} onEdit={() => beginEdit(message)} onRefresh={() => refresh()} onThreadsChanged={onThreadsChanged} onError={setError}/>)}{!loading && threadId && !visibleMessages.length && <div className="dm-thread-empty"><MessageSquare size={25}/><strong>{pinnedOnly ? "Nenhuma mensagem fixada" : "Nenhuma mensagem ainda"}</strong><span>{pinnedOnly ? "Fixe mensagens importantes para encontrá-las aqui." : `Envie a primeira mensagem para ${contact.name}.`}</span></div>}{!threadId && <div className="dm-thread-empty"><MessageSquare size={25}/><strong>Conversa pronta para começar</strong><span>{notice || "Envie a primeira mensagem quando a conexão privada estiver disponível."}</span></div>}<div ref={endRef}/></div>
    <form className="dm-composer" onSubmit={submit}>{(replying || editing) && <div className="dm-composer-context">{editing ? <Edit3 size={13}/> : <Reply size={13}/>}<span>{editing ? "Editando sua mensagem" : <>Respondendo a <b>{replying?.author?.name || "Membro"}</b><small>{replying?.body}</small></>}</span><button type="button" onClick={clearContext}><X size={13}/></button></div>}{!!files.length && <div className="dm-composer-files">{files.map((file,index) => <span key={`${file.name}-${index}`}><File size={13}/><b>{file.name}</b><button type="button" onClick={() => setFiles((current) => current.filter((_,itemIndex) => itemIndex !== index))}><X size={12}/></button></span>)}</div>}{(error || notice) && <div className="dm-composer-notice">{error || notice}</div>}{emojiOpen && <div className="dm-emoji-picker" role="listbox" aria-label="Emojis disponíveis">{dmEmojiSet.map((emoji) => <button key={emoji} type="button" title={`Inserir ${emoji}`} aria-label={`Inserir emoji ${emoji}`} onClick={() => { setDraft((value) => `${value}${emoji}`); composerRef.current?.focus(); }}>{emoji}</button>)}</div>}<div><button type="button" disabled={Boolean(editing)} onClick={() => fileRef.current?.click()} title={editing ? "Anexos não mudam durante edição" : "Anexar arquivo"}><Paperclip size={18}/></button><textarea ref={composerRef} rows={1} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder={editing ? "Edite sua mensagem" : `Mensagem para @${contact.name}`} disabled={!threadId || !dmAvailable}/><button type="button" className={emojiOpen ? "active" : ""} aria-expanded={emojiOpen} title="Escolher emoji" onClick={() => setEmojiOpen((value) => !value)}><Smile size={18}/></button><button type="submit" className="dm-send" disabled={sending || !threadId || (editing ? !draft.trim() : (!draft.trim() && !files.length))}>{sending ? <LoaderCircle className="spin" size={17}/> : editing ? <Save size={17}/> : <Send size={17}/>}</button></div><input ref={fileRef} hidden multiple type="file" onChange={(event) => { setFiles(Array.from(event.target.files ?? []).slice(0,8)); event.currentTarget.value = ""; }}/></form></main>
    <aside className="dm-profile-panel"><div className="dm-profile-hero"><Avatar name={contact.name} url={contact.avatarUrl} size="xl" status="online"/><h2>{contact.name}</h2><span>{contact.jobRoles[0]?.name || contact.jobTitle || "Membro"}</span></div><div className="dm-profile-actions"><button onClick={() => composerRef.current?.focus()}><MessageSquare size={16}/><span>Mensagem</span></button><button onClick={onStartCall}><Phone size={16}/><span>Chamada</span></button><button className={favorite ? "active" : ""} onClick={onToggleFavorite}><Star size={16} fill={favorite ? "currentColor" : "none"}/><span>{favorite ? "Favorito" : "Favoritar"}</span></button></div><section><h3>SOBRE</h3><p>{contact.area ? `${contact.jobTitle || "Membro"} · ${contact.area}.` : "Membro da equipe Labstar."}</p></section><section><h3>RESPONSABILIDADE</h3><p>{contact.jobRoles[0]?.department || contact.area || "Colaboração geral"}</p></section><section><h3>PROJETOS COMPARTILHADOS — {sharedAssignments.length}</h3>{sharedAssignments.length ? sharedAssignments.map((assignment) => <div className="dm-shared-item" key={assignment}><span><Star size={13}/></span><div><strong>{assignment}</strong><small>Projeto compartilhado</small></div></div>) : <p>Nenhum projeto compartilhado registrado.</p>}</section><section><h3>ARQUIVOS COMPARTILHADOS</h3>{sharedFiles.length ? sharedFiles.map((attachment) => <a className="dm-shared-file" key={attachment.id} href={attachment.url} target="_blank" rel="noreferrer"><File size={13}/><span>{attachment.fileName}</span><Download size={12}/></a>) : <p>Os arquivos desta conversa aparecerão aqui conforme forem enviados.</p>}</section><section><h3>NOTA</h3><textarea className="dm-note-field" value={note} onChange={(event) => saveNote(event.target.value)} placeholder="Adicione uma nota privada sobre este contato…"/></section></aside></>;
}

function DirectMessageRow({ message, reply, own, onReply, onEdit, onRefresh, onThreadsChanged, onError }: { message: DirectMessage; reply: DirectMessage | null; own: boolean; onReply: () => void; onEdit: () => void; onRefresh: () => Promise<void>; onThreadsChanged: () => void; onError: (message: string) => void }) {
  const primaryRole = message.author?.jobRoles[0];
  async function togglePin() { try { await pinDirectMessage(message.id,!message.isPinned); await onRefresh(); } catch { onError("Não foi possível alterar a fixação desta mensagem."); } }
  async function remove() { try { await deleteDirectMessage(message.id); await onRefresh(); onThreadsChanged(); } catch { onError("Não foi possível excluir esta mensagem."); } }
  return <article className="dm-message" id={`dm-message-${message.id}`}>{reply && <button className="dm-reply-preview" type="button" onClick={() => document.getElementById(`dm-message-${reply.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}><Reply size={11}/><b>{reply.author?.name || "Membro"}</b><span>{reply.body}</span></button>}<Avatar name={message.author?.name || "Membro"} url={message.author?.avatarUrl} size="md"/><div className="dm-message-body"><header><strong style={{ color: primaryRole?.color || undefined }}>{message.author?.name || "Membro"}</strong>{primaryRole && <b className="dm-role-chip" style={{ "--role-color": primaryRole.color } as React.CSSProperties}>{primaryRole.name}</b>}<time>{formatMessageDate(message.createdAt)}</time>{message.editedAt && <em>(editada)</em>}</header><p>{message.body}</p>{!!message.attachments.length && <div className="dm-attachments">{message.attachments.map((attachment) => attachment.mimeType.startsWith("image/") ? <a key={attachment.id} href={attachment.url} target="_blank" rel="noreferrer" className="dm-image-attachment"><img src={attachment.url} alt={attachment.fileName}/><span><FileImage size={13}/>{attachment.fileName}</span></a> : <a key={attachment.id} href={attachment.url} target="_blank" rel="noreferrer" className="dm-file-attachment"><span><File size={18}/></span><div><strong>{attachment.fileName}</strong><small>{formatBytes(attachment.sizeBytes)}</small></div><Download size={15}/></a>)}</div>}</div><div className="dm-message-actions"><button title="Responder" onClick={onReply}><Reply size={13}/></button>{own && <button title="Editar" onClick={onEdit}><Pencil size={13}/></button>}<button title={message.isPinned ? "Desafixar" : "Fixar"} onClick={() => void togglePin()}><Pin size={13}/></button>{own && <button title="Excluir" data-destructive="true" onClick={() => void remove()}><X size={13}/></button>}</div></article>;
}

function formatCompactTime(value: string) { const date = new Date(value); const today = new Date(); if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}); const yesterday = new Date(today); yesterday.setDate(today.getDate()-1); if(date.toDateString()===yesterday.toDateString()) return "Ontem"; return date.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"}); }
function formatMessageDate(value: string) { return new Date(value).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}); }
function formatBytes(value: number) { if(value<1024) return `${value} B`; if(value<1024*1024) return `${(value/1024).toFixed(1)} KB`; return `${(value/(1024*1024)).toFixed(1)} MB`; }

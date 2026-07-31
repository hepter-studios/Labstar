import {
  AtSign,
  Bell,
  Check,
  Clock3,
  Download,
  File,
  FileImage,
  Inbox,
  LoaderCircle,
  MessageCircleMore,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Phone,
  Pin,
  Plus,
  Search,
  Send,
  Settings2,
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
  type CollaborationSpace,
  type LabstarNotification,
  type Member,
} from "../lib/supabase";
import {
  deleteDirectMessage,
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

type DirectMessagesHubProps = {
  member: Member;
  onOpenWorkspace: (channelId?: string) => void;
};

type Contact = Member & {
  thread?: DirectThreadSummary;
};

const demoInboxLabels = ["Produto", "Atualização", "Arquivo", "Automação"];

export function DirectMessagesHub({ member, onOpenWorkspace }: DirectMessagesHubProps) {
  const [spaces, setSpaces] = useState<CollaborationSpace[]>([]);
  const [workspaceFirstChannels, setWorkspaceFirstChannels] = useState<Record<string, string>>({});
  const [members, setMembers] = useState<Member[]>([]);
  const [threads, setThreads] = useState<DirectThreadSummary[]>([]);
  const [notifications, setNotifications] = useState<LabstarNotification[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dmAvailable, setDmAvailable] = useState(true);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"for-you" | "recent" | "favorites">("for-you");
  const [inboxTab, setInboxTab] = useState<"unread" | "mentions">("unread");
  const [notice, setNotice] = useState("");

  async function refreshThreads(silent = false) {
    try {
      const data = await listDirectThreads();
      setThreads(data);
      setDmAvailable(true);
    } catch {
      setDmAvailable(false);
      if (!silent) setNotice("Mensagens privadas aguardando a atualização v9 do banco de Preview.");
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [teamResult, collaborationResult, notificationResult] = await Promise.allSettled([
        listMembers(),
        loadCollaboration(),
        listNotifications(member.id),
      ]);
      if (cancelled) return;

      if (teamResult.status === "fulfilled") setMembers(teamResult.value.members.filter((item) => item.status === "active"));
      if (collaborationResult.status === "fulfilled") {
        setSpaces(collaborationResult.value.spaces);
        const firstChannels: Record<string, string> = {};
        collaborationResult.value.spaces.forEach((space) => {
          const first = collaborationResult.value.channels.find((channel) => channel.spaceId === space.id);
          if (first) firstChannels[space.id] = first.id;
        });
        setWorkspaceFirstChannels(firstChannels);
      }
      if (notificationResult.status === "fulfilled") setNotifications(notificationResult.value);
      await refreshThreads(true);
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [member.id]);

  const otherMembers = useMemo(() => members.filter((item) => item.id !== member.id), [members, member.id]);
  const contactMap = useMemo(() => new Map(otherMembers.map((item) => [item.id, item])), [otherMembers]);
  const threadByMember = useMemo(() => new Map(threads.map((item) => [item.otherMemberId, item])), [threads]);
  const recentContacts = useMemo<Contact[]>(() => {
    const sorted = threads
      .map((thread) => {
        const contact = contactMap.get(thread.otherMemberId);
        return contact ? { ...contact, thread } : null;
      })
      .filter((item): item is Contact => Boolean(item));
    const withoutThread = otherMembers.filter((contact) => !threadByMember.has(contact.id)).map((contact) => ({ ...contact }));
    return [...sorted, ...withoutThread];
  }, [threads, otherMembers, contactMap, threadByMember]);

  const filteredContacts = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return recentContacts;
    return recentContacts.filter((contact) => `${contact.name} ${contact.email} ${contact.jobTitle} ${contact.area}`.toLocaleLowerCase().includes(normalized));
  }, [recentContacts, query]);

  const selectedContact = selectedContactId ? contactMap.get(selectedContactId) ?? null : null;
  const unreadDirect = threads.reduce((sum, item) => sum + item.unreadCount, 0);
  const unreadNotifications = notifications.filter((item) => !item.isRead);
  const mentions = unreadNotifications.filter((item) => /menç|mencion|@/i.test(`${item.title} ${item.body}`));
  const inboxItems = inboxTab === "mentions" ? mentions : unreadNotifications;

  async function openContact(contact: Member) {
    setSelectedContactId(contact.id);
    setNotice("");
    const existing = threadByMember.get(contact.id);
    if (existing) {
      setSelectedThreadId(existing.threadId);
      void markDirectThreadRead(existing.threadId).then(() => refreshThreads(true)).catch(() => undefined);
      return;
    }
    if (!dmAvailable) {
      setSelectedThreadId(null);
      setNotice("A interface está pronta; falta aplicar a atualização v9 no Supabase do Preview para enviar mensagens privadas.");
      return;
    }
    try {
      const threadId = await getOrCreateDirectThread(contact.id);
      setSelectedThreadId(threadId);
      await refreshThreads(true);
    } catch {
      setDmAvailable(false);
      setSelectedThreadId(null);
      setNotice("A interface está pronta; falta aplicar a atualização v9 no Supabase do Preview para enviar mensagens privadas.");
    }
  }

  function returnHome() {
    setSelectedContactId(null);
    setSelectedThreadId(null);
    setNotice("");
  }

  if (loading) {
    return <section className="dm-loading"><LoaderCircle className="spin" /><strong>Abrindo mensagens diretas</strong><span>Organizando contatos, caixa de entrada e conversas…</span></section>;
  }

  return (
    <section className={`direct-hub ${selectedContact ? "conversation-open" : ""}`}>
      <aside className="dm-space-rail" aria-label="Labstar e espaços">
        <button className="dm-home-mark active" onClick={returnHome} title="Mensagens diretas" aria-label="Mensagens diretas">
          <Star size={25} fill="currentColor" />
          <i />
        </button>
        <div className="dm-space-list">
          {spaces.map((space) => (
            <button
              key={space.id}
              title={space.name}
              style={{ "--space-color": space.color } as React.CSSProperties}
              onClick={() => onOpenWorkspace(workspaceFirstChannels[space.id])}
            >
              {space.logoUrl ? <img src={space.logoUrl} alt="" /> : <span>{space.icon || "★"}</span>}
            </button>
          ))}
        </div>
        <button className="dm-add-space" onClick={() => onOpenWorkspace()} title="Abrir espaços"><Plus size={20} /></button>
        <button className="dm-rail-settings" title="Configurações"><Settings2 size={17} /></button>
      </aside>

      <aside className="dm-sidebar">
        <label className="dm-search">
          <Search size={14} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Encontre ou comece uma conversa" />
          <Settings2 size={13} />
        </label>

        <nav className="dm-navigation" aria-label="Mensagens diretas">
          <button className={!selectedContact ? "active" : ""} onClick={returnHome}><Users size={17} /><span>Amigos</span></button>
          <button onClick={returnHome}><Users size={17} /><span>Todos</span></button>
          <button onClick={returnHome}><Clock3 size={17} /><span>Pendentes</span>{unreadDirect > 0 && <b>{Math.min(99, unreadDirect)}</b>}</button>
          <button onClick={returnHome}><UserPlus size={17} /><span>Adicionar amigo</span></button>
        </nav>

        <div className="dm-divider" />
        <div className="dm-list-heading"><span>MENSAGENS DIRETAS</span><button title="Nova mensagem"><Plus size={15} /></button></div>
        <div className="dm-contact-list">
          {filteredContacts.map((contact) => {
            const thread = threadByMember.get(contact.id);
            return (
              <button key={contact.id} className={selectedContactId === contact.id ? "active" : ""} onClick={() => void openContact(contact)}>
                <Avatar name={contact.name} url={contact.avatarUrl} size="sm" status={contact.status === "active" ? "online" : "offline"} />
                <span>
                  <strong>{contact.name}</strong>
                  <small>{thread?.lastMessageBody || contact.jobRoles[0]?.name || contact.jobTitle || "Membro da equipe"}</small>
                </span>
                {thread?.unreadCount ? <b className="dm-unread">{Math.min(99, thread.unreadCount)}</b> : thread?.lastMessageAt ? <time>{formatCompactTime(thread.lastMessageAt)}</time> : null}
              </button>
            );
          })}
          {!filteredContacts.length && <div className="dm-no-contacts"><MessageSquare size={20} /><span>Nenhum contato encontrado.</span></div>}
        </div>

        <footer className="dm-own-profile">
          <Avatar name={member.name} url={member.avatarUrl} size="sm" status="online" />
          <span><strong>{member.name}</strong><small>{member.jobRoles[0]?.name || member.jobTitle || "Membro"}</small></span>
          <b>Online</b>
        </footer>
      </aside>

      {selectedContact ? (
        <DirectConversation
          member={member}
          contact={selectedContact}
          threadId={selectedThreadId}
          dmAvailable={dmAvailable}
          notice={notice}
          onThreadsChanged={() => refreshThreads(true)}
        />
      ) : (
        <DirectHome
          contacts={recentContacts}
          onOpenContact={(contact) => void openContact(contact)}
          inboxItems={inboxItems}
          inboxTab={inboxTab}
          setInboxTab={setInboxTab}
          tab={tab}
          setTab={setTab}
          unreadCount={unreadNotifications.length + unreadDirect}
          mentionCount={mentions.length}
        />
      )}
    </section>
  );
}

function DirectHome({
  contacts,
  onOpenContact,
  inboxItems,
  inboxTab,
  setInboxTab,
  tab,
  setTab,
  unreadCount,
  mentionCount,
}: {
  contacts: Contact[];
  onOpenContact: (contact: Member) => void;
  inboxItems: LabstarNotification[];
  inboxTab: "unread" | "mentions";
  setInboxTab: (tab: "unread" | "mentions") => void;
  tab: "for-you" | "recent" | "favorites";
  setTab: (tab: "for-you" | "recent" | "favorites") => void;
  unreadCount: number;
  mentionCount: number;
}) {
  return (
    <>
      <main className="dm-home-main">
        <header className="dm-home-header">
          <div><Users size={20} /><strong>Mensagens diretas</strong></div>
          <div><button title="Nova mensagem"><Pencil size={16} /></button><button title="Adicionar contato"><UserPlus size={16} /></button><button title="Mais"><MoreHorizontal size={17} /></button></div>
        </header>
        <div className="dm-home-tabs">
          <button className={tab === "for-you" ? "active" : ""} onClick={() => setTab("for-you")}>Para você</button>
          <button className={tab === "recent" ? "active" : ""} onClick={() => setTab("recent")}>Recentes</button>
          <button className={tab === "favorites" ? "active" : ""} onClick={() => setTab("favorites")}>Favoritos</button>
        </div>
        <section className="dm-home-empty">
          <div className="dm-orbit" aria-hidden="true">
            <i className="orbit-one" /><i className="orbit-two" /><i className="orbit-three" />
            <span><MessageCircleMore size={45} /></span>
          </div>
          <h2>Suas conversas começam aqui</h2>
          <p>Envie mensagens diretas, colabore e mantenha o foco.<br />Escolha um contato ou comece uma nova conversa.</p>
          <button className="dm-primary" onClick={() => contacts[0] && onOpenContact(contacts[0])}><Pencil size={16} /> Nova mensagem</button>
        </section>
      </main>

      <aside className="dm-inbox">
        <header><div><Inbox size={19} /><strong>Caixa de entrada</strong></div><div><button title="Marcar como lidas"><Check size={15} /></button><button title="Configurações"><Settings2 size={15} /></button></div></header>
        <div className="dm-inbox-tabs">
          <button className={inboxTab === "unread" ? "active" : ""} onClick={() => setInboxTab("unread")}>Não lidas <b>{unreadCount}</b></button>
          <button className={inboxTab === "mentions" ? "active" : ""} onClick={() => setInboxTab("mentions")}>Menções <b>{mentionCount}</b></button>
        </div>
        <div className="dm-inbox-list">
          {inboxItems.slice(0, 7).map((item, index) => (
            <article key={item.id}>
              <span className="dm-inbox-icon">{index % 3 === 0 ? <AtSign size={18} /> : index % 3 === 1 ? <Bell size={18} /> : <MessageSquare size={18} />}</span>
              <div><strong>{item.title}</strong><small>{item.body}</small><em>{demoInboxLabels[index % demoInboxLabels.length]}</em></div>
              <time>{formatCompactTime(item.createdAt)}</time>
              {!item.isRead && <b>1</b>}
            </article>
          ))}
          {!inboxItems.length && <div className="dm-inbox-empty"><Inbox size={25} /><strong>Tudo em dia</strong><span>Nenhuma mensagem pendente nesta caixa.</span></div>}
        </div>
        <button className="dm-inbox-all">Ver todas as mensagens</button>
      </aside>
    </>
  );
}

function DirectConversation({
  member,
  contact,
  threadId,
  dmAvailable,
  notice,
  onThreadsChanged,
}: {
  member: Member;
  contact: Member;
  threadId: string | null;
  dmAvailable: boolean;
  notice: string;
  onThreadsChanged: () => void;
}) {
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [loading, setLoading] = useState(Boolean(threadId));
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  async function refresh(scroll = false) {
    if (!threadId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    try {
      const data = await listDirectMessages(threadId);
      setMessages(data);
      void markDirectThreadRead(threadId).catch(() => undefined);
      if (scroll) requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth" }));
    } catch {
      setError("Não foi possível carregar esta conversa privada.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(Boolean(threadId));
    setDraft("");
    setFiles([]);
    setError("");
    void refresh(true);
    if (!threadId) return;
    const subscription = subscribeToDirectThread(threadId, () => void refresh());
    return () => unsubscribeDirect(subscription);
  }, [threadId]);

  const visibleMessages = messages.filter((message) => !search.trim() || `${message.body} ${message.author?.name ?? ""}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!threadId || (!draft.trim() && !files.length)) return;
    setSending(true);
    setError("");
    try {
      await sendDirectMessage({ threadId, authorId: member.id, body: draft, files });
      setDraft("");
      setFiles([]);
      await refresh(true);
      onThreadsChanged();
    } catch {
      setError("Não foi possível enviar agora. Verifique a atualização v9 e tente novamente.");
    } finally {
      setSending(false);
    }
  }

  const sharedAssignments = contact.assignments.filter((assignment) => member.assignments.includes(assignment));

  return (
    <>
      <main className="dm-conversation">
        <header className="dm-conversation-header">
          <div className="dm-conversation-person">
            <Avatar name={contact.name} url={contact.avatarUrl} size="sm" status="online" />
            <span><strong>{contact.name}</strong><small><i /> Online {contact.jobRoles[0]?.name && <b>{contact.jobRoles[0].name}</b>}</small></span>
          </div>
          <div className="dm-conversation-actions">
            <button title="Chamada"><Phone size={17} /></button>
            <button title="Vídeo"><Video size={17} /></button>
            <button title="Fixadas"><Pin size={17} /></button>
            <button title="Adicionar à conversa"><UserPlus size={17} /></button>
            <label><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nesta conversa" /></label>
          </div>
        </header>

        <div className="dm-message-scroll">
          <section className="dm-thread-intro">
            <Avatar name={contact.name} url={contact.avatarUrl} size="xl" status="online" />
            <h2>{contact.name}</h2>
            <span>{contact.jobRoles[0]?.name || contact.jobTitle || "Membro da Labstar"}</span>
            <p>Este é o início da sua conversa direta com <b>{contact.name}</b>.</p>
          </section>

          {loading ? <div className="dm-thread-loading"><LoaderCircle className="spin" /> Carregando conversa</div> : visibleMessages.map((message) => {
            const own = message.authorId === member.id;
            const primaryRole = message.author?.jobRoles[0];
            return (
              <article className="dm-message" key={message.id}>
                <Avatar name={message.author?.name || "Membro"} url={message.author?.avatarUrl} size="md" />
                <div className="dm-message-body">
                  <header><strong style={{ color: primaryRole?.color || undefined }}>{message.author?.name || "Membro"}</strong>{primaryRole && <b className="dm-role-chip" style={{ "--role-color": primaryRole.color } as React.CSSProperties}>{primaryRole.name}</b>}<time>{formatMessageDate(message.createdAt)}</time>{message.editedAt && <em>(editada)</em>}</header>
                  <p>{message.body}</p>
                  {!!message.attachments.length && <div className="dm-attachments">{message.attachments.map((attachment) => attachment.mimeType.startsWith("image/") ? <a key={attachment.id} href={attachment.url} target="_blank" rel="noreferrer" className="dm-image-attachment"><img src={attachment.url} alt={attachment.fileName} /><span><FileImage size={13} />{attachment.fileName}</span></a> : <a key={attachment.id} href={attachment.url} target="_blank" rel="noreferrer" className="dm-file-attachment"><span><File size={18} /></span><div><strong>{attachment.fileName}</strong><small>{formatBytes(attachment.sizeBytes)}</small></div><Download size={15} /></a>)}</div>}
                </div>
                <div className="dm-message-actions"><button title={message.isPinned ? "Desafixar" : "Fixar"} onClick={async () => { await pinDirectMessage(message.id, !message.isPinned); await refresh(); }}><Pin size={13} /></button>{own && <button title="Excluir" onClick={async () => { await deleteDirectMessage(message.id); await refresh(); onThreadsChanged(); }}><X size={13} /></button>}</div>
              </article>
            );
          })}
          {!loading && threadId && !visibleMessages.length && <div className="dm-thread-empty"><MessageSquare size={25} /><strong>Nenhuma mensagem ainda</strong><span>Envie a primeira mensagem para {contact.name}.</span></div>}
          {!threadId && <div className="dm-thread-empty"><MessageSquare size={25} /><strong>Conversa pronta para começar</strong><span>{notice || "Envie a primeira mensagem quando a conexão privada estiver disponível."}</span></div>}
          <div ref={endRef} />
        </div>

        <form className="dm-composer" onSubmit={submit}>
          {!!files.length && <div className="dm-composer-files">{files.map((file, index) => <span key={`${file.name}-${index}`}><File size={13} /><b>{file.name}</b><button type="button" onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={12} /></button></span>)}</div>}
          {(error || notice) && <div className="dm-composer-notice">{error || notice}</div>}
          <div>
            <button type="button" onClick={() => fileRef.current?.click()} title="Anexar arquivo"><Paperclip size={18} /></button>
            <textarea rows={1} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder={`Mensagem para @${contact.name}`} disabled={!threadId || !dmAvailable} />
            <button type="button" title="Emoji"><Smile size={18} /></button>
            <button type="submit" className="dm-send" disabled={sending || !threadId || (!draft.trim() && !files.length)}>{sending ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />}</button>
          </div>
          <input ref={fileRef} hidden multiple type="file" onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 8))} />
        </form>
      </main>

      <aside className="dm-profile-panel">
        <div className="dm-profile-hero">
          <Avatar name={contact.name} url={contact.avatarUrl} size="xl" status="online" />
          <h2>{contact.name}</h2>
          <span>{contact.jobRoles[0]?.name || contact.jobTitle || "Membro"}</span>
        </div>
        <div className="dm-profile-actions"><button><MessageSquare size={16} /><span>Mensagem</span></button><button><Phone size={16} /><span>Chamada</span></button><button><Video size={16} /><span>Vídeo</span></button><button><MoreHorizontal size={16} /><span>Mais</span></button></div>
        <section><h3>SOBRE</h3><p>{contact.area ? `${contact.jobTitle || "Membro"} · ${contact.area}.` : "Membro da equipe Labstar."}</p></section>
        <section><h3>RESPONSABILIDADE</h3><p>{contact.jobRoles[0]?.department || contact.area || "Colaboração geral"}</p></section>
        <section><h3>PROJETOS COMPARTILHADOS — {sharedAssignments.length}</h3>{sharedAssignments.length ? sharedAssignments.map((assignment) => <div className="dm-shared-item" key={assignment}><span><Star size={13} /></span><div><strong>{assignment}</strong><small>Projeto compartilhado</small></div></div>) : <p>Nenhum projeto compartilhado registrado.</p>}</section>
        <section><h3>ARQUIVOS COMPARTILHADOS</h3><p>Os arquivos desta conversa aparecerão aqui conforme forem enviados.</p></section>
        <section><h3>NOTA</h3><button className="dm-note">Clique para adicionar uma nota privada…</button></section>
      </aside>
    </>
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
  return new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

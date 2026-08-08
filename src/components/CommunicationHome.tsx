import {
  ArrowRight,
  AtSign,
  BellRing,
  FileText,
  Hash,
  MessageSquareText,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  listMembers,
  listMessages,
  listNotifications,
  loadCollaboration,
  type ChannelMessage,
  type CollaborationSpace,
  type LabstarChannel,
  type LabstarNotification,
  type Member,
} from "../lib/supabase";
import { Avatar } from "./Avatar";

type CommunicationHomeProps = {
  member: Member;
  onOpenChannel: (channelId: string) => void;
  onOpenDirect: () => void;
};

type CommunicationData = {
  spaces: CollaborationSpace[];
  channels: LabstarChannel[];
  members: Member[];
  messages: ChannelMessage[];
  notifications: LabstarNotification[];
};

const EMPTY_DATA: CommunicationData = {
  spaces: [],
  channels: [],
  members: [],
  messages: [],
  notifications: [],
};

const HOME_CORE_TIMEOUT_MS = 4_000;
const HOME_MESSAGES_TIMEOUT_MS = 3_000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`${label}_timeout`)), timeoutMs);
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

function relativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "agora";
  const diff = Date.now() - date.getTime();
  const minutes = Math.max(0, Math.floor(diff / 60_000));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} d`;
}

function messagePreview(message: ChannelMessage) {
  if (message.body.trim()) return message.body.trim();
  if (message.attachments.length === 1) return `Enviou ${message.attachments[0].fileName}`;
  if (message.attachments.length > 1) return `Enviou ${message.attachments.length} arquivos`;
  return "Nova atividade";
}

export function CommunicationHome({ member, onOpenChannel, onOpenDirect }: CommunicationHomeProps) {
  const [data, setData] = useState<CommunicationData>(EMPTY_DATA);
  const [refreshing, setRefreshing] = useState(true);
  const [error, setError] = useState("");
  const homeRef = useRef<HTMLElement>(null);
  const refreshGeneration = useRef(0);

  const refresh = useCallback(async (_silent = false) => {
    const generation = ++refreshGeneration.current;
    setRefreshing(true);
    setError("");

    try {
      const [collaborationResult, membersResult, notificationsResult] = await Promise.allSettled([
        withTimeout(loadCollaboration(), HOME_CORE_TIMEOUT_MS, "collaboration"),
        withTimeout(listMembers(), HOME_CORE_TIMEOUT_MS, "members"),
        member.id === "preview-member"
          ? Promise.resolve([] as LabstarNotification[])
          : withTimeout(listNotifications(member.id), HOME_CORE_TIMEOUT_MS, "notifications"),
      ]);

      if (generation !== refreshGeneration.current) return;

      const collaboration = collaborationResult.status === "fulfilled"
        ? collaborationResult.value
        : { spaces: [], categories: [], channels: [] };
      const members = membersResult.status === "fulfilled" ? membersResult.value.members : [];
      const notifications = notificationsResult.status === "fulfilled" ? notificationsResult.value : [];
      const publicChannels = collaboration.channels.filter(
        (channel) => channel.allowedRoles.length === 0 && channel.allowedAssignments.length === 0,
      );
      const publicChannelIds = new Set(publicChannels.map((channel) => channel.id));

      setData({
        spaces: collaboration.spaces,
        channels: publicChannels,
        members,
        messages: [],
        notifications: notifications.filter(
          (notification) => !notification.channelId || publicChannelIds.has(notification.channelId),
        ),
      });

      const failedCore = [collaborationResult, membersResult, notificationsResult]
        .filter((result) => result.status === "rejected").length;
      if (failedCore) {
        setError("A Home abriu com dados parciais. Alguns itens demoraram demais para responder.");
      }

      const readableChannels = publicChannels
        .filter((channel) => channel.type === "text" || channel.type === "announcement" || channel.type === "rules")
        .slice(0, 20);

      if (!readableChannels.length) return;

      const messageResults = await Promise.allSettled(
        readableChannels.map((channel) => withTimeout(
          listMessages(channel.id),
          HOME_MESSAGES_TIMEOUT_MS,
          `messages_${channel.id}`,
        )),
      );

      if (generation !== refreshGeneration.current) return;

      const messages = messageResults
        .flatMap((result) => result.status === "fulfilled" ? result.value.slice(-60) : [])
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      setData((current) => ({ ...current, messages }));
    } catch {
      if (generation !== refreshGeneration.current) return;
      setError("A Home abriu em modo reduzido porque parte dos dados não respondeu.");
    } finally {
      if (generation === refreshGeneration.current) setRefreshing(false);
    }
  }, [member.id]);

  useEffect(() => {
    void refresh();
    const changed = () => void refresh(true);
    const interval = window.setInterval(changed, 60_000);
    window.addEventListener("labstar:data-changed", changed);
    return () => {
      refreshGeneration.current += 1;
      window.clearInterval(interval);
      window.removeEventListener("labstar:data-changed", changed);
    };
  }, [refresh]);

  useLayoutEffect(() => {
    const resetPosition = () => {
      const home = homeRef.current;
      if (!home) return;
      home.scrollTop = 0;
      home.scrollLeft = 0;
      if (home.parentElement) {
        home.parentElement.scrollTop = 0;
        home.parentElement.scrollLeft = 0;
      }
    };
    resetPosition();
    const frame = window.requestAnimationFrame(resetPosition);
    const timer = window.setTimeout(resetPosition, 160);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [member.id]);

  const channelById = useMemo(() => new Map(data.channels.map((channel) => [channel.id, channel])), [data.channels]);
  const spaceById = useMemo(() => new Map(data.spaces.map((space) => [space.id, space])), [data.spaces]);

  const recentChannels = useMemo(() => {
    const latest = new Map<string, ChannelMessage>();
    for (const message of data.messages) {
      if (!latest.has(message.channelId)) latest.set(message.channelId, message);
    }
    return [...latest.values()].slice(0, 8);
  }, [data.messages]);

  const recentFiles = useMemo(() => data.messages
    .flatMap((message) => message.attachments.map((attachment) => ({ attachment, message })))
    .slice(0, 8), [data.messages]);

  const unread = data.notifications.filter((notification) => !notification.isRead);
  const mentions = unread.filter((notification) => /menç|mencion|@/i.test(`${notification.title} ${notification.body}`));
  const activeMembers = data.members.filter((item) => item.status === "active" && item.id !== member.id).slice(0, 8);

  return (
    <section key="content" ref={homeRef} className="communication-home">
      <header className="communication-home-head">
        <div>
          <span className="communication-eyebrow"><MessageSquareText size={14} /> Central de trabalho</span>
          <h1>Olá, {member.name.split(" ")[0]}</h1>
          <p>Continue conversas, encontre arquivos e acompanhe o que aconteceu nos seus servidores.</p>
        </div>
        <div className="communication-head-actions">
          <button type="button" onClick={() => void refresh(true)} aria-label="Atualizar Home da Central"><RefreshCw className={refreshing ? "spin" : ""} size={15} /></button>
          <button type="button" onClick={() => document.querySelector<HTMLInputElement>(".global-search input")?.focus()}><Search size={15} /> Buscar em tudo</button>
          <button type="button" className="primary" onClick={onOpenDirect}><MessageSquareText size={15} /> Mensagens diretas</button>
        </div>
      </header>

      {error && <div className="communication-home-error">{error}<button type="button" onClick={() => void refresh()}>Tentar novamente</button></div>}

      <div className="communication-home-metrics">
        <article><Hash size={16} /><span><b>{data.channels.length}</b><small>canais disponíveis</small></span></article>
        <article className={unread.length ? "attention" : ""}><BellRing size={16} /><span><b>{unread.length}</b><small>notificações não lidas</small></span></article>
        <article className={mentions.length ? "attention" : ""}><AtSign size={16} /><span><b>{mentions.length}</b><small>menções para você</small></span></article>
        <article><Users size={16} /><span><b>{data.members.filter((item) => item.status === "active").length}</b><small>pessoas na equipe</small></span></article>
      </div>

      <div className="communication-home-grid">
        <section className="communication-panel recent-conversations">
          <header><div><strong>Continue conversando</strong><small>Canais com atividade mais recente</small></div><Hash size={16} /></header>
          <div className="communication-list">
            {recentChannels.map((message) => {
              const channel = channelById.get(message.channelId);
              const space = channel ? spaceById.get(channel.spaceId) : null;
              if (!channel) return null;
              return (
                <button type="button" key={channel.id} onClick={() => onOpenChannel(channel.id)}>
                  <span className="communication-channel-icon"><Hash size={15} /></span>
                  <span><b>#{channel.name}</b><small>{messagePreview(message)}</small></span>
                  <em>{space?.name ?? "Labstar"}</em>
                  <time>{relativeTime(message.createdAt)}</time>
                  <ArrowRight size={14} />
                </button>
              );
            })}
            {!recentChannels.length && <div className="communication-empty"><MessageSquareText size={22} /><strong>{refreshing ? "Carregando conversas…" : "Nenhuma conversa recente"}</strong><span>{refreshing ? "Você já pode usar a Central enquanto os dados chegam." : "Abra um servidor na coluna esquerda e comece por um canal."}</span></div>}
          </div>
        </section>

        <aside className="communication-panel communication-notices">
          <header><div><strong>Para você</strong><small>Menções e avisos não lidos</small></div><AtSign size={16} /></header>
          <div className="communication-list compact">
            {unread.slice(0, 6).map((notification) => (
              <button type="button" key={notification.id} onClick={() => notification.channelId && onOpenChannel(notification.channelId)}>
                <span className="communication-notice-dot" />
                <span><b>{notification.title}</b><small>{notification.body}</small></span>
                <time>{relativeTime(notification.createdAt)}</time>
              </button>
            ))}
            {!unread.length && <div className="communication-empty small"><BellRing size={20} /><strong>{refreshing ? "Atualizando avisos…" : "Tudo em dia"}</strong><span>Novas menções e avisos aparecerão aqui.</span></div>}
          </div>
        </aside>
      </div>

      <div className="communication-home-grid lower">
        <section className="communication-panel communication-files">
          <header><div><strong>Arquivos recentes</strong><small>Conteúdo compartilhado nas conversas</small></div><FileText size={16} /></header>
          <div className="communication-file-grid">
            {recentFiles.map(({ attachment, message }) => {
              const channel = channelById.get(message.channelId);
              return (
                <button type="button" key={attachment.id} onClick={() => onOpenChannel(message.channelId)}>
                  <span><FileText size={16} /></span>
                  <div><b>{attachment.fileName}</b><small>#{channel?.name ?? "canal"} · {relativeTime(message.createdAt)}</small></div>
                  <ArrowRight size={13} />
                </button>
              );
            })}
            {!recentFiles.length && <div className="communication-empty small"><FileText size={20} /><strong>{refreshing ? "Buscando arquivos…" : "Nenhum arquivo recente"}</strong><span>Imagens e documentos compartilhados aparecerão aqui.</span></div>}
          </div>
        </section>

        <aside className="communication-panel communication-people">
          <header><div><strong>Pessoas</strong><small>Acesso rápido à equipe</small></div><Users size={16} /></header>
          <div className="communication-people-grid">
            {activeMembers.map((item) => (
              <button type="button" key={item.id} onClick={onOpenDirect} title={`Abrir mensagens diretas com ${item.name}`}>
                <Avatar name={item.name} url={item.avatarUrl} size="md" />
                <span><b>{item.name}</b><small>{item.jobRoles[0]?.name || item.jobTitle || "Membro"}</small></span>
              </button>
            ))}
            {!activeMembers.length && <div className="communication-empty small"><Users size={20} /><strong>{refreshing ? "Carregando equipe…" : "Equipe ainda pequena"}</strong><span>Novos membros aparecerão aqui.</span></div>}
          </div>
        </aside>
      </div>
    </section>
  );
}

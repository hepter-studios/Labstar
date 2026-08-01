import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileText,
  Hash,
  LoaderCircle,
  MessageSquareText,
  Network,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Users,
  Video,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listMeetings,
  listMembers,
  listMessages,
  listNotifications,
  loadCollaboration,
  sendMessage,
  type ChannelMessage,
  type CollaborationSpace,
  type LabstarChannel,
  type LabstarNotification,
  type Member,
  type ScheduledMeeting,
} from "../lib/supabase";

type WorkNode = {
  id: string;
  name: string;
  description: string;
  owner: string;
  status: string;
  priority: string;
  progress: number;
};

type WorkHomeProps = {
  member: Member;
  onOpenChannel: (channelId?: string | null) => void;
  onOpenDirect: () => void;
};

type WorkHomeData = {
  spaces: CollaborationSpace[];
  channels: LabstarChannel[];
  members: Member[];
  messages: ChannelMessage[];
  meetings: ScheduledMeeting[];
  notifications: LabstarNotification[];
  nodes: WorkNode[];
};

const EMPTY_DATA: WorkHomeData = {
  spaces: [],
  channels: [],
  members: [],
  messages: [],
  meetings: [],
  notifications: [],
  nodes: [],
};

function readNodes(): WorkNode[] {
  try {
    const value = JSON.parse(window.localStorage.getItem("labstar-workspace-v1") ?? "[]") as unknown;
    if (!Array.isArray(value)) return [];
    return value.map((item) => {
      const row = item as Record<string, unknown>;
      return {
        id: String(row.id ?? ""),
        name: String(row.name ?? "Núcleo"),
        description: String(row.description ?? ""),
        owner: String(row.owner ?? "Sem responsável"),
        status: String(row.status ?? "planejamento"),
        priority: String(row.priority ?? "media"),
        progress: Math.max(0, Math.min(100, Number(row.progress ?? 0))),
      };
    }).filter((node) => node.id);
  } catch {
    return [];
  }
}

function formatRelative(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "agora";
  const diff = Date.now() - date.getTime();
  const minutes = Math.max(0, Math.floor(diff / 60_000));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `há ${days} d`;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(date);
}

function formatMeeting(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data pendente";
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "membro";
}

export function WorkHome({ member, onOpenChannel, onOpenDirect }: WorkHomeProps) {
  const [data, setData] = useState<WorkHomeData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftChannelId, setDraftChannelId] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const [collaborationResult, membersResult, notificationsResult] = await Promise.allSettled([
        loadCollaboration(),
        listMembers(),
        listNotifications(member.id),
      ]);

      const collaboration = collaborationResult.status === "fulfilled"
        ? collaborationResult.value
        : { spaces: [], categories: [], channels: [] };
      const members = membersResult.status === "fulfilled" ? membersResult.value.members : [];
      const notifications = notificationsResult.status === "fulfilled" ? notificationsResult.value : [];
      const readableChannels = collaboration.channels.filter((channel) => channel.type !== "voice").slice(0, 18);
      const voiceChannels = collaboration.channels.filter((channel) => channel.type === "voice").slice(0, 12);

      const [messageResults, meetingResults] = await Promise.all([
        Promise.allSettled(readableChannels.map((channel) => listMessages(channel.id))),
        Promise.allSettled(voiceChannels.map((channel) => listMeetings(channel.id))),
      ]);

      const messages = messageResults
        .flatMap((result) => result.status === "fulfilled" ? result.value.slice(-20) : [])
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const meetings = meetingResults
        .flatMap((result) => result.status === "fulfilled" ? result.value : [])
        .filter((meeting) => new Date(meeting.startsAt).getTime() >= Date.now() - 30 * 60_000)
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

      setData({
        spaces: collaboration.spaces,
        channels: collaboration.channels,
        members,
        messages,
        meetings,
        notifications,
        nodes: readNodes(),
      });
      setDraftChannelId((current) => current || readableChannels[0]?.id || "");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [member.id]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(true), 60_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const channelById = useMemo(() => new Map(data.channels.map((channel) => [channel.id, channel])), [data.channels]);
  const spaceById = useMemo(() => new Map(data.spaces.map((space) => [space.id, space])), [data.spaces]);
  const unreadNotifications = data.notifications.filter((notification) => !notification.isRead);
  const attentionNodes = data.nodes.filter((node) => node.status === "atencao" || node.priority === "alta");
  const activeNodes = data.nodes.filter((node) => node.status === "ativo");
  const activeMembers = data.members.filter((item) => item.status === "active");
  const upcomingMeetings = data.meetings.slice(0, 4);
  const recentMessages = data.messages.slice(0, 8);
  const recentFiles = data.messages
    .flatMap((message) => message.attachments.map((attachment) => ({ attachment, message })))
    .slice(0, 6);
  const writableChannels = data.channels.filter((channel) => channel.type !== "voice" && channel.type !== "social");
  const averageProgress = data.nodes.length
    ? Math.round(data.nodes.reduce((sum, node) => sum + node.progress, 0) / data.nodes.length)
    : 0;

  async function submitQuickCapture(event: React.FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    const channel = data.channels.find((item) => item.id === draftChannelId);
    if (!body || !channel) return;
    setSending(true);
    setNotice("");
    try {
      await sendMessage({
        channelId: channel.id,
        spaceId: channel.spaceId,
        authorId: member.id,
        body,
        files: [],
      });
      setDraft("");
      setNotice(`Publicado em #${channel.name}`);
      await refresh(true);
    } catch {
      setNotice("Não foi possível publicar agora.");
    } finally {
      setSending(false);
    }
  }

  function openGlobalSearch() {
    const input = document.querySelector<HTMLInputElement>(".global-search input");
    input?.focus();
  }

  function openMap() {
    document.querySelector<HTMLButtonElement>('button[aria-label="Mapa da organização"]')?.click();
  }

  if (loading) {
    return (
      <section className="work-home-loading">
        <LoaderCircle className="spin" size={24} />
        <strong>Montando sua central de trabalho</strong>
        <span>Reunindo mensagens, reuniões, arquivos e prioridades…</span>
      </section>
    );
  }

  return (
    <section className="work-home">
      <header className="work-home-head">
        <div>
          <span className="work-home-eyebrow"><Sparkles size={13} /> Central de trabalho</span>
          <h1>Olá, {firstName(member.name)}.</h1>
          <p>O que precisa da sua atenção e onde o trabalho está acontecendo agora.</p>
        </div>
        <div className="work-home-head-actions">
          <button type="button" onClick={openGlobalSearch}><Search size={15} /> Buscar em tudo</button>
          <button type="button" className="icon" onClick={() => void refresh(true)} aria-label="Atualizar central">
            <RefreshCw size={16} className={refreshing ? "spin" : ""} />
          </button>
        </div>
      </header>

      <div className="work-home-metrics">
        <article className={unreadNotifications.length ? "attention" : ""}>
          <span><Bell size={15} /> Não lidas</span>
          <strong>{unreadNotifications.length}</strong>
          <small>{unreadNotifications.length ? "precisam de revisão" : "caixa em dia"}</small>
        </article>
        <article>
          <span><Network size={15} /> Em andamento</span>
          <strong>{activeNodes.length}</strong>
          <small>{averageProgress}% de progresso médio</small>
        </article>
        <article>
          <span><CalendarClock size={15} /> Próximas reuniões</span>
          <strong>{upcomingMeetings.length}</strong>
          <small>{upcomingMeetings[0] ? formatMeeting(upcomingMeetings[0].startsAt) : "nenhuma agendada"}</small>
        </article>
        <article>
          <span><Users size={15} /> Equipe ativa</span>
          <strong>{activeMembers.length}</strong>
          <small>{data.spaces.length} espaços de trabalho</small>
        </article>
      </div>

      <div className="work-home-grid">
        <section className="work-focus-panel">
          <header>
            <div><strong>Prioridades de agora</strong><small>Alertas, decisões e compromissos mais próximos</small></div>
            <span>{attentionNodes.length + unreadNotifications.length + upcomingMeetings.length}</span>
          </header>
          <div className="work-focus-list">
            {attentionNodes.slice(0, 4).map((node) => (
              <button type="button" key={`node:${node.id}`} onClick={openMap}>
                <span className="work-focus-icon warning"><AlertTriangle size={15} /></span>
                <span><b>{node.name}</b><small>{node.description || `${node.owner} · ${node.progress}% concluído`}</small></span>
                <em>{node.priority === "alta" ? "Alta" : "Acompanhar"}</em>
                <ArrowRight size={14} />
              </button>
            ))}
            {upcomingMeetings.slice(0, 3).map((meeting) => {
              const channel = channelById.get(meeting.channelId);
              return (
                <button type="button" key={`meeting:${meeting.id}`} onClick={() => onOpenChannel(meeting.channelId)}>
                  <span className="work-focus-icon meeting"><Video size={15} /></span>
                  <span><b>{meeting.title}</b><small>{formatMeeting(meeting.startsAt)} · {channel?.name ?? "Sala de reunião"}</small></span>
                  <em>{meeting.durationMinutes} min</em>
                  <ArrowRight size={14} />
                </button>
              );
            })}
            {unreadNotifications.slice(0, 3).map((notification) => (
              <button type="button" key={`notification:${notification.id}`} onClick={() => notification.channelId && onOpenChannel(notification.channelId)}>
                <span className="work-focus-icon notice"><Bell size={15} /></span>
                <span><b>{notification.title}</b><small>{notification.body}</small></span>
                <em>{formatRelative(notification.createdAt)}</em>
                <ArrowRight size={14} />
              </button>
            ))}
            {!attentionNodes.length && !upcomingMeetings.length && !unreadNotifications.length && (
              <div className="work-focus-empty"><CheckCircle2 size={22} /><strong>Nada urgente agora</strong><span>Você pode avançar no trabalho planejado.</span></div>
            )}
          </div>
        </section>

        <aside className="work-capture-panel">
          <header><div><strong>Captura rápida</strong><small>Registre uma decisão ou atualização no canal certo.</small></div><Plus size={16} /></header>
          <form onSubmit={submitQuickCapture}>
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="O que precisa ficar registrado?" rows={5} />
            <select value={draftChannelId} onChange={(event) => setDraftChannelId(event.target.value)}>
              <option value="">Escolha um canal</option>
              {writableChannels.map((channel) => {
                const space = spaceById.get(channel.spaceId);
                return <option key={channel.id} value={channel.id}>{space?.name ?? "Labstar"} / #{channel.name}</option>;
              })}
            </select>
            <button type="submit" disabled={sending || !draft.trim() || !draftChannelId}>
              {sending ? <LoaderCircle className="spin" size={15} /> : <Send size={15} />}
              {sending ? "Publicando…" : "Publicar atualização"}
            </button>
            {notice && <span className="work-capture-notice">{notice}</span>}
          </form>
        </aside>
      </div>

      <div className="work-home-grid lower">
        <section className="work-activity-panel">
          <header><div><strong>Atividade recente</strong><small>Últimas conversas em toda a organização</small></div><button type="button" onClick={() => onOpenChannel(recentMessages[0]?.channelId)}>Abrir canais <ArrowRight size={13} /></button></header>
          <div className="work-activity-list">
            {recentMessages.map((message) => {
              const channel = channelById.get(message.channelId);
              const space = channel ? spaceById.get(channel.spaceId) : null;
              return (
                <button type="button" key={message.id} onClick={() => onOpenChannel(message.channelId)}>
                  <span className="activity-avatar">{(message.author?.name ?? "M").slice(0, 1).toUpperCase()}</span>
                  <span><b>{message.author?.name ?? "Membro"}</b><small>{message.body || `${message.attachments.length} arquivo(s)`}</small></span>
                  <em><Hash size={11} /> {channel?.name ?? "canal"}<i>{space?.name}</i></em>
                  <time>{formatRelative(message.createdAt)}</time>
                </button>
              );
            })}
            {!recentMessages.length && <div className="work-list-empty"><MessageSquareText size={21} /><span>As conversas recentes aparecerão aqui.</span></div>}
          </div>
        </section>

        <aside className="work-files-panel">
          <header><div><strong>Arquivos recentes</strong><small>Conteúdo compartilhado nos canais</small></div><FileText size={16} /></header>
          <div className="work-files-list">
            {recentFiles.map(({ attachment, message }) => {
              const channel = channelById.get(message.channelId);
              return (
                <button type="button" key={attachment.id} onClick={() => onOpenChannel(message.channelId)}>
                  <span><FileText size={15} /></span>
                  <div><b>{attachment.fileName}</b><small>#{channel?.name ?? "canal"} · {formatRelative(message.createdAt)}</small></div>
                  <ArrowRight size={13} />
                </button>
              );
            })}
            {!recentFiles.length && <div className="work-list-empty"><FileText size={21} /><span>Arquivos compartilhados aparecerão aqui.</span></div>}
          </div>
        </aside>
      </div>

      <footer className="work-home-shortcuts">
        <button type="button" onClick={() => onOpenChannel(data.channels[0]?.id)}><Hash size={15} /><span><b>Abrir canais</b><small>Conversas organizadas por espaço</small></span><ArrowRight size={14} /></button>
        <button type="button" onClick={onOpenDirect}><MessageSquareText size={15} /><span><b>Mensagens diretas</b><small>Converse com uma pessoa</small></span><ArrowRight size={14} /></button>
        <button type="button" onClick={openMap}><Network size={15} /><span><b>Mapa da organização</b><small>Projetos, áreas e responsáveis</small></span><ArrowRight size={14} /></button>
        <button type="button" onClick={openGlobalSearch}><Search size={15} /><span><b>Busca global</b><small>Encontre qualquer coisa</small></span><ArrowRight size={14} /></button>
      </footer>
    </section>
  );
}

import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCircle2,
  Copy,
  File,
  Hash,
  LayoutDashboard,
  LoaderCircle,
  MessageSquare,
  Network,
  Search,
  Sparkles,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  getCurrentIdentity,
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

type WorkspaceNode = {
  id: string;
  name: string;
  description: string;
  kind: string;
  status: string;
  priority: string;
  owner: string;
  progress: number;
};

type SearchKind = "node" | "space" | "channel" | "member" | "message" | "file" | "notification";

type SearchRecord = {
  id: string;
  kind: SearchKind;
  title: string;
  subtitle: string;
  keywords: string;
  channelId?: string;
  nodeId?: string;
  memberName?: string;
  queryHint?: string;
};

type IntelligenceData = {
  nodes: WorkspaceNode[];
  spaces: CollaborationSpace[];
  channels: LabstarChannel[];
  members: Member[];
  messages: ChannelMessage[];
  notifications: LabstarNotification[];
  records: SearchRecord[];
  loading: boolean;
  refreshedAt: number;
};

const EMPTY_DATA: IntelligenceData = {
  nodes: [],
  spaces: [],
  channels: [],
  members: [],
  messages: [],
  notifications: [],
  records: [],
  loading: true,
  refreshedAt: 0,
};

const KIND_LABEL: Record<SearchKind, string> = {
  node: "Núcleo",
  space: "Espaço",
  channel: "Canal",
  member: "Pessoa",
  message: "Mensagem",
  file: "Arquivo",
  notification: "Notificação",
};

function readWorkspaceNodes(): WorkspaceNode[] {
  try {
    const value = JSON.parse(window.localStorage.getItem("labstar-workspace-v1") ?? "[]") as unknown;
    if (!Array.isArray(value)) return [];
    return value.map((item) => {
      const row = item as Record<string, unknown>;
      return {
        id: String(row.id ?? ""),
        name: String(row.name ?? "Sem nome"),
        description: String(row.description ?? ""),
        kind: String(row.kind ?? "núcleo"),
        status: String(row.status ?? "planejamento"),
        priority: String(row.priority ?? "media"),
        owner: String(row.owner ?? "Sem responsável"),
        progress: Math.max(0, Math.min(100, Number(row.progress ?? 0))),
      };
    }).filter((item) => item.id);
  } catch {
    return [];
  }
}

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function clickView(ariaLabel: string) {
  document.querySelector<HTMLButtonElement>(`button[aria-label="${ariaLabel}"]`)?.click();
}

function channelKindLabel(channel: LabstarChannel) {
  return channel.type === "voice" ? "Sala de voz" : channel.type === "social" ? "Planejamento social" : "Canal";
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().trim();
}

function scoreRecord(record: SearchRecord, query: string) {
  const title = normalize(record.title);
  const subtitle = normalize(record.subtitle);
  const keywords = normalize(record.keywords);
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return 0;
  let score = 0;
  for (const term of terms) {
    if (title === term) score += 120;
    else if (title.startsWith(term)) score += 85;
    else if (title.includes(term)) score += 60;
    if (subtitle.includes(term)) score += 28;
    if (keywords.includes(term)) score += 15;
  }
  return score;
}

function recordIcon(kind: SearchKind) {
  if (kind === "node" || kind === "space") return <Network size={15} />;
  if (kind === "channel") return <Hash size={15} />;
  if (kind === "member") return <UserRound size={15} />;
  if (kind === "message") return <MessageSquare size={15} />;
  if (kind === "file") return <File size={15} />;
  return <Bell size={15} />;
}

export function WorkspaceIntelligence() {
  const [data, setData] = useState<IntelligenceData>(EMPTY_DATA);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchRect, setSearchRect] = useState<DOMRect | null>(null);
  const [overviewMount, setOverviewMount] = useState<HTMLElement | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const boundInputRef = useRef<HTMLInputElement | null>(null);
  const loadPromiseRef = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async () => {
    if (loadPromiseRef.current) return loadPromiseRef.current;
    const task = (async () => {
      setData((current) => ({ ...current, nodes: readWorkspaceNodes(), loading: current.refreshedAt === 0 }));
      const [collaborationResult, membersResult, identityResult] = await Promise.allSettled([
        loadCollaboration(),
        listMembers(),
        getCurrentIdentity(),
      ]);

      const collaboration = collaborationResult.status === "fulfilled"
        ? collaborationResult.value
        : { spaces: [], categories: [], channels: [] };
      const members = membersResult.status === "fulfilled" ? membersResult.value.members : [];
      const identity = identityResult.status === "fulfilled" ? identityResult.value : null;
      const searchableChannels = collaboration.channels
        .filter((channel) => channel.type !== "voice")
        .slice(0, 30);

      const messageResults = await Promise.allSettled(searchableChannels.map((channel) => listMessages(channel.id)));
      const messages = messageResults.flatMap((result) => result.status === "fulfilled" ? result.value.slice(-100) : []);
      const notifications = identity?.member
        ? await listNotifications(identity.member.id).catch(() => [])
        : [];
      const nodes = readWorkspaceNodes();
      const spaceById = new Map(collaboration.spaces.map((space) => [space.id, space]));
      const channelById = new Map(collaboration.channels.map((channel) => [channel.id, channel]));
      const records: SearchRecord[] = [];

      for (const node of nodes) {
        records.push({
          id: `node:${node.id}`,
          kind: "node",
          title: node.name,
          subtitle: `${node.kind} · ${node.owner} · ${node.progress}%`,
          keywords: `${node.description} ${node.status} ${node.priority} ${node.owner}`,
          nodeId: node.id,
          queryHint: node.name,
        });
      }
      for (const space of collaboration.spaces) {
        const firstChannel = collaboration.channels.find((channel) => channel.spaceId === space.id);
        records.push({
          id: `space:${space.id}`,
          kind: "space",
          title: space.name,
          subtitle: `${space.kind} · ${space.description || "Espaço de trabalho"}`,
          keywords: `${space.description} ${space.icon}`,
          channelId: firstChannel?.id,
        });
      }
      for (const channel of collaboration.channels) {
        const space = spaceById.get(channel.spaceId);
        records.push({
          id: `channel:${channel.id}`,
          kind: "channel",
          title: `#${channel.name}`,
          subtitle: `${channelKindLabel(channel)} · ${space?.name ?? "Labstar"}`,
          keywords: `${channel.description} ${channel.type} ${space?.description ?? ""}`,
          channelId: channel.id,
        });
      }
      for (const member of members) {
        records.push({
          id: `member:${member.id}`,
          kind: "member",
          title: member.name,
          subtitle: `${member.jobRoles[0]?.name || member.jobTitle || "Membro"} · ${member.area || member.email}`,
          keywords: `${member.email} ${member.area} ${member.jobTitle} ${member.jobRoles.map((role) => role.name).join(" ")}`,
          memberName: member.name,
        });
      }
      for (const message of messages) {
        const channel = channelById.get(message.channelId);
        if (message.body.trim()) {
          records.push({
            id: `message:${message.id}`,
            kind: "message",
            title: message.body.slice(0, 90),
            subtitle: `${message.author?.name ?? "Membro"} em #${channel?.name ?? "canal"}`,
            keywords: `${message.body} ${message.author?.name ?? ""} ${channel?.description ?? ""}`,
            channelId: message.channelId,
            queryHint: message.body.slice(0, 45),
          });
        }
        for (const attachment of message.attachments) {
          records.push({
            id: `file:${attachment.id}`,
            kind: "file",
            title: attachment.fileName,
            subtitle: `Arquivo em #${channel?.name ?? "canal"}`,
            keywords: `${attachment.mimeType} ${message.body} ${message.author?.name ?? ""}`,
            channelId: message.channelId,
            queryHint: attachment.fileName,
          });
        }
      }
      for (const notification of notifications) {
        records.push({
          id: `notification:${notification.id}`,
          kind: "notification",
          title: notification.title,
          subtitle: notification.body,
          keywords: `${notification.title} ${notification.body}`,
          channelId: notification.channelId ?? undefined,
        });
      }

      setData({
        nodes,
        spaces: collaboration.spaces,
        channels: collaboration.channels,
        members,
        messages,
        notifications,
        records,
        loading: false,
        refreshedAt: Date.now(),
      });
    })().finally(() => {
      loadPromiseRef.current = null;
    });
    loadPromiseRef.current = task;
    return task;
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 45_000);
    const refreshFromStorage = () => void refresh();
    window.addEventListener("storage", refreshFromStorage);
    window.addEventListener("labstar:data-changed", refreshFromStorage);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("storage", refreshFromStorage);
      window.removeEventListener("labstar:data-changed", refreshFromStorage);
    };
  }, [refresh]);

  useEffect(() => {
    let cleanupInput: (() => void) | null = null;
    const bindInput = () => {
      const input = document.querySelector<HTMLInputElement>(".global-search input");
      if (!input || boundInputRef.current === input) return;
      cleanupInput?.();
      boundInputRef.current = input;
      input.placeholder = "Buscar em tudo no Labstar...";
      const syncRect = () => setSearchRect(input.getBoundingClientRect());
      const onInput = () => {
        setQuery(input.value);
        setSelectedIndex(0);
        setSearchOpen(true);
        syncRect();
        if (!data.refreshedAt) void refresh();
      };
      const onFocus = () => {
        setSearchOpen(true);
        syncRect();
        if (!data.refreshedAt) void refresh();
      };
      input.addEventListener("input", onInput);
      input.addEventListener("focus", onFocus);
      window.addEventListener("resize", syncRect);
      window.addEventListener("scroll", syncRect, true);
      syncRect();
      cleanupInput = () => {
        input.removeEventListener("input", onInput);
        input.removeEventListener("focus", onFocus);
        window.removeEventListener("resize", syncRect);
        window.removeEventListener("scroll", syncRect, true);
      };
    };
    bindInput();
    const observer = new MutationObserver(bindInput);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      cleanupInput?.();
    };
  }, [data.refreshedAt, refresh]);

  useEffect(() => {
    let cleanupButton: (() => void) | null = null;
    const bindOverview = () => {
      const overview = document.querySelector<HTMLElement>(".overview");
      if (!overview) {
        setOverviewMount(null);
        return;
      }
      overview.classList.add("overview-enhanced");
      const description = overview.querySelector<HTMLElement>(".overview-head p");
      if (description) description.textContent = "Prioridades, atividade e saúde do trabalho em um só lugar.";
      let mount = overview.querySelector<HTMLElement>("[data-labstar-overview-intelligence]");
      if (!mount) {
        mount = document.createElement("div");
        mount.dataset.labstarOverviewIntelligence = "true";
        const metricGrid = overview.querySelector(".metric-grid");
        metricGrid?.insertAdjacentElement("afterend", mount);
      }
      setOverviewMount(mount);
      const button = overview.querySelector<HTMLButtonElement>(".overview-head > button");
      if (!button || button.dataset.labstarSummaryBound === "true") return;
      button.dataset.labstarSummaryBound = "true";
      const openSummary = (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        setSummaryOpen(true);
        void refresh();
      };
      button.addEventListener("click", openSummary, true);
      cleanupButton = () => button.removeEventListener("click", openSummary, true);
    };
    bindOverview();
    const observer = new MutationObserver(bindOverview);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      cleanupButton?.();
    };
  }, [refresh]);

  const results = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return data.records.filter((record) => ["node", "channel", "member"].includes(record.kind)).slice(0, 8);
    return data.records
      .map((record) => ({ record, score: scoreRecord(record, trimmed) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.record.title.localeCompare(b.record.title))
      .slice(0, 24)
      .map((item) => item.record);
  }, [data.records, query]);

  const openRecord = useCallback((record: SearchRecord) => {
    setSearchOpen(false);
    if (record.kind === "node") {
      clickView("Mapa da organização");
      window.setTimeout(() => {
        const input = document.querySelector<HTMLInputElement>(".global-search input");
        if (input) setNativeInputValue(input, record.queryHint ?? record.title);
      }, 80);
      return;
    }
    if (record.kind === "member") {
      clickView("Equipe");
      window.setTimeout(() => {
        const input = document.querySelector<HTMLInputElement>(".member-search input");
        if (input) {
          setNativeInputValue(input, record.memberName ?? record.title);
          input.focus();
        }
      }, 120);
      return;
    }
    if (record.channelId) {
      clickView("Central de trabalho");
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent("labstar:open-channel", {
          detail: { channelId: record.channelId, query: record.queryHint ?? "" },
        }));
      }, 70);
      return;
    }
    if (record.kind === "space") clickView("Central de trabalho");
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!searchOpen) return;
      if (event.key === "Escape") {
        setSearchOpen(false);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((current) => Math.min(results.length - 1, current + 1));
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((current) => Math.max(0, current - 1));
      }
      if (event.key === "Enter" && results[selectedIndex]) {
        event.preventDefault();
        openRecord(results[selectedIndex]);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [openRecord, results, searchOpen, selectedIndex]);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest(".global-search, .labstar-global-results")) return;
      setSearchOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);

  const searchPortal = searchOpen && searchRect ? createPortal(
    <section
      className="labstar-global-results"
      style={{
        left: Math.max(12, searchRect.left),
        top: searchRect.bottom + 8,
        width: Math.min(Math.max(searchRect.width, 520), window.innerWidth - Math.max(24, searchRect.left + 12)),
      }}
      role="listbox"
      aria-label="Resultados da busca global"
    >
      <header>
        <div><Search size={15} /><strong>{query.trim() ? `Resultados para “${query.trim()}”` : "Acesso rápido"}</strong></div>
        <span>{data.loading ? "Atualizando índice" : `${data.records.length} itens pesquisáveis`}</span>
      </header>
      <div className="labstar-global-result-list">
        {data.loading && !results.length ? (
          <div className="labstar-search-state"><LoaderCircle className="spin" size={18} /> Indexando o ambiente…</div>
        ) : results.length ? results.map((record, index) => (
          <button
            type="button"
            key={record.id}
            className={selectedIndex === index ? "active" : ""}
            onPointerMove={() => setSelectedIndex(index)}
            onClick={() => openRecord(record)}
            role="option"
            aria-selected={selectedIndex === index}
          >
            <span className={`labstar-search-kind ${record.kind}`}>{recordIcon(record.kind)}</span>
            <span><strong>{record.title}</strong><small>{record.subtitle}</small></span>
            <em>{KIND_LABEL[record.kind]}</em>
            <ArrowRight size={14} />
          </button>
        )) : (
          <div className="labstar-search-state"><Search size={18} /><strong>Nada encontrado</strong><span>Tente nome de projeto, pessoa, canal, mensagem ou arquivo.</span></div>
        )}
      </div>
      <footer><span>↑↓ navegar</span><span>Enter abrir</span><span>Esc fechar</span></footer>
    </section>,
    document.body,
  ) : null;

  const overviewPortal = overviewMount ? createPortal(
    <OverviewIntelligence data={data} onRefresh={() => void refresh()} onOpenSummary={() => setSummaryOpen(true)} />,
    overviewMount,
  ) : null;

  const summaryPortal = summaryOpen ? createPortal(
    <ExecutiveSummary data={data} onClose={() => setSummaryOpen(false)} />,
    document.body,
  ) : null;

  return <>{searchPortal}{overviewPortal}{summaryPortal}</>;
}

function OverviewIntelligence({ data, onRefresh, onOpenSummary }: { data: IntelligenceData; onRefresh: () => void; onOpenSummary: () => void }) {
  const activeMembers = data.members.filter((member) => member.status === "active").length;
  const unread = data.notifications.filter((item) => !item.isRead).length;
  const priorities = [...data.nodes]
    .filter((node) => node.status === "atencao" || node.priority === "alta" || node.progress < 25)
    .sort((a, b) => {
      const aScore = (a.status === "atencao" ? 100 : 0) + (a.priority === "alta" ? 40 : 0) + (100 - a.progress);
      const bScore = (b.status === "atencao" ? 100 : 0) + (b.priority === "alta" ? 40 : 0) + (100 - b.progress);
      return bScore - aScore;
    })
    .slice(0, 4);
  const average = data.nodes.length
    ? Math.round(data.nodes.reduce((sum, node) => sum + node.progress, 0) / data.nodes.length)
    : 0;

  return (
    <section className="overview-intelligence">
      <header><div><strong>Trabalho agora</strong><small>O que merece ação sem precisar procurar em várias telas.</small></div><button type="button" onClick={onRefresh}>{data.loading ? <LoaderCircle className="spin" size={13} /> : <Sparkles size={13} />} Atualizar</button></header>
      <div className="overview-intelligence-metrics">
        <button type="button" onClick={() => clickView("Central de trabalho")}><MessageSquare size={16} /><span><strong>{unread}</strong><small>notificações não lidas</small></span><ArrowRight size={13} /></button>
        <button type="button" onClick={() => clickView("Central de trabalho")}><Hash size={16} /><span><strong>{data.channels.length}</strong><small>canais disponíveis</small></span><ArrowRight size={13} /></button>
        <button type="button" onClick={() => clickView("Equipe")}><Users size={16} /><span><strong>{activeMembers}</strong><small>membros ativos</small></span><ArrowRight size={13} /></button>
        <button type="button" onClick={onOpenSummary}><LayoutDashboard size={16} /><span><strong>{average}%</strong><small>progresso médio</small></span><ArrowRight size={13} /></button>
      </div>
      <div className="overview-priority-panel">
        <div className="overview-priority-head"><div><strong>Próximas decisões</strong><small>Ordenadas por atenção, prioridade e baixo progresso.</small></div><button type="button" onClick={onOpenSummary}>Ver resumo completo</button></div>
        {priorities.length ? <div className="overview-priority-list">{priorities.map((node) => (
          <button type="button" key={node.id} onClick={() => {
            clickView("Mapa da organização");
            window.setTimeout(() => {
              const input = document.querySelector<HTMLInputElement>(".global-search input");
              if (input) setNativeInputValue(input, node.name);
            }, 80);
          }}>
            <span className={node.status === "atencao" ? "danger" : "priority"}>{node.status === "atencao" ? <AlertTriangle size={14} /> : <Network size={14} />}</span>
            <span><strong>{node.name}</strong><small>{node.description || `${node.owner} · ${node.progress}% concluído`}</small></span>
            <em>{node.progress}%</em><ArrowRight size={13} />
          </button>
        ))}</div> : <div className="overview-all-clear"><CheckCircle2 size={18} /><span><strong>Nenhuma prioridade crítica</strong><small>O ambiente não possui núcleos marcados para atenção neste momento.</small></span></div>}
      </div>
    </section>
  );
}

function ExecutiveSummary({ data, onClose }: { data: IntelligenceData; onClose: () => void }) {
  const average = data.nodes.length
    ? Math.round(data.nodes.reduce((sum, node) => sum + node.progress, 0) / data.nodes.length)
    : 0;
  const attention = data.nodes.filter((node) => node.status === "atencao");
  const active = data.nodes.filter((node) => node.status === "ativo");
  const completed = data.nodes.filter((node) => node.status === "concluido");
  const unread = data.notifications.filter((item) => !item.isRead);
  const priorities = [...data.nodes]
    .filter((node) => node.status === "atencao" || node.priority === "alta")
    .sort((a, b) => (a.status === "atencao" ? -1 : 0) - (b.status === "atencao" ? -1 : 0) || a.progress - b.progress)
    .slice(0, 6);
  const summaryText = [
    `Labstar — resumo de ${new Date().toLocaleString("pt-BR")}`,
    `${data.nodes.length} núcleos, ${active.length} em andamento, ${attention.length} exigindo atenção e ${completed.length} concluídos.`,
    `Progresso médio: ${average}%. Equipe ativa: ${data.members.filter((member) => member.status === "active").length}. Canais: ${data.channels.length}.`,
    `Notificações não lidas: ${unread.length}.`,
    priorities.length ? `Prioridades: ${priorities.map((node) => `${node.name} (${node.progress}%)`).join(", ")}.` : "Nenhuma prioridade crítica registrada.",
  ].join("\n");

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  return (
    <div className="executive-summary-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="executive-summary-modal" role="dialog" aria-modal="true" aria-labelledby="executive-summary-title" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><span><Sparkles size={18} /></span><div><strong id="executive-summary-title">Resumo do ambiente</strong><small>Gerado com os dados atuais do Labstar</small></div></div><button type="button" onClick={onClose} aria-label="Fechar"><X size={17} /></button></header>
        <div className="executive-summary-body">
          <div className="executive-summary-hero"><span><strong>{average}%</strong><small>progresso geral</small></span><div><h2>{attention.length ? `${attention.length} ponto${attention.length > 1 ? "s" : ""} exige${attention.length === 1 ? "" : "m"} decisão` : "Operação sem alerta crítico"}</h2><p>{attention.length ? "Os itens abaixo devem ser revisados antes de aumentar novas frentes." : "Continue acompanhando progresso, comunicação e responsáveis."}</p></div></div>
          <div className="executive-summary-grid">
            <article><span>Núcleos</span><strong>{data.nodes.length}</strong><small>{active.length} em andamento</small></article>
            <article><span>Equipe</span><strong>{data.members.filter((member) => member.status === "active").length}</strong><small>{data.members.filter((member) => member.status === "pending").length} pendente(s)</small></article>
            <article><span>Comunicação</span><strong>{data.channels.length}</strong><small>{unread.length} não lida(s)</small></article>
            <article><span>Concluídos</span><strong>{completed.length}</strong><small>{average}% de média</small></article>
          </div>
          <section className="executive-summary-priorities"><header><strong>Prioridades recomendadas</strong><small>Ordenadas por risco e progresso.</small></header>{priorities.length ? priorities.map((node) => <button type="button" key={node.id} onClick={() => {
            onClose();
            clickView("Mapa da organização");
            window.setTimeout(() => {
              const input = document.querySelector<HTMLInputElement>(".global-search input");
              if (input) setNativeInputValue(input, node.name);
            }, 80);
          }}><span className={node.status === "atencao" ? "danger" : "priority"}>{node.status === "atencao" ? <AlertTriangle size={14} /> : <Network size={14} />}</span><span><strong>{node.name}</strong><small>{node.description || node.owner}</small></span><em>{node.progress}%</em><ArrowRight size={13} /></button>) : <div className="overview-all-clear"><CheckCircle2 size={18} /><span><strong>Nenhum risco crítico</strong><small>Não há prioridades altas ou itens em atenção.</small></span></div>}</section>
        </div>
        <footer><button type="button" onClick={() => void navigator.clipboard.writeText(summaryText)}><Copy size={14} /> Copiar resumo</button><button className="primary" type="button" onClick={onClose}>Concluir</button></footer>
      </section>
    </div>
  );
}

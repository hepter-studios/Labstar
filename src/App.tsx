import {
  AlertTriangle,
  ArrowUpRight,
  Boxes,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Cloud,
  CloudOff,
  Focus,
  FolderKanban,
  FileText,
  Github,
  Globe2,
  HelpCircle,
  LayoutDashboard,
  LockKeyhole,
  Link2,
  LoaderCircle,
  LogIn,
  MessagesSquare,
  Network,
  Orbit,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  UserCheck,
  UserCog,
  UserPlus,
  Users,
  Volume2,
  VolumeX,
  X,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  getCurrentIdentity,
  inviteMember as createMemberInvite,
  isSupabaseConfigured,
  listJobRoles,
  listMembers,
  loadWorkspace as loadRemoteWorkspace,
  removeOwnAvatar,
  requestMagicLink,
  saveWorkspace,
  setMemberJobRoles,
  signOut,
  uploadOwnAvatar,
  updateOwnProfile,
  updateMember as updateRemoteMember,
  type Member,
  type JobRole,
} from "./lib/supabase";
import { Avatar } from "./components/Avatar";
import { CollaborationHub } from "./components/CollaborationHub";
import { NotificationsButton } from "./components/NotificationsPanel";
import { RoleBadge, RoleManager } from "./components/RoleManager";

type NodeKind = "holding" | "empresa" | "area" | "produto" | "projeto";
type NodeStatus = "planejamento" | "ativo" | "atencao" | "concluido";
type NodePriority = "baixa" | "media" | "alta";
type ViewMode = "mapa" | "visao" | "colaboracao" | "equipe";
type SyncState = "carregando" | "salvando" | "sincronizado" | "local";
type ManualSaveState = "idle" | "saving" | "saved" | "error";
type SessionState = "carregando" | "anonimo" | "nao_convidado" | "pendente" | "ativo" | "configuracao" | "erro";

type SessionData = {
  user: { displayName: string; email: string; fullName: string | null };
  member: Member;
};

type StructureNode = {
  id: string;
  parentId: string | null;
  name: string;
  description: string;
  kind: NodeKind;
  status: NodeStatus;
  priority: NodePriority;
  owner: string;
  githubUrl?: string;
  websiteUrl?: string;
  progress: number;
  x: number;
  y: number;
};

const initialNodes: StructureNode[] = [
  { id: "labstar", parentId: null, name: "Labstar", description: "Ecossistema central de empresas, produtos e projetos.", kind: "holding", status: "ativo", priority: "alta", owner: "Fundador", progress: 42, x: 720, y: 360 },
  { id: "games", parentId: "labstar", name: "Labstar Games", description: "Estúdio de criação e publicação de jogos.", kind: "empresa", status: "ativo", priority: "alta", owner: "Direção criativa", progress: 36, x: 330, y: 120 },
  { id: "digital", parentId: "labstar", name: "Produtos digitais", description: "Softwares, plataformas e novas experiências.", kind: "empresa", status: "planejamento", priority: "alta", owner: "Produto", progress: 18, x: 1120, y: 120 },
  { id: "operations", parentId: "labstar", name: "Operações", description: "Finanças, jurídico, pessoas e processos.", kind: "area", status: "ativo", priority: "media", owner: "Operações", progress: 64, x: 320, y: 600 },
  { id: "growth", parentId: "labstar", name: "Marca & Growth", description: "Marca, comunidade, conteúdo e crescimento.", kind: "area", status: "ativo", priority: "media", owner: "Marketing", progress: 51, x: 1110, y: 600 },
  { id: "aurora", parentId: "games", name: "Projeto Aurora", description: "Primeiro universo original do estúdio.", kind: "projeto", status: "atencao", priority: "alta", owner: "Game team", progress: 28, x: 40, y: 80 },
  { id: "atlas", parentId: "digital", name: "Atlas", description: "Produto em validação e descoberta.", kind: "produto", status: "planejamento", priority: "media", owner: "Product team", progress: 12, x: 1420, y: 80 },
];

const kindMeta: Record<NodeKind, { label: string; color: string; Icon: LucideIcon }> = {
  holding: { label: "Holding", color: "#dfe7ff", Icon: Orbit },
  empresa: { label: "Empresa", color: "#8baeff", Icon: Building2 },
  area: { label: "Área", color: "#8e98b6", Icon: Users },
  produto: { label: "Produto", color: "#a58cff", Icon: Boxes },
  projeto: { label: "Projeto", color: "#69d7bf", Icon: FolderKanban },
};

const statusMeta: Record<NodeStatus, { label: string; color: string }> = {
  planejamento: { label: "Planejamento", color: "#8790a8" },
  ativo: { label: "Em andamento", color: "#6cc8ae" },
  atencao: { label: "Requer atenção", color: "#e7a55b" },
  concluido: { label: "Concluído", color: "#839ef7" },
};

function playTone() {
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const output = context.createGain();
  output.gain.setValueAtTime(0.0001, context.currentTime);
  output.gain.exponentialRampToValueAtTime(0.035, context.currentTime + 0.02);
  output.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.5);
  output.connect(context.destination);
  [523, 698, 1047].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    oscillator.connect(output);
    oscillator.start(context.currentTime + index * 0.035);
    oscillator.stop(context.currentTime + 0.56);
  });
}

export default function Home() {
  const [introComplete, setIntroComplete] = useState(false);
  const [sessionState, setSessionState] = useState<SessionState>("carregando");
  const [session, setSession] = useState<SessionData | null>(null);
  const [blockedIdentity, setBlockedIdentity] = useState<{ email: string } | null>(null);
  const [nodes, setNodes] = useState<StructureNode[]>(initialNodes);
  const [selectedId, setSelectedId] = useState("labstar");
  const [view, setView] = useState<ViewMode>("mapa");
  const [zoom, setZoom] = useState(0.78);
  const [sound, setSound] = useState(true);
  const [search, setSearch] = useState("");
  const [quickPanel, setQuickPanel] = useState<"profile" | "help" | "summary" | null>(null);
  const [notificationChannelId, setNotificationChannelId] = useState<string | null>(null);
  const [legalOpen, setLegalOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [sync, setSync] = useState<SyncState>("carregando");
  const [manualSave, setManualSave] = useState<ManualSaveState>("idle");
  const [panning, setPanning] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const panRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const zoomRef = useRef(zoom);
  const pendingWheelRef = useRef(0);
  const wheelFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setIntroComplete(true), 2350);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    let cancelled = false;
    async function loadSession() {
      if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("preview")) {
        setSession({
          user: { displayName: "Mackson Victor", email: "preview@labstar.local", fullName: "Mackson Victor" },
          member: {
            id: "preview-member",
            email: "preview@labstar.local",
            name: "Mackson Victor",
            status: "active",
            role: "owner",
            jobTitle: "CEO",
            area: "Direção",
            assignments: ["labstar"],
            createdAt: new Date().toISOString(),
            lastSeenAt: new Date().toISOString(),
            avatarPath: "",
            avatarUrl: "",
            jobRoles: [{ id: "preview-role", name: "CEO", department: "Diretoria", color: "#ef5b62", icon: "star", position: 10, permissions: ["manage_members", "manage_channels", "manage_projects"] }],
          },
        });
        setSessionState("ativo");
        return;
      }
      if (!isSupabaseConfigured) {
        setSessionState("configuracao");
        return;
      }
      try {
        const identity = await getCurrentIdentity();
        if (cancelled) return;
        if (!identity) {
          setSessionState("anonimo");
        } else if (!identity.member) {
          setBlockedIdentity({ email: identity.user.email ?? "Conta não autorizada" });
          setSessionState("nao_convidado");
        } else {
          let member = identity.member;
          const legacyOwnerNames = new Set(["fundador labstar", "hepter studios", "fundador"]);
          if (member.role === "owner" && legacyOwnerNames.has(member.name.trim().toLocaleLowerCase())) {
            try {
              member = await updateRemoteMember(member.id, { name: "Mackson Victor" });
            } catch {
              // A edição manual continua disponível na área Equipe.
            }
          }
          if (cancelled) return;
          const fullName = identity.user.user_metadata?.full_name
            ?? identity.user.user_metadata?.name
            ?? null;
          setSession({
            user: {
              displayName: fullName ?? identity.user.email ?? identity.member.name,
              email: identity.user.email ?? identity.member.email,
              fullName,
            },
            member,
          });
          setSessionState(member.status === "active" ? "ativo" : "pendente");
        }
      } catch {
        if (!cancelled) setSessionState("erro");
      }
    }
    loadSession();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (sessionState !== "ativo") return;
    let cancelled = false;
    async function loadWorkspace() {
      const local = localStorage.getItem("labstar-workspace-v1");
      if (local) {
        try { setNodes(JSON.parse(local)); } catch { /* use initial workspace */ }
      }
      try {
        const remoteNodes = await loadRemoteWorkspace<StructureNode[]>();
        if (!cancelled && Array.isArray(remoteNodes) && remoteNodes.length) {
          setNodes(remoteNodes);
          setSync("sincronizado");
        } else if (!cancelled) {
          setSync("local");
        }
      } catch {
        if (!cancelled) setSync("local");
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    loadWorkspace();
    return () => { cancelled = true; };
  }, [sessionState]);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem("labstar-workspace-v1", JSON.stringify(nodes));
    setSync("salvando");
    const timer = window.setTimeout(async () => {
      try {
        await saveWorkspace(nodes);
        setSync("sincronizado");
      } catch {
        setSync("local");
      }
    }, 650);
    return () => window.clearTimeout(timer);
  }, [nodes, ready]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const pan = panRef.current;
      const viewport = viewportRef.current;
      if (pan && viewport) {
        viewport.scrollLeft = pan.left - (event.clientX - pan.x);
        viewport.scrollTop = pan.top - (event.clientY - pan.y);
        return;
      }
      const drag = dragRef.current;
      const board = boardRef.current;
      if (!drag || !board) return;
      const rect = board.getBoundingClientRect();
      const x = Math.round((event.clientX - rect.left) / zoom - drag.dx);
      const y = Math.round((event.clientY - rect.top) / zoom - drag.dy);
      setNodes((current) => current.map((node) =>
        node.id === drag.id ? { ...node, x: Math.max(24, x), y: Math.max(24, y) } : node
      ));
    };
    const stop = () => {
      dragRef.current = null;
      panRef.current = null;
      setPanning(false);
      setDraggingId(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      if (wheelFrameRef.current !== null) window.cancelAnimationFrame(wheelFrameRef.current);
    };
  }, [zoom]);

  useEffect(() => {
    const shortcuts = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (view !== "mapa" || (event.target as HTMLElement)?.matches("input, textarea, select")) return;
      if (event.key === "+" || event.key === "=") setZoom((value) => Math.min(1.2, value + .035));
      if (event.key === "-") setZoom((value) => Math.max(.46, value - .035));
      if (event.key === "0") fitMap();
    };
    window.addEventListener("keydown", shortcuts);
    return () => window.removeEventListener("keydown", shortcuts);
  }, [view, nodes]);

  const selected = nodes.find((node) => node.id === selectedId) ?? null;
  const connections = useMemo(() => nodes.flatMap((node) => {
    const parent = nodes.find((candidate) => candidate.id === node.parentId);
    return parent ? [{ child: node, parent }] : [];
  }), [nodes]);
  const averageProgress = nodes.length ? Math.round(nodes.reduce((sum, node) => sum + node.progress, 0) / nodes.length) : 0;
  const activeCount = nodes.filter((node) => node.status === "ativo").length;
  const attentionNodes = nodes.filter((node) => node.status === "atencao");
  const completeCount = nodes.filter((node) => node.status === "concluido").length;
  const query = search.trim().toLocaleLowerCase();

  function selectNode(id: string) {
    setSelectedId(id);
    setManualSave("idle");
    if (sound) playTone();
  }

  function openEditor(id: string) {
    selectNode(id);
    setEditorOpen(true);
  }

  function addNode(parentId: string | null = selectedId) {
    const parent = nodes.find((node) => node.id === parentId);
    const siblings = nodes.filter((node) => node.parentId === parentId).length;
    const id = `node-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const next: StructureNode = {
      id,
      parentId,
      name: "Novo projeto",
      description: "Defina o objetivo deste núcleo.",
      kind: "projeto",
      status: "planejamento",
      priority: "media",
      owner: "Sem responsável",
      progress: 0,
      x: parent ? parent.x + 350 : 720,
      y: parent ? parent.y + (siblings % 2 === 0 ? -205 : 205) : 400,
    };
    setNodes((current) => [...current, next]);
    setView("mapa");
    selectNode(id);
    setEditorOpen(true);
  }

  function updateSelected(patch: Partial<StructureNode>) {
    setManualSave("idle");
    setNodes((current) => current.map((node) => node.id === selectedId ? { ...node, ...patch } : node));
  }

  async function saveSelectedChanges() {
    setManualSave("saving");
    setSync("salvando");
    localStorage.setItem("labstar-workspace-v1", JSON.stringify(nodes));
    try {
      await saveWorkspace(nodes);
      setSync("sincronizado");
      setManualSave("saved");
      setEditorOpen(false);
    } catch {
      setSync("local");
      setManualSave("error");
    }
  }

  function removeSelected() {
    if (!selected || selected.id === "labstar") return;
    const removed = new Set([selected.id]);
    let found = true;
    while (found) {
      found = false;
      nodes.forEach((node) => {
        if (node.parentId && removed.has(node.parentId) && !removed.has(node.id)) {
          removed.add(node.id);
          found = true;
        }
      });
    }
    setNodes((current) => current.filter((node) => !removed.has(node.id)));
    setSelectedId(selected.parentId ?? "labstar");
  }

  function fitMap() {
    const viewport = viewportRef.current;
    if (!viewport || nodes.length === 0) return;
    const minX = Math.min(...nodes.map((node) => node.x));
    const minY = Math.min(...nodes.map((node) => node.y));
    const maxX = Math.max(...nodes.map((node) => node.x + 274));
    const maxY = Math.max(...nodes.map((node) => node.y + 164));
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    const nextZoom = Math.max(.46, Math.min(1.05, (viewport.clientWidth - 150) / contentWidth, (viewport.clientHeight - 180) / contentHeight));
    zoomRef.current = nextZoom;
    setZoom(nextZoom);
    requestAnimationFrame(() => {
      viewport.scrollLeft = Math.max(0, (minX + contentWidth / 2) * nextZoom - viewport.clientWidth / 2);
      viewport.scrollTop = Math.max(0, (minY + contentHeight / 2) * nextZoom - viewport.clientHeight / 2);
    });
  }

  function zoomAt(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const viewport = viewportRef.current;
    if (!viewport) return;
    pendingWheelRef.current += event.deltaY;
    if (wheelFrameRef.current !== null) return;
    const clientX = event.clientX;
    const clientY = event.clientY;
    wheelFrameRef.current = window.requestAnimationFrame(() => {
      const currentZoom = zoomRef.current;
      const delta = Math.max(-52, Math.min(52, pendingWheelRef.current));
      pendingWheelRef.current = 0;
      wheelFrameRef.current = null;
      const rect = viewport.getBoundingClientRect();
      const cursorX = clientX - rect.left;
      const cursorY = clientY - rect.top;
      const pointX = (viewport.scrollLeft + cursorX) / currentZoom;
      const pointY = (viewport.scrollTop + cursorY) / currentZoom;
      const nextZoom = Math.max(.46, Math.min(1.2, currentZoom * Math.exp(-delta * .00065)));
      zoomRef.current = nextZoom;
      setZoom(nextZoom);
      viewport.scrollLeft = pointX * nextZoom - cursorX;
      viewport.scrollTop = pointY * nextZoom - cursorY;
    });
  }

  if (!introComplete) return <BrandIntro />;
  if (sessionState === "carregando") return <AccessLoading />;
  if (sessionState === "configuracao") return <ConfigurationRequired />;
  if (sessionState === "anonimo") return <AccessGate />;
  if (sessionState === "nao_convidado" && blockedIdentity) return <InviteRequired identity={blockedIdentity} />;
  if (sessionState === "pendente" && session) return <PendingAccess session={session} />;
  if (sessionState === "erro" || !session) return <AccessError />;

  return (
    <main className="app">
      <header className="header">
        <div className="brand">
          <Wordmark />
        </div>

        <div className="global-search">
          <Search size={14} />
          <input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar empresas, projetos ou áreas..." aria-label="Buscar na estrutura" />
          <kbd>⌘ K</kbd>
        </div>

        <div className="header-actions">
          <div className={`sync-state ${sync}`}>
            {sync === "carregando" && <LoaderCircle size={12} className="spin" />}
            {sync === "salvando" && <LoaderCircle size={12} className="spin" />}
            {sync === "sincronizado" && <Cloud size={12} />}
            {sync === "local" && <CloudOff size={12} />}
            <span>{sync === "sincronizado" ? "Sincronizado" : sync === "local" ? "Salvo localmente" : sync === "salvando" ? "Salvando" : "Carregando"}</span>
          </div>
          <NotificationsButton member={session.member} onOpenChannel={(channelId) => {
            setNotificationChannelId(channelId);
            setQuickPanel(null);
            setView("colaboracao");
          }} />
          <button className="icon-button" data-tooltip={sound ? "Desativar som" : "Ativar som"} onClick={() => setSound((value) => !value)} aria-label="Ativar ou desativar som">{sound ? <Volume2 size={15} /> : <VolumeX size={15} />}</button>
          <button className="create-button" onClick={() => addNode(null)}><Plus size={14} /> Criar núcleo</button>
          <button className="avatar avatar-button" onClick={() => setQuickPanel(quickPanel === "profile" ? null : "profile")} aria-label="Perfil"><Avatar name={session.member.name} url={session.member.avatarUrl} size="sm" status="online" /></button>
        </div>
      </header>

      <section className={`workspace ${view === "equipe" ? "team-workspace" : ""} ${view === "colaboracao" ? "collaboration-workspace" : ""} ${view === "mapa" && editorOpen ? "editor-open" : ""}`}>
        <nav className="rail" aria-label="Navegação principal">
          <div className="rail-group">
            <button data-tooltip="Visão geral" className={view === "visao" ? "active" : ""} onClick={() => setView("visao")} aria-label="Visão geral"><LayoutDashboard size={18} /></button>
            <button data-tooltip="Mapa" className={view === "mapa" ? "active" : ""} onClick={() => setView("mapa")} aria-label="Mapa da organização"><Network size={18} /></button>
            <button data-tooltip="Central de trabalho" className={view === "colaboracao" ? "active" : ""} onClick={() => setView("colaboracao")} aria-label="Central de trabalho"><MessagesSquare size={18} /></button>
            <button data-tooltip="Equipe" className={view === "equipe" ? "active" : ""} onClick={() => setView("equipe")} aria-label="Equipe"><Users size={18} /></button>
          </div>
          <div className="rail-bottom">
            <button data-tooltip="Ajuda" onClick={() => setQuickPanel("help")} aria-label="Ajuda"><HelpCircle size={17} /></button>
          </div>
        </nav>

        {view === "mapa" ? (
          <section className="canvas-shell">
            <div className="cosmic-effects" aria-hidden="true">
              <i className="shooting-star shooting-star-one" />
              <i className="shooting-star shooting-star-two" />
              <i className="shooting-star shooting-star-three" />
              <span className="bright-star bright-star-one" />
              <span className="bright-star bright-star-two" />
              <span className="bright-star bright-star-three" />
            </div>
            <div className="canvas-meta">
              <span><CircleDot size={11} /> {nodes.length} núcleos</span>
              <span><CheckCircle2 size={11} /> {activeCount} em andamento</span>
              {attentionNodes.length > 0 && <span className="warning"><AlertTriangle size={11} /> {attentionNodes.length} requer atenção</span>}
            </div>

            <div
              ref={viewportRef}
              className={`viewport ${panning ? "panning" : ""}`}
              onWheel={zoomAt}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                if ((event.target as HTMLElement).closest(".node-card, button, input, select, textarea")) return;
                const viewport = viewportRef.current;
                if (!viewport) return;
                event.preventDefault();
                panRef.current = { x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
                setPanning(true);
              }}
            >
              <div ref={boardRef} className="board" style={{ transform: `scale(${zoom})` }}>
                <svg className="connections" width="1750" height="980" aria-hidden="true">
                  {connections.map(({ child, parent }) => {
                    const x1 = parent.x + 137;
                    const y1 = parent.y + 82;
                    const x2 = child.x + 137;
                    const y2 = child.y + 82;
                    const middle = (x1 + x2) / 2;
                    const path = `M ${x1} ${y1} C ${middle} ${y1}, ${middle} ${y2}, ${x2} ${y2}`;
                    return (
                      <g key={child.id}>
                        <path className="connection-halo" d={path} />
                        <path d={path} style={{ stroke: kindMeta[child.kind].color }} />
                        <circle cx={x2} cy={y2} r="2.4" fill={kindMeta[child.kind].color} />
                      </g>
                    );
                  })}
                </svg>

                {nodes.map((node) => {
                  const meta = kindMeta[node.kind];
                  const status = statusMeta[node.status];
                  const NodeIcon = meta.Icon;
                  const matches = !query || `${node.name} ${node.description} ${node.owner}`.toLocaleLowerCase().includes(query);
                  const childCount = nodes.filter((candidate) => candidate.parentId === node.id).length;
                  return (
                    <article
                      key={node.id}
                      className={`node-card ${selectedId === node.id ? "selected" : ""} ${draggingId === node.id ? "dragging" : ""} ${matches ? "" : "search-muted"}`}
                      style={{ left: node.x, top: node.y, "--accent": meta.color, "--status": status.color } as React.CSSProperties}
                      onPointerDown={(event) => {
                        if (event.button !== 0) return;
                        if ((event.target as HTMLElement).closest("button, a")) return;
                        event.preventDefault();
                        event.currentTarget.setPointerCapture(event.pointerId);
                        const rect = event.currentTarget.getBoundingClientRect();
                        dragRef.current = { id: node.id, dx: (event.clientX - rect.left) / zoom, dy: (event.clientY - rect.top) / zoom };
                        setDraggingId(node.id);
                        selectNode(node.id);
                      }}
                    >
                      <div className="node-top">
                        <span className="node-symbol"><NodeIcon size={16} strokeWidth={1.55} /></span>
                        <span className="node-kind">{meta.label}</span>
                        <span className="node-actions">
                          <button data-tooltip="Editar bloco" aria-label={`Editar ${node.name}`} onClick={(event) => { event.stopPropagation(); openEditor(node.id); }}><Pencil size={13} /></button>
                          <button data-tooltip="Adicionar conexão" aria-label={`Adicionar conexão em ${node.name}`} onClick={() => addNode(node.id)}><Plus size={15} /></button>
                        </span>
                      </div>
                      <h2>{node.name}</h2>
                      <p>{node.description}</p>
                      <div className="node-status"><i />{status.label}<span>{node.progress}%</span></div>
                      <div className="progress-track"><i style={{ width: `${node.progress}%` }} /></div>
                      <footer>
                        <span className="owner-avatar">{node.owner.slice(0, 2).toUpperCase()}</span>
                        <span>{node.owner}</span>
                        <span className="node-links">
                          {node.githubUrl && <a data-tooltip="Abrir GitHub" href={externalUrl(node.githubUrl)} target="_blank" rel="noreferrer" aria-label={`Abrir GitHub de ${node.name}`}><Github size={11} /></a>}
                          {node.websiteUrl && <a data-tooltip="Abrir site" href={externalUrl(node.websiteUrl)} target="_blank" rel="noreferrer" aria-label={`Abrir site de ${node.name}`}><Globe2 size={11} /></a>}
                          {childCount > 0 && <em><Network size={10} /> {childCount}</em>}
                        </span>
                      </footer>
                    </article>
                  );
                })}
              </div>
            </div>

            <div className="zoom-controls">
              <button data-tooltip="Diminuir zoom" onClick={() => setZoom((value) => Math.max(.46, value - .035))} aria-label="Diminuir zoom"><ZoomOut size={14} /></button>
              <span>{Math.round(zoom * 100)}%</span>
              <button data-tooltip="Aumentar zoom" onClick={() => setZoom((value) => Math.min(1.2, value + .035))} aria-label="Aumentar zoom"><ZoomIn size={14} /></button>
              <i />
              <button data-tooltip="Enquadrar tudo" onClick={fitMap} aria-label="Enquadrar toda a estrutura"><Focus size={14} /></button>
            </div>
            <div className="canvas-tip">Zoom suave pela roda · Arraste o fundo para navegar · Arraste cartões para organizar</div>
          </section>
        ) : view === "visao" ? (
          <Overview
            nodes={nodes}
            activeCount={activeCount}
            attentionNodes={attentionNodes}
            completeCount={completeCount}
            averageProgress={averageProgress}
            onSelect={(id) => { setSelectedId(id); setEditorOpen(false); setView("mapa"); }}
            onOpenSummary={() => setQuickPanel("summary")}
          />
        ) : view === "colaboracao" ? (
          <CollaborationHub member={session.member} initialChannelId={notificationChannelId} soundEnabled={sound} />
        ) : (
          <TeamDirectory
            nodes={nodes}
            currentMember={session.member}
            onMemberUpdated={(member) => setSession((current) =>
              current && current.member.id === member.id ? { ...current, member } : current
            )}
          />
        )}

        {view === "mapa" && editorOpen && <aside className={`inspector ${selected ? "open" : ""}`}>
          {selected ? (
            <>
              <div className="inspector-head">
                <span className="inspector-symbol" style={{ "--accent": kindMeta[selected.kind].color } as React.CSSProperties}>
                  {(() => { const Icon = kindMeta[selected.kind].Icon; return <Icon size={18} strokeWidth={1.5} />; })()}
                </span>
                <div><small>{kindMeta[selected.kind].label}</small><strong>{selected.name}</strong></div>
                <button onClick={() => setEditorOpen(false)} aria-label="Fechar painel"><X size={16} /></button>
              </div>

              <div className="field-grid">
                <label className="full">Nome<input value={selected.name} onChange={(event) => updateSelected({ name: event.target.value })} /></label>
                <label>Tipo<select value={selected.kind} onChange={(event) => updateSelected({ kind: event.target.value as NodeKind })}>
                  {(Object.keys(kindMeta) as NodeKind[]).map((kind) => <option key={kind} value={kind}>{kindMeta[kind].label}</option>)}
                </select></label>
                <label>Prioridade<select value={selected.priority} onChange={(event) => updateSelected({ priority: event.target.value as NodePriority })}>
                  <option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option>
                </select></label>
                <label className="full">Status<select value={selected.status} onChange={(event) => updateSelected({ status: event.target.value as NodeStatus })}>
                  {(Object.keys(statusMeta) as NodeStatus[]).map((status) => <option key={status} value={status}>{statusMeta[status].label}</option>)}
                </select></label>
                <label className="full">Responsável<input value={selected.owner} onChange={(event) => updateSelected({ owner: event.target.value })} /></label>
                <label className="full">Descrição<textarea rows={3} value={selected.description} onChange={(event) => updateSelected({ description: event.target.value })} /></label>
                <div className="integration-fields">
                  <div className="integration-heading"><span><Link2 size={14} /></span><div><strong>Links e integrações</strong><small>Atalhos ficam disponíveis diretamente no cartão.</small></div></div>
                  <label className="full"><span className="field-label"><Github size={12} /> Repositório GitHub</span><input type="url" value={selected.githubUrl ?? ""} onChange={(event) => updateSelected({ githubUrl: event.target.value })} placeholder="https://github.com/empresa/repositorio" /></label>
                  <label className="full"><span className="field-label"><Globe2 size={12} /> Site ou domínio</span><input type="url" value={selected.websiteUrl ?? ""} onChange={(event) => updateSelected({ websiteUrl: event.target.value })} placeholder="https://produto.com" /></label>
                  {(selected.githubUrl || selected.websiteUrl) && (
                    <div className="integration-actions">
                      {selected.githubUrl && <a href={externalUrl(selected.githubUrl)} target="_blank" rel="noreferrer"><Github size={13} /> Abrir repositório</a>}
                      {selected.websiteUrl && <a href={externalUrl(selected.websiteUrl)} target="_blank" rel="noreferrer"><Globe2 size={13} /> Abrir site</a>}
                    </div>
                  )}
                </div>
                <label className="full progress-field"><span>Progresso <b>{selected.progress}%</b></span><input type="range" min="0" max="100" value={selected.progress} onChange={(event) => updateSelected({ progress: Number(event.target.value) })} /></label>
                <label className="full">Conectado a<select value={selected.parentId ?? ""} onChange={(event) => updateSelected({ parentId: event.target.value || null })}>
                  <option value="">Nenhum — núcleo principal</option>
                  {nodes.filter((node) => node.id !== selected.id).map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}
                </select></label>
              </div>

              <button className={`save-changes ${manualSave}`} type="button" disabled={manualSave === "saving"} onClick={() => void saveSelectedChanges()}>
                {manualSave === "saving" ? <LoaderCircle className="spin" size={14} /> : manualSave === "saved" ? <CheckCircle2 size={14} /> : <Save size={14} />}
                {manualSave === "saving" ? "Salvando no Labstar..." : manualSave === "saved" ? "Alterações salvas" : manualSave === "error" ? "Tentar salvar novamente" : "Salvar alterações"}
              </button>
              <button className="add-connection" onClick={() => addNode(selected.id)}><Plus size={14} /> Adicionar conexão</button>
              {selected.id !== "labstar" && <button className="delete-node" onClick={removeSelected}><Trash2 size={13} /> Excluir núcleo</button>}
              <div className={`save-foot ${manualSave}`}>
                {manualSave === "error" ? <CloudOff size={11} /> : <Check size={11} />}
                {manualSave === "error" ? "Não foi possível confirmar no banco" : "O botão confirma a gravação no banco"}
              </div>
            </>
          ) : (
            <div className="inspector-empty"><Network size={24} /><p>Selecione um núcleo para visualizar e editar suas informações.</p></div>
          )}
        </aside>}
      </section>
      {quickPanel && (
        <QuickPanel
          type={quickPanel}
          session={session}
          onClose={() => setQuickPanel(null)}
          onOpenTeam={() => { setQuickPanel(null); setView("equipe"); }}
          onOpenLegal={() => { setQuickPanel(null); setLegalOpen(true); }}
          onMemberUpdated={(member) => setSession((current) => current ? { ...current, member } : current)}
        />
      )}
      {legalOpen && <LegalModal anchored onClose={() => setLegalOpen(false)} />}
    </main>
  );
}

function Overview({
  nodes,
  activeCount,
  attentionNodes,
  completeCount,
  averageProgress,
  onSelect,
  onOpenSummary,
}: {
  nodes: StructureNode[];
  activeCount: number;
  attentionNodes: StructureNode[];
  completeCount: number;
  averageProgress: number;
  onSelect: (id: string) => void;
  onOpenSummary: () => void;
}) {
  const projects = nodes.filter((node) => node.kind === "projeto" || node.kind === "produto");
  return (
    <section className="overview">
      <header className="overview-head">
        <div><span className="overline">VISÃO EXECUTIVA</span><h1>Visão geral</h1><p>Acompanhe o ecossistema inteiro em um só lugar.</p></div>
        <button onClick={onOpenSummary}><Sparkles size={14} /> Resumo executivo</button>
      </header>

      <div className="metric-grid">
        <article><span><Network size={15} /> Núcleos</span><strong>{nodes.length}</strong><small><ArrowUpRight size={11} /> Estrutura ativa</small></article>
        <article><span><CircleDot size={15} /> Em andamento</span><strong>{activeCount}</strong><small className="green">Operação saudável</small></article>
        <article><span><AlertTriangle size={15} /> Atenção</span><strong>{attentionNodes.length}</strong><small className={attentionNodes.length ? "orange" : "green"}>{attentionNodes.length ? "Revisão necessária" : "Nenhum bloqueio"}</small></article>
        <article><span><CheckCircle2 size={15} /> Concluídos</span><strong>{completeCount}</strong><small>Desde o início</small></article>
      </div>

      <div className="overview-grid">
        <article className="portfolio-panel">
          <div className="panel-head"><div><strong>Portfólio ativo</strong><small>Projetos e produtos prioritários</small></div><span className="panel-icon"><Orbit size={16} /></span></div>
          <div className="portfolio-list">
            {(projects.length ? projects : nodes.slice(0, 4)).map((node) => {
              const meta = kindMeta[node.kind];
              const Icon = meta.Icon;
              return (
                <button key={node.id} onClick={() => onSelect(node.id)}>
                  <span className="portfolio-icon" style={{ "--accent": meta.color } as React.CSSProperties}><Icon size={15} /></span>
                  <span className="portfolio-name"><b>{node.name}</b><small>{node.owner}</small></span>
                  <span className="portfolio-status" style={{ "--status": statusMeta[node.status].color } as React.CSSProperties}><i />{statusMeta[node.status].label}</span>
                  <span className="portfolio-progress"><b>{node.progress}%</b><i><em style={{ width: `${node.progress}%` }} /></i></span>
                  <ArrowUpRight size={14} />
                </button>
              );
            })}
          </div>
        </article>

        <aside className="health-panel">
          <div className="panel-head"><div><strong>Saúde do ecossistema</strong><small>Progresso médio dos núcleos</small></div></div>
          <div className="health-ring" style={{ "--progress": `${averageProgress * 3.6}deg` } as React.CSSProperties}><span><strong>{averageProgress}%</strong><small>geral</small></span></div>
          <div className="health-legend">
            {(Object.keys(statusMeta) as NodeStatus[]).map((status) => <span key={status}><i style={{ background: statusMeta[status].color }} />{statusMeta[status].label}<b>{nodes.filter((node) => node.status === status).length}</b></span>)}
          </div>
        </aside>
      </div>

      {attentionNodes.length > 0 && (
        <section className="attention-panel">
          <div className="panel-head"><div><strong>Pontos de atenção</strong><small>Itens que precisam de decisão ou acompanhamento</small></div><span className="panel-icon"><ChevronDown size={15} /></span></div>
          <div className="attention-list">
            {attentionNodes.map((node) => <button key={node.id} onClick={() => onSelect(node.id)}><AlertTriangle size={14} /><span><b>{node.name}</b><small>{node.description}</small></span><em>Prioridade {node.priority}</em><ArrowUpRight size={14} /></button>)}
          </div>
        </section>
      )}
    </section>
  );
}

function TeamDirectory({ nodes, currentMember, onMemberUpdated }: { nodes: StructureNode[]; currentMember: Member; onMemberUpdated: (member: Member) => void }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [jobRoles, setJobRoles] = useState<JobRole[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [teamTab, setTeamTab] = useState<"members" | "roles">("members");
  const [invite, setInvite] = useState({ email: "", name: "", jobTitle: "", area: "", role: "member" as "admin" | "manager" | "member" | "viewer" });

  async function loadMembers() {
    setLoading(true);
    try {
      const [data, roles] = await Promise.all([listMembers(), listJobRoles()]);
      setMembers(data.members);
      setJobRoles(roles);
      setCanManage(data.canManage);
      setSelectedId((current) => current ?? data.members[0]?.id ?? null);
    } catch {
      setMessage("Não foi possível carregar a equipe");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadMembers(); }, []);

  async function patchMember(id: string, updates: Partial<Member>) {
    setMessage("Salvando alterações...");
    try {
      const updated = await updateRemoteMember(id, updates);
      setMembers((current) => current.map((member) => member.id === id ? updated : member));
      onMemberUpdated(updated);
      setMessage("Alterações salvas");
    } catch {
      setMessage("Não foi possível salvar");
    }
  }

  async function inviteMember(event: React.FormEvent) {
    event.preventDefault();
    setMessage("Autorizando e enviando o convite...");
    try {
      const result = await createMemberInvite(invite);
      setMembers((current) => [...current, result.member]);
      setSelectedId(result.member.id);
      setInvite({ email: "", name: "", jobTitle: "", area: "", role: "member" });
      setInviteOpen(false);
      setMessage(result.emailSent
        ? "Convite enviado e acesso autorizado"
        : "Acesso autorizado. O membro pode pedir o link na tela de entrada.");
    } catch (error) {
      setMessage((error as { code?: string }).code === "23505"
        ? "Este e-mail já pertence à equipe"
        : "Não foi possível adicionar");
    }
  }

  const selected = members.find((member) => member.id === selectedId) ?? null;
  const pending = members.filter((member) => member.status === "pending");
  const active = members.filter((member) => member.status === "active");
  const managers = members.filter((member) => member.role === "owner" || member.role === "admin" || member.role === "manager");
  const memberQuery = memberSearch.trim().toLocaleLowerCase();
  const visibleMembers = members.filter((member) => !memberQuery || [member.name, member.email, member.area, member.jobTitle].some((value) => value.toLocaleLowerCase().includes(memberQuery)));

  async function toggleJobRole(member: Member, role: JobRole) {
    const currentIds = member.jobRoles.map((item) => item.id);
    const roleIds = currentIds.includes(role.id) ? currentIds.filter((id) => id !== role.id) : [...currentIds, role.id];
    setMessage("Salvando cargos...");
    try {
      const assigned = await setMemberJobRoles(member.id, roleIds);
      const updated = { ...member, jobRoles: assigned, jobTitle: assigned[0]?.name ?? member.jobTitle };
      if (assigned[0]?.name && assigned[0].name !== member.jobTitle) await updateRemoteMember(member.id, { jobTitle: assigned[0].name });
      setMembers((current) => current.map((item) => item.id === member.id ? updated : item));
      onMemberUpdated(updated);
      setMessage("Cargos atualizados");
    } catch {
      setMessage("Não foi possível atualizar os cargos");
    }
  }

  if (teamTab === "roles") {
    return (
      <section className="team-page roles-page">
        <header className="team-head">
          <div><span className="overline">ADMINISTRAÇÃO / CARGOS</span><h1>Cargos e permissões</h1><p>Crie uma hierarquia profissional com cor, escudo e permissões próprias.</p></div>
        </header>
        <div className="team-section-tabs">
          <button onClick={() => setTeamTab("members")}><Users size={15} /> Membros</button>
          <button className="active" onClick={() => setTeamTab("roles")}><ShieldCheck size={15} /> Cargos</button>
        </div>
        <RoleManager />
      </section>
    );
  }

  return (
    <section className="team-page">
      <header className="team-head">
        <div><span className="overline">ADMINISTRAÇÃO / PESSOAS</span><h1>Equipe Labstar</h1><p>Gerencie quem entra, onde trabalha e o que pode acessar.</p></div>
        {canManage && <button onClick={() => setInviteOpen(true)}><UserPlus size={14} /> Autorizar membro</button>}
      </header>
      <div className="team-section-tabs">
        <button className="active" onClick={() => setTeamTab("members")}><Users size={15} /> Membros</button>
        {canManage && <button onClick={() => setTeamTab("roles")}><ShieldCheck size={15} /> Cargos</button>}
        <span>Conectado como {currentMember.name}</span>
      </div>

      <div className="team-metrics">
        <article><span><Users size={15} /> Membros ativos</span><strong>{active.length}</strong><small>Pessoas com acesso</small></article>
        <article><span><UserCheck size={15} /> Liderança</span><strong>{managers.length}</strong><small>Gestores e administradores</small></article>
        <article className={pending.length ? "needs-attention" : ""}><span><ShieldCheck size={15} /> Aprovações</span><strong>{pending.length}</strong><small>{pending.length ? "Aguardando sua decisão" : "Nenhuma pendência"}</small></article>
        <article><span><Network size={15} /> Núcleos</span><strong>{nodes.length}</strong><small>Empresas e projetos</small></article>
      </div>

      <div className="team-layout">
        <section className="member-list-panel">
          <div className="member-list-head">
            <div><strong>Diretório da empresa</strong><small>{members.length} pessoas cadastradas</small></div>
            <label className="member-search"><Search size={13} /><input value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Buscar membro" aria-label="Buscar membro da equipe" /></label>
          </div>
          {loading ? (
            <div className="team-loading"><LoaderCircle className="spin" size={20} /> Carregando equipe</div>
          ) : (
            <div className="member-list">
              {visibleMembers.map((member) => (
                <button key={member.id} className={selectedId === member.id ? "active" : ""} onClick={() => setSelectedId(member.id)}>
                  <Avatar name={member.name} url={member.avatarUrl} size="sm" />
                  <span className="member-main"><b>{member.name}</b><small>{member.email}</small></span>
                  <span className="member-area">{member.area || "Área não definida"}</span>
                  <span className={`member-state ${member.status}`}><i />{member.status === "active" ? "Ativo" : member.status === "pending" ? "Pendente" : "Suspenso"}</span>
                  <ArrowUpRight size={14} />
                </button>
              ))}
              {!visibleMembers.length && <div className="member-search-empty"><Search size={18} /><p>Nenhum membro encontrado.</p></div>}
            </div>
          )}
        </section>

        <aside className="member-editor">
          {selected ? (
            <>
              <div className="member-profile">
                <Avatar name={selected.name} url={selected.avatarUrl} size="lg" />
                <div><strong>{selected.name}</strong><small>{selected.email}</small></div>
                {selected.jobRoles[0] ? <RoleBadge role={selected.jobRoles[0]} compact /> : <span className={`role-badge ${selected.role}`}>{roleLabel(selected.role)}</span>}
              </div>

              {selected.status === "pending" && canManage && (
                <div className="approval-box"><ShieldCheck size={18} /><div><strong>Solicitação de acesso</strong><p>Confirme os dados abaixo antes de liberar esta pessoa.</p></div></div>
              )}

              <div className="member-fields">
                <label className="full">Nome completo<input value={selected.name} disabled={!canManage} onChange={(event) => setMembers((current) => current.map((member) => member.id === selected.id ? { ...member, name: event.target.value } : member))} onBlur={() => patchMember(selected.id, { name: selected.name })} placeholder="Nome profissional do membro" /></label>
                <label>Cargo<input value={selected.jobTitle} disabled={!canManage} onChange={(event) => setMembers((current) => current.map((member) => member.id === selected.id ? { ...member, jobTitle: event.target.value } : member))} onBlur={() => patchMember(selected.id, { jobTitle: selected.jobTitle })} placeholder="Ex.: Desenvolvedor de jogos" /></label>
                <label>Área<input value={selected.area} disabled={!canManage} onChange={(event) => setMembers((current) => current.map((member) => member.id === selected.id ? { ...member, area: event.target.value } : member))} onBlur={() => patchMember(selected.id, { area: selected.area })} placeholder="Ex.: Labstar Games" /></label>
                <label>Nível de acesso<select value={selected.role} disabled={!canManage || selected.role === "owner"} onChange={(event) => patchMember(selected.id, { role: event.target.value as Member["role"] })}>
                  {selected.role === "owner" && <option value="owner">Fundador</option>}
                  <option value="admin">Administrador</option><option value="manager">Gestor</option><option value="member">Membro</option><option value="viewer">Convidado somente leitura</option>
                </select></label>
              </div>

              <div className="job-role-assignment">
                <div><strong>Cargos profissionais</strong><small>O primeiro cargo na hierarquia define a cor e o escudo exibidos.</small></div>
                <div>
                  {jobRoles.map((role) => {
                    const checked = selected.jobRoles.some((item) => item.id === role.id);
                    return <label key={role.id} className={checked ? "active" : ""}><input type="checkbox" checked={checked} disabled={!canManage} onChange={() => void toggleJobRole(selected, role)} /><RoleBadge role={role} compact /></label>;
                  })}
                </div>
              </div>

              <div className="assignment-box">
                <div><strong>Núcleos atribuídos</strong><small>Escolha onde esta pessoa poderá atuar.</small></div>
                <div className="assignment-list">
                  {nodes.map((node) => {
                    const checked = selected.assignments.includes(node.id);
                    return <label key={node.id}><input type="checkbox" checked={checked} disabled={!canManage} onChange={() => {
                      const assignments = checked ? selected.assignments.filter((id) => id !== node.id) : [...selected.assignments, node.id];
                      patchMember(selected.id, { assignments });
                    }} /><span>{kindMeta[node.kind].label}</span><b>{node.name}</b></label>;
                  })}
                </div>
              </div>

              {canManage && selected.role !== "owner" && (
                <div className="member-actions">
                  {selected.status !== "active" && <button className="approve-member" onClick={() => patchMember(selected.id, { status: "active" })}><UserCheck size={14} /> Aprovar acesso</button>}
                  {selected.status === "active" && <button className="suspend-member" onClick={() => patchMember(selected.id, { status: "suspended" })}><LockKeyhole size={14} /> Suspender acesso</button>}
                </div>
              )}
              {message && <p className="team-message">{message}</p>}
            </>
          ) : <div className="member-empty"><UserCog size={24} /><p>Selecione uma pessoa para editar seu acesso.</p></div>}
        </aside>
      </div>

      {inviteOpen && (
        <div className="modal-backdrop" onMouseDown={() => setInviteOpen(false)}>
          <form className="invite-modal" onSubmit={inviteMember} onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head"><span><UserPlus size={17} /></span><div><strong>Autorizar membro</strong><small>Somente este e-mail poderá usar o cadastro.</small></div><button type="button" onClick={() => setInviteOpen(false)} aria-label="Fechar"><X size={16} /></button></div>
            <label>E-mail corporativo<input required type="email" value={invite.email} onChange={(event) => setInvite({ ...invite, email: event.target.value })} placeholder="nome@empresa.com" /></label>
            <label>Nome completo<input value={invite.name} onChange={(event) => setInvite({ ...invite, name: event.target.value })} placeholder="Nome da pessoa" /></label>
            <div className="invite-grid">
              <label>Cargo<input value={invite.jobTitle} onChange={(event) => setInvite({ ...invite, jobTitle: event.target.value })} placeholder="Cargo" /></label>
              <label>Área<input value={invite.area} onChange={(event) => setInvite({ ...invite, area: event.target.value })} placeholder="Área" /></label>
            </div>
            <label>Nível inicial<select value={invite.role} onChange={(event) => setInvite({ ...invite, role: event.target.value as typeof invite.role })}><option value="member">Membro</option><option value="manager">Gestor</option><option value="admin">Administrador</option><option value="viewer">Convidado somente leitura</option></select></label>
            <div className="invite-note"><ShieldCheck size={14} /><span>Funciona com Google Workspace, Gmail, Outlook ou qualquer domínio. O acesso depende deste convite, não do provedor.</span></div>
            <button className="invite-submit" type="submit"><ShieldCheck size={14} /> Autorizar acesso</button>
          </form>
        </div>
      )}
    </section>
  );
}

function QuickPanel({
  type,
  session,
  onClose,
  onOpenTeam,
  onOpenLegal,
  onMemberUpdated,
}: {
  type: "profile" | "help" | "summary";
  session: SessionData;
  onClose: () => void;
  onOpenTeam: () => void;
  onOpenLegal: () => void;
  onMemberUpdated: (member: Member) => void;
}) {
  const [profileName, setProfileName] = useState(session.member.name);
  const [profileState, setProfileState] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (panelRef.current?.contains(target)) return;
      if (target.closest(".avatar-button, .rail-bottom")) return;
      onClose();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  async function uploadProfilePhoto(file: File) {
    setProfileState("Enviando foto...");
    try {
      const updated = await uploadOwnAvatar(session.member.id, file);
      onMemberUpdated(updated);
      setProfileState("Foto atualizada");
    } catch {
      setProfileState("Não foi possível usar esta imagem");
    }
  }

  async function clearProfilePhoto() {
    setProfileState("Removendo foto...");
    try {
      const updated = await removeOwnAvatar(session.member.id, session.member.avatarPath);
      onMemberUpdated(updated);
      setProfileState("Foto removida — usando iniciais");
    } catch {
      setProfileState("Não foi possível remover a foto");
    }
  }

  async function saveProfileName() {
    setProfileState("Salvando nome...");
    try {
      const updated = await updateOwnProfile(session.member.id, profileName);
      onMemberUpdated(updated);
      setProfileState("Perfil salvo");
    } catch {
      setProfileState("Não foi possível salvar o perfil");
    }
  }

  return (
    <div ref={panelRef} className={`quick-panel ${type}`} role="dialog" aria-label={type === "help" ? "Central de ajuda" : type === "profile" ? "Sua conta" : "Resumo executivo"}>
      <div className="quick-head">
        <strong>{type === "profile" ? "Sua conta" : type === "help" ? "Central de ajuda" : "Resumo executivo"}</strong>
        <button onClick={onClose}><X size={14} /></button>
      </div>
      {type === "profile" && <>
        <div className="profile-card">
          <Avatar name={session.member.name} url={session.member.avatarUrl} size="lg" status="online" />
          <div><b>{session.member.name}</b><small>{session.member.email}</small></div>
        </div>
        <div className="profile-photo-actions">
          <button type="button" onClick={() => fileRef.current?.click()}><Pencil size={13} /> {session.member.avatarUrl ? "Trocar foto" : "Adicionar foto"}</button>
          {session.member.avatarPath && <button className="remove" type="button" onClick={() => void clearProfilePhoto()}><Trash2 size={13} /> Remover</button>}
          <input ref={fileRef} hidden type="file" accept="image/*" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadProfilePhoto(file);
            event.target.value = "";
          }} />
        </div>
        <label className="profile-name-field">Nome exibido<div><input value={profileName} onChange={(event) => setProfileName(event.target.value)} /><button type="button" onClick={() => void saveProfileName()}><Save size={13} /></button></div></label>
        <div className="profile-info">
          <span>Cargo<b>{session.member.jobRoles[0]?.name || session.member.jobTitle || "Não definido"}</b></span>
          <span>Acesso<b>{roleLabel(session.member.role)}</b></span>
        </div>
        {session.member.jobRoles.length > 0 && <div className="profile-role-list">{session.member.jobRoles.slice(0, 4).map((role) => <RoleBadge role={role} compact key={role.id} />)}</div>}
        {profileState && <p className="profile-state">{profileState}</p>}
        <button className="panel-action" type="button" onClick={onOpenTeam}><UserCog size={13} /> Abrir equipe e cargos</button>
        <button className="sign-out" type="button" onClick={() => void signOut()}>Sair do Labstar</button>
      </>}
      {type === "help" && <div className="help-list"><span><Network size={15} /><div><b>Organize o mapa</b><small>Arraste núcleos e use “Conectado a” para criar a hierarquia.</small></div></span><span><Github size={15} /><div><b>Conecte seus produtos</b><small>Adicione o GitHub e o domínio no painel de cada núcleo.</small></div></span><span><Users size={15} /><div><b>Gerencie a equipe</b><small>Convide pessoas e atribua empresas e projetos.</small></div></span><span><ShieldCheck size={15} /><div><b>Acesso protegido</b><small>Somente membros aprovados visualizam os dados.</small></div></span><button className="legal-panel-link" type="button" onClick={onOpenLegal}><FileText size={14} /> Termos de uso e privacidade</button></div>}
      {type === "summary" && <div className="summary-copy"><Sparkles size={20} /><p>Use a visão geral para identificar progresso, bloqueios e prioridades. O Labstar calcula automaticamente a saúde do ecossistema com base nos dados de cada núcleo.</p></div>}
    </div>
  );
}

function AccessLoading() {
  const verificationMessages = [
    "Verificando sua identidade…",
    "Localizando seu perfil autorizado…",
    "Confirmando suas permissões…",
    "Protegendo seu acesso…",
  ];
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setMessageIndex((current) => (current + 1) % verificationMessages.length);
    }, 900);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className="access-screen access-verification" aria-live="polite" aria-busy="true">
      <div className="verification-stage">
        <span className="verification-star" aria-hidden="true">
          <Star fill="currentColor" strokeWidth={1.2} />
        </span>
        <p key={messageIndex}>{verificationMessages[messageIndex]}</p>
      </div>
    </main>
  );
}

function AccessGate() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [legalOpen, setLegalOpen] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await requestMagicLink(email);
      setSent(true);
    } catch {
      setError("Não foi possível enviar o link. Confira o e-mail e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return <main className="access-screen"><section className="access-card"><Wordmark large /><span className="secure-badge"><LockKeyhole size={13} /> ACESSO PRIVADO</span><h1>{sent ? "Confira seu e-mail." : "Entre no ambiente da sua empresa."}</h1><p>{sent ? <>Enviamos um link seguro para <b>{email}</b>. Nenhuma conta externa é necessária.</> : "Digite o e-mail autorizado pelo administrador da Labstar."}</p>{sent ? <button type="button" onClick={() => setSent(false)}><Check size={15} /> Usar outro e-mail</button> : <form className="access-form" onSubmit={submit}><label htmlFor="login-email">E-mail autorizado</label><input id="login-email" required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@empresa.com" /><button type="submit" disabled={loading}>{loading ? <LoaderCircle className="spin" size={15} /> : <LogIn size={15} />} {loading ? "Enviando..." : "Receber link de acesso"}</button>{error && <span className="access-error">{error}</span>}</form>}<div className="security-note"><ShieldCheck size={14} /> Identidade e convite são verificados antes da entrada.</div><div className="access-footer"><button type="button" onClick={() => setLegalOpen(true)}>Termos de uso e privacidade</button><span>Ambiente interno Labstar</span></div></section>{legalOpen && <LegalModal onClose={() => setLegalOpen(false)} />}</main>;
}

function InviteRequired({ identity }: { identity: { email: string } }) {
  return <main className="access-screen"><section className="access-card"><Wordmark large /><span className="access-logo amber"><LockKeyhole size={21} /></span><small>ACESSO NÃO AUTORIZADO</small><h1>Este e-mail não foi convidado.</h1><p>Peça a um administrador para autorizar <b>{identity.email}</b> na equipe Labstar.</p><button className="secondary-link" type="button" onClick={() => void signOut()}>Desconectar esta conta</button><div className="security-note"><ShieldCheck size={14} /> Nenhum dado da empresa foi carregado.</div></section></main>;
}

function PendingAccess({ session }: { session: SessionData }) {
  return <main className="access-screen"><section className="access-card"><span className="access-logo amber"><LoaderCircle size={22} /></span><small>SOLICITAÇÃO RECEBIDA</small><h1>Aguardando aprovação.</h1><p>Olá, {session.member.name}. Sua conta foi identificada, mas um administrador ainda precisa definir seu cargo e área.</p><div className="pending-user"><span>{initials(session.member.name)}</span><div><b>{session.member.name}</b><small>{session.member.email}</small></div></div><button className="secondary-link" type="button" onClick={() => void signOut()}>Entrar com outra conta</button></section></main>;
}

function ConfigurationRequired() {
  return <main className="access-screen"><section className="access-card"><Wordmark large /><span className="access-logo amber"><ShieldCheck size={21} /></span><small>CONFIGURAÇÃO FINAL</small><h1>A Labstar está pronta para conectar.</h1><p>Falta adicionar a chave pública completa do Supabase antes da publicação.</p><div className="security-note"><LockKeyhole size={14} /> Nenhuma senha ou chave administrativa é necessária.</div></section></main>;
}

function AccessError() {
  return <main className="access-screen"><section className="access-card"><span className="access-logo red"><CloudOff size={20} /></span><small>CONEXÃO INDISPONÍVEL</small><h1>Não foi possível abrir o Labstar.</h1><p>Tente novamente em alguns instantes.</p><button onClick={() => window.location.reload()}><RotateCcw size={14} /> Tentar novamente</button></section></main>;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "LS";
}

function roleLabel(role: Member["role"]) {
  return role === "owner" ? "Proprietário" : role === "admin" ? "Administrador" : role === "manager" ? "Gestor" : role === "viewer" ? "Convidado" : "Membro";
}

function externalUrl(value: string) {
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function Wordmark({ large = false, animated = false }: { large?: boolean; animated?: boolean }) {
  return (
    <strong className={`wordmark ${large ? "large" : ""} ${animated ? "animated" : ""}`} aria-label="Labstar">
      <span className="word-letter" aria-hidden="true">L</span>
      <span className="word-letter transform-letter" aria-hidden="true">
        <span className="letter-a">A</span>
        <Star className="star-letter" size={large ? 28 : 17} fill="currentColor" strokeWidth={1.25} />
      </span>
      <span className="word-letter" aria-hidden="true">B</span>
      <span className="word-letter" aria-hidden="true">S</span>
      <span className="word-letter" aria-hidden="true">T</span>
      <span className="word-letter" aria-hidden="true">A</span>
      <span className="word-letter" aria-hidden="true">R</span>
    </strong>
  );
}

function BrandIntro() {
  return (
    <main className="access-screen brand-intro" aria-label="Abrindo Labstar">
      <div className="intro-mark">
        <Wordmark large animated />
        <span className="intro-progress" aria-hidden="true"><i /></span>
      </div>
    </main>
  );
}

function LegalModal({ onClose, anchored = false }: { onClose: () => void; anchored?: boolean }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className={`modal-backdrop legal-backdrop ${anchored ? "anchored" : ""}`} role="presentation" onMouseDown={onClose}>
      <section className="legal-modal" role="dialog" aria-modal="true" aria-labelledby="legal-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><span><FileText size={16} /></span><div><strong id="legal-title">Termos de uso e privacidade</strong><small>Versão de 29 de julho de 2026</small></div></div>
          <button type="button" onClick={onClose} aria-label="Fechar termos"><X size={17} /></button>
        </header>
        <div className="legal-content">
          <article><h2>1. Uso interno e autorizado</h2><p>A Labstar é um ambiente privado de organização empresarial. Cada pessoa deve usar apenas sua própria conta e acessar somente os núcleos atribuídos pela administração.</p></article>
          <article><h2>2. Confidencialidade</h2><p>Informações sobre empresas, projetos, produtos, equipe e links internos não devem ser compartilhadas fora da organização sem autorização.</p></article>
          <article><h2>3. Responsabilidade dos membros</h2><p>O usuário deve manter seu e-mail seguro, revisar as informações que publica e comunicar imediatamente qualquer acesso indevido. Administradores podem suspender contas e alterar permissões.</p></article>
          <article><h2>4. Dados e privacidade</h2><p>A Labstar armazena identificação profissional, e-mail, cargo, área, permissões e conteúdo do espaço de trabalho para operar o serviço. Os dados são processados pela infraestrutura configurada pela própria Labstar e não são vendidos.</p></article>
          <article><h2>5. Conversas, arquivos e reuniões</h2><p>Mensagens e arquivos enviados permanecem vinculados ao respectivo Espaço e às suas permissões. Áudio e vídeo das reuniões são transmitidos somente entre participantes autorizados e não são gravados pela Labstar nesta versão. Microfone e câmera só são ativados após permissão no dispositivo, e podem ser desligados a qualquer momento.</p></article>
          <article><h2>6. Segurança e controle de acesso</h2><p>O acesso é limitado a pessoas convidadas. Níveis técnicos, cargos profissionais e restrições por canal devem ser revisados pelos administradores. Atividades suspeitas, perda de acesso ao e-mail ou exposição indevida devem ser comunicadas imediatamente.</p></article>
          <article><h2>7. Retenção e encerramento</h2><p>Dados necessários à operação podem permanecer enquanto a conta ou o Espaço estiver ativo. A administração pode remover conteúdo, suspender membros ou encerrar acessos para proteger a organização, cumprir solicitações válidas ou preservar a integridade do ambiente.</p></article>
          <article><h2>8. Disponibilidade e evolução</h2><p>O produto ainda está em evolução. Recursos podem ser aprimorados, substituídos ou temporariamente interrompidos para segurança, manutenção e melhoria do serviço.</p></article>
          <article><h2>9. Administração e solicitações</h2><p>O proprietário e os administradores controlam convites, atribuições e encerramento de acessos. Solicitações de correção, acesso ou remoção de dados devem ser encaminhadas à administração responsável pela Labstar.</p></article>
        </div>
        <footer><ShieldCheck size={14} /><span>Ao entrar e usar a Labstar, o membro declara conhecer estas regras.</span><button type="button" onClick={onClose}>Entendi</button></footer>
      </section>
    </div>
  );
}

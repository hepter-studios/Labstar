import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  Github,
  Globe2,
  ImagePlus,
  Layers3,
  LoaderCircle,
  Milestone,
  Package,
  Pencil,
  RefreshCw,
  Save,
  Tag,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DeveloperMessageBody } from "./DeveloperChatContent";
import { ProjectReadmeAssetTools } from "./ProjectReadmeAssetTools";
import {
  listProjectProfiles,
  removeProjectLogo,
  saveProjectProfile,
  uploadProjectLogo,
  type ProjectProfile,
  type ProjectProfileInput,
} from "../lib/project-enrichment";
import {
  loadProjectDocument,
  projectDocumentErrorMessage,
  type ProjectDocument,
} from "../lib/project-readme";

type WorkspaceNode = {
  id: string;
  name: string;
  description: string;
  kind: string;
  status: string;
  owner: string;
  githubUrl?: string;
  websiteUrl?: string;
  progress: number;
};

type CardTarget = {
  nodeId: string;
  card: HTMLElement;
  actions: HTMLElement | null;
  symbol: HTMLElement | null;
  meta: HTMLElement;
};

type ProjectDraft = {
  githubUrl: string;
  websiteUrl: string;
  description: string;
  documentTitle: string;
  documentUrl: string;
  documentMarkdown: string;
  tags: string;
  techStack: string;
  version: string;
  dueDate: string;
  nextMilestone: string;
};

const WORKSPACE_KEY = "labstar-workspace-v1";

function readWorkspaceNodes(): WorkspaceNode[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(WORKSPACE_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const node = value as Partial<WorkspaceNode>;
      if (!node.id || !node.name) return [];
      return [{
        id: String(node.id),
        name: String(node.name),
        description: String(node.description ?? ""),
        kind: String(node.kind ?? "projeto"),
        status: String(node.status ?? "planejamento"),
        owner: String(node.owner ?? "Sem responsável"),
        githubUrl: typeof node.githubUrl === "string" ? node.githubUrl : "",
        websiteUrl: typeof node.websiteUrl === "string" ? node.websiteUrl : "",
        progress: Number(node.progress ?? 0),
      }];
    });
  } catch {
    return [];
  }
}

function blankProfile(nodeId: string): ProjectProfile {
  return {
    nodeId,
    logoPath: "",
    logoUrl: "",
    documentTitle: "README",
    documentUrl: "",
    documentMarkdown: "",
    tags: [],
    techStack: [],
    version: "",
    dueDate: "",
    nextMilestone: "",
    updatedAt: "",
    persistence: "local",
  };
}

function profileInput(profile: ProjectProfile): ProjectProfileInput {
  return {
    nodeId: profile.nodeId,
    logoPath: profile.logoPath,
    logoUrl: profile.logoUrl,
    documentTitle: profile.documentTitle,
    documentUrl: profile.documentUrl,
    documentMarkdown: profile.documentMarkdown,
    tags: profile.tags,
    techStack: profile.techStack,
    version: profile.version,
    dueDate: profile.dueDate,
    nextMilestone: profile.nextMilestone,
  };
}

function commaList(value: string) {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))].slice(0, 24);
}

function hasDocument(node: WorkspaceNode, profile: ProjectProfile) {
  return Boolean(profile.documentMarkdown.trim() || profile.documentUrl.trim() || node.githubUrl?.trim());
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    planejamento: "Planejamento",
    ativo: "Em andamento",
    atencao: "Requer atenção",
    concluido: "Concluído",
  };
  return labels[status] ?? status;
}

function dueDateLabel(value: string) {
  if (!value) return "";
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(parsed);
}

function setNativeControlValue(control: HTMLInputElement | HTMLTextAreaElement | null, value: string) {
  if (!control || control.value === value) return false;
  const prototype = control instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(control, value);
  control.dispatchEvent(new Event("input", { bubbles: true }));
  control.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function updateLegacyProjectFields(node: WorkspaceNode, draft: ProjectDraft) {
  const inspector = document.querySelector<HTMLElement>(".inspector.open, .inspector");
  if (!inspector) return false;
  const urlInputs = Array.from(inspector.querySelectorAll<HTMLInputElement>('.integration-fields input[type="url"]'));
  const description = inspector.querySelector<HTMLTextAreaElement>(".field-grid textarea");
  let changed = false;
  changed = setNativeControlValue(description, draft.description) || changed;
  changed = setNativeControlValue(urlInputs[0] ?? null, draft.githubUrl) || changed;
  changed = setNativeControlValue(urlInputs[1] ?? null, draft.websiteUrl) || changed;
  return changed || draft.description !== node.description || draft.githubUrl !== (node.githubUrl ?? "") || draft.websiteUrl !== (node.websiteUrl ?? "");
}

function sameTargets(current: CardTarget[], next: CardTarget[]) {
  return current.length === next.length && current.every((item, index) => {
    const candidate = next[index];
    return candidate
      && item.nodeId === candidate.nodeId
      && item.card === candidate.card
      && item.actions === candidate.actions
      && item.symbol === candidate.symbol
      && item.meta === candidate.meta;
  });
}

export function ProjectEnhancementsPortal() {
  const [nodes, setNodes] = useState<WorkspaceNode[]>(() => readWorkspaceNodes());
  const [profiles, setProfiles] = useState<ProjectProfile[]>([]);
  const [cards, setCards] = useState<CardTarget[]>([]);
  const [inspectorHost, setInspectorHost] = useState<HTMLElement | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [documentNodeId, setDocumentNodeId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [logoBusy, setLogoBusy] = useState<string | null>(null);
  const lastWorkspaceRef = useRef("");
  const syncTimerRef = useRef<number | null>(null);

  const profileMap = useMemo(() => new Map(profiles.map((profile) => [profile.nodeId, profile])), [profiles]);
  const nodeMap = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const selectedNode = selectedId ? nodeMap.get(selectedId) ?? null : null;
  const selectedProfile = selectedId ? profileMap.get(selectedId) ?? blankProfile(selectedId) : null;

  async function refreshProfiles() {
    try {
      setProfiles(await listProjectProfiles());
    } catch {
      setNotice("Os detalhes avançados dos projetos não puderam ser carregados agora.");
    }
  }

  useEffect(() => {
    void refreshProfiles();
  }, []);

  useEffect(() => {
    const syncWorkspace = (event: Event) => {
      const incoming = (event as CustomEvent<{ nodes?: WorkspaceNode[] }>).detail?.nodes;
      if (Array.isArray(incoming)) setNodes(incoming);
    };
    window.addEventListener("labstar:workspace-nodes-changed", syncWorkspace);
    return () => window.removeEventListener("labstar:workspace-nodes-changed", syncWorkspace);
  }, []);

  useEffect(() => {
    setExpanded(false);
    setNotice("");
  }, [selectedId]);

  useEffect(() => {
    const inspector = inspectorHost?.closest<HTMLElement>(".inspector") ?? null;
    if (!inspector) return;
    inspector.classList.toggle("project-details-expanded", expanded);
    return () => inspector.classList.remove("project-details-expanded");
  }, [expanded, inspectorHost]);

  useEffect(() => {
    cards.forEach((target) => {
      target.card.dataset.projectLogo = profileMap.get(target.nodeId)?.logoUrl ? "true" : "false";
    });
  }, [cards, profileMap]);

  useEffect(() => {
    const syncDom = () => {
      syncTimerRef.current = null;
      const workspaceRaw = window.localStorage.getItem(WORKSPACE_KEY) ?? "";
      let snapshot = nodes;
      if (workspaceRaw !== lastWorkspaceRef.current) {
        lastWorkspaceRef.current = workspaceRaw;
        snapshot = readWorkspaceNodes();
        setNodes(snapshot);
      }

      const domCards = Array.from(document.querySelectorAll<HTMLElement>(".node-card"));
      const nextTargets: CardTarget[] = [];
      domCards.forEach((card) => {
        const nodeId = card.dataset.projectNodeId;
        if (!nodeId) return;
        let meta = card.querySelector<HTMLElement>(":scope > .project-card-meta-host");
        if (!meta) {
          meta = document.createElement("div");
          meta.className = "project-card-meta-host";
          const footer = card.querySelector("footer");
          card.insertBefore(meta, footer ?? null);
        }
        nextTargets.push({
          nodeId,
          card,
          actions: card.querySelector<HTMLElement>(".node-actions"),
          symbol: card.querySelector<HTMLElement>(".node-symbol"),
          meta,
        });
      });
      setCards((current) => sameTargets(current, nextTargets) ? current : nextTargets);

      const selectedCard = domCards.find((card) => card.classList.contains("selected"));
      const nextSelectedId = selectedCard?.dataset.projectNodeId ?? null;
      setSelectedId((current) => current === nextSelectedId ? current : nextSelectedId);

      const inspector = document.querySelector<HTMLElement>(".inspector.open, .inspector");
      if (!inspector || !nextSelectedId) {
        setInspectorHost(null);
        return;
      }
      inspector.classList.add("project-inspector-enhanced");
      let host = inspector.querySelector<HTMLElement>(":scope > .project-enhancement-inspector-host");
      if (!host) {
        host = document.createElement("div");
        host.className = "project-enhancement-inspector-host";
        const fieldGrid = inspector.querySelector(".field-grid");
        inspector.insertBefore(host, fieldGrid ?? inspector.children[1] ?? null);
      }
      setInspectorHost((current) => current === host ? current : host);
    };

    const schedule = () => {
      if (syncTimerRef.current !== null) return;
      syncTimerRef.current = window.setTimeout(syncDom, 0);
    };

    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    const interval = window.setInterval(schedule, 900);
    return () => {
      observer.disconnect();
      window.clearInterval(interval);
      if (syncTimerRef.current !== null) {
        window.clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
    };
  }, []);

  async function saveAndRefresh(input: ProjectProfileInput) {
    const saved = await saveProjectProfile(input);
    setProfiles((current) => [...current.filter((item) => item.nodeId !== saved.nodeId), saved]);
    return saved;
  }

  async function uploadLogo(node: WorkspaceNode, file: File) {
    const current = profileMap.get(node.id) ?? blankProfile(node.id);
    setLogoBusy(node.id);
    setNotice("Enviando logo do projeto…");
    try {
      const uploaded = await uploadProjectLogo(node.id, file);
      const saved = await saveAndRefresh({
        ...profileInput(current),
        logoPath: uploaded.path,
        logoUrl: uploaded.url,
      });
      if (current.logoPath && current.logoPath !== uploaded.path) {
        void removeProjectLogo(current.logoPath).catch(() => undefined);
      }
      setNotice(saved.persistence === "remote" ? "Logo salvo no projeto." : "Logo salvo neste dispositivo; o banco avançado ainda está sendo ativado.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setNotice(message === "image_too_large"
        ? "A logo deve ter no máximo 5 MB."
        : message === "invalid_image"
          ? "Escolha uma imagem para usar como logo."
          : "Não foi possível enviar a logo agora.");
    } finally {
      setLogoBusy(null);
    }
  }

  async function clearLogo(node: WorkspaceNode) {
    const current = profileMap.get(node.id) ?? blankProfile(node.id);
    if (!current.logoPath && !current.logoUrl) return;
    setLogoBusy(node.id);
    try {
      if (current.logoPath) await removeProjectLogo(current.logoPath).catch(() => undefined);
      await saveAndRefresh({ ...profileInput(current), logoPath: "", logoUrl: "" });
      setNotice("Logo removida. O cartão voltou ao símbolo do tipo de núcleo.");
    } catch {
      setNotice("Não foi possível remover a logo agora.");
    } finally {
      setLogoBusy(null);
    }
  }

  async function saveDetails(node: WorkspaceNode, draft: ProjectDraft) {
    const current = profileMap.get(node.id) ?? blankProfile(node.id);
    const saved = await saveAndRefresh({
      ...profileInput(current),
      documentTitle: draft.documentTitle,
      documentUrl: draft.documentUrl,
      documentMarkdown: draft.documentMarkdown,
      tags: commaList(draft.tags),
      techStack: commaList(draft.techStack),
      version: draft.version,
      dueDate: draft.dueDate,
      nextMilestone: draft.nextMilestone,
    });

    const legacyChanged = updateLegacyProjectFields(node, draft);
    setEditingNodeId(null);
    setNotice(saved.persistence === "remote"
      ? "Detalhes do projeto salvos."
      : "Detalhes salvos localmente; a sincronização avançada do banco ainda não respondeu.");
    if (legacyChanged) {
      window.setTimeout(() => document.querySelector<HTMLButtonElement>(".inspector .save-changes")?.click(), 80);
    }
  }

  const editingNode = editingNodeId ? nodeMap.get(editingNodeId) ?? null : null;
  const editingProfile = editingNodeId ? profileMap.get(editingNodeId) ?? blankProfile(editingNodeId) : null;
  const documentNode = documentNodeId ? nodeMap.get(documentNodeId) ?? null : null;
  const documentProfile = documentNodeId ? profileMap.get(documentNodeId) ?? blankProfile(documentNodeId) : null;

  return (
    <>
      {cards.flatMap((target) => {
        const node = nodeMap.get(target.nodeId);
        if (!node) return [];
        const profile = profileMap.get(node.id) ?? blankProfile(node.id);
        const portals = [];
        if (profile.logoUrl && target.symbol) {
          portals.push(createPortal(<img className="project-node-logo" src={profile.logoUrl} alt="" />, target.symbol, `logo-${node.id}`));
        }
        if (target.actions && hasDocument(node, profile)) {
          portals.push(createPortal(
            <button
              type="button"
              className="project-card-document-button"
              data-tooltip={`Abrir ${profile.documentTitle || "README"}`}
              aria-label={`Abrir ${profile.documentTitle || "README"} de ${node.name}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                setDocumentNodeId(node.id);
              }}
            ><FileText size={13} /></button>,
            target.actions,
            `doc-${node.id}`,
          ));
        }
        const chips = [profile.version ? `v${profile.version.replace(/^v/i, "")}` : "", profile.dueDate ? dueDateLabel(profile.dueDate) : "", ...profile.tags.slice(0, 2)].filter(Boolean).slice(0, 3);
        if (chips.length) {
          portals.push(createPortal(
            <div className="project-card-meta">{chips.map((chip) => <span key={chip}>{chip}</span>)}</div>,
            target.meta,
            `meta-${node.id}`,
          ));
        }
        return portals;
      })}

      {inspectorHost && selectedNode && selectedProfile && createPortal(
        <ProjectInspectorPanel
          node={selectedNode}
          profile={selectedProfile}
          expanded={expanded}
          notice={notice}
          logoBusy={logoBusy === selectedNode.id}
          onExpanded={setExpanded}
          onOpenDocument={() => setDocumentNodeId(selectedNode.id)}
          onEdit={() => setEditingNodeId(selectedNode.id)}
          onUploadLogo={(file) => void uploadLogo(selectedNode, file)}
          onClearLogo={() => void clearLogo(selectedNode)}
        />,
        inspectorHost,
      )}

      {editingNode && editingProfile && createPortal(
        <ProjectDetailsModal
          node={editingNode}
          profile={editingProfile}
          onClose={() => setEditingNodeId(null)}
          onSave={(draft) => saveDetails(editingNode, draft)}
        />,
        document.body,
      )}

      {documentNode && documentProfile && createPortal(
        <ProjectDocumentModal
          node={documentNode}
          profile={documentProfile}
          onClose={() => setDocumentNodeId(null)}
        />,
        document.body,
      )}
    </>
  );
}

function ProjectInspectorPanel({
  node,
  profile,
  expanded,
  notice,
  logoBusy,
  onExpanded,
  onOpenDocument,
  onEdit,
  onUploadLogo,
  onClearLogo,
}: {
  node: WorkspaceNode;
  profile: ProjectProfile;
  expanded: boolean;
  notice: string;
  logoBusy: boolean;
  onExpanded: (value: boolean) => void;
  onOpenDocument: () => void;
  onEdit: () => void;
  onUploadLogo: (file: File) => void;
  onClearLogo: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const documentAvailable = hasDocument(node, profile);
  return (
    <section className="project-inspector-summary">
      <div className="project-identity-row">
        <button className="project-logo-editor" type="button" onClick={() => fileRef.current?.click()} disabled={logoBusy} title="Enviar logo do projeto">
          {logoBusy ? <LoaderCircle className="spin" size={20} /> : profile.logoUrl ? <img src={profile.logoUrl} alt="" /> : <ImagePlus size={20} />}
        </button>
        <input ref={fileRef} hidden type="file" accept="image/*" onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onUploadLogo(file);
          event.currentTarget.value = "";
        }} />
        <div>
          <small>{node.kind === "projeto" ? "PROJETO" : node.kind === "produto" ? "PRODUTO" : "NÚCLEO"}</small>
          <strong>{node.name}</strong>
          <span>{statusLabel(node.status)} · {node.progress}% · {node.owner}</span>
        </div>
        {profile.logoUrl && <button type="button" className="project-logo-remove" onClick={onClearLogo} disabled={logoBusy} title="Remover logo"><Trash2 size={13} /></button>}
      </div>

      <p className="project-objective-preview">{node.description || "Objetivo manual ainda não definido. Você pode deixar em branco quando o documento do projeto já explicar o contexto."}</p>

      {(profile.version || profile.dueDate || profile.nextMilestone) && (
        <div className="project-facts">
          {profile.version && <span><Package size={12} /><b>{profile.version}</b><small>versão</small></span>}
          {profile.dueDate && <span><CalendarDays size={12} /><b>{dueDateLabel(profile.dueDate)}</b><small>prazo</small></span>}
          {profile.nextMilestone && <span><Milestone size={12} /><b>{profile.nextMilestone}</b><small>próximo marco</small></span>}
        </div>
      )}

      {!!profile.tags.length && <div className="project-tag-row"><Tag size={12} />{profile.tags.slice(0, 6).map((tag) => <span key={tag}>{tag}</span>)}</div>}

      <div className="project-quick-links">
        {documentAvailable && <button type="button" className="primary" onClick={onOpenDocument}><FileText size={14} /> Abrir {profile.documentTitle || "README"}</button>}
        {node.githubUrl && <a href={node.githubUrl} target="_blank" rel="noreferrer"><Github size={14} /> GitHub</a>}
        {node.websiteUrl && <a href={node.websiteUrl} target="_blank" rel="noreferrer"><Globe2 size={14} /> Site</a>}
      </div>

      <div className="project-inspector-actions">
        <button type="button" onClick={onEdit}><Pencil size={13} /> Detalhes do projeto</button>
        <button type="button" onClick={() => onExpanded(!expanded)}>{expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />} {expanded ? "Ocultar campos completos" : "Ver todos os campos"}</button>
      </div>
      {notice && <p className="project-inspector-notice">{notice}</p>}
    </section>
  );
}

function ProjectDetailsModal({ node, profile, onClose, onSave }: {
  node: WorkspaceNode;
  profile: ProjectProfile;
  onClose: () => void;
  onSave: (draft: ProjectDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState<ProjectDraft>({
    githubUrl: node.githubUrl ?? "",
    websiteUrl: node.websiteUrl ?? "",
    description: node.description,
    documentTitle: profile.documentTitle || "README",
    documentUrl: profile.documentUrl,
    documentMarkdown: profile.documentMarkdown,
    tags: profile.tags.join(", "),
    techStack: profile.techStack.join(", "),
    version: profile.version,
    dueDate: profile.dueDate,
    nextMilestone: profile.nextMilestone,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const markdownRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && !saving && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose, saving]);

  function update<K extends keyof ProjectDraft>(key: K, value: ProjectDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await onSave(draft);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "";
      setError(/42501|permission|denied/i.test(message)
        ? "Sua conta não tem permissão para alterar estes detalhes do projeto."
        : "Não foi possível salvar os detalhes agora.");
      setSaving(false);
    }
  }

  return (
    <div className="project-modal-backdrop" onMouseDown={() => !saving && onClose()}>
      <section className="project-details-modal" role="dialog" aria-modal="true" aria-label={`Detalhes de ${node.name}`} onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><span><Layers3 size={17} /></span><div><small>PROJETO COMPLETO</small><strong>{node.name}</strong><p>README, identidade, prazo e contexto técnico sem poluir o cartão.</p></div></div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Fechar"><X size={17} /></button>
        </header>

        <div className="project-details-scroll">
          <section>
            <h3>Contexto</h3>
            <label className="full">Objetivo / descrição manual <textarea rows={3} value={draft.description} onChange={(event) => update("description", event.target.value)} placeholder="Opcional: use quando o projeto não tiver README ou quando quiser um resumo curto." /></label>
            <div className="project-two-columns">
              <label>Versão<input value={draft.version} onChange={(event) => update("version", event.target.value)} placeholder="1.0.0" /></label>
              <label>Prazo<input type="date" value={draft.dueDate} onChange={(event) => update("dueDate", event.target.value)} /></label>
            </div>
            <label className="full">Próximo marco<input value={draft.nextMilestone} onChange={(event) => update("nextMilestone", event.target.value)} placeholder="Ex.: Beta fechado, lançamento mobile…" /></label>
            <label className="full">Tags<input value={draft.tags} onChange={(event) => update("tags", event.target.value)} placeholder="IA, mobile, prioridade, pesquisa" /><small>Separe por vírgulas.</small></label>
            <label className="full">Tecnologias<input value={draft.techStack} onChange={(event) => update("techStack", event.target.value)} placeholder="Rust, Tauri, React, PostgreSQL" /><small>Separe por vírgulas.</small></label>
          </section>

          <section>
            <h3>Links oficiais</h3>
            <label className="full"><span><Github size={13} /> Repositório GitHub</span><input type="url" value={draft.githubUrl} onChange={(event) => update("githubUrl", event.target.value)} placeholder="https://github.com/empresa/projeto" /></label>
            <label className="full"><span><Globe2 size={13} /> Site / domínio</span><input type="url" value={draft.websiteUrl} onChange={(event) => update("websiteUrl", event.target.value)} placeholder="https://projeto.com" /></label>
          </section>

          <section>
            <h3>Documento do projeto</h3>
            <p className="project-section-help">Sem conteúdo manual ou URL específica, o Labstar tenta buscar automaticamente o README do repositório GitHub.</p>
            <label className="full">Nome exibido<input value={draft.documentTitle} onChange={(event) => update("documentTitle", event.target.value)} placeholder="README, Visão técnica, Briefing…" /></label>
            <label className="full">URL específica do documento <input type="url" value={draft.documentUrl} onChange={(event) => update("documentUrl", event.target.value)} placeholder="Opcional: GitHub blob/raw ou outro Markdown acessível" /></label>
            <div className="project-readme-editor">
              <label className="full">Conteúdo manual em Markdown <textarea ref={markdownRef} className="project-markdown-input" rows={10} value={draft.documentMarkdown} onChange={(event) => update("documentMarkdown", event.target.value)} placeholder="# Projeto\n\nUse isto quando não houver GitHub ou quando quiser um documento próprio no Labstar." /><small>Opcional. Se preenchido, este conteúdo tem prioridade sobre GitHub e URL.</small></label>
              <ProjectReadmeAssetTools nodeId={node.id} value={draft.documentMarkdown} onChange={(value) => update("documentMarkdown", value)} textareaRef={markdownRef} />
              <div className="project-readme-live-preview" aria-live="polite">
                <div className="project-readme-live-preview-head"><strong>Prévia imediata</strong><span>Markdown, imagens e arquivos</span></div>
                <div className="project-readme-live-preview-body">
                  {draft.documentMarkdown.trim()
                    ? <DeveloperMessageBody body={draft.documentMarkdown} />
                    : <p>Comece a escrever ou insira um arquivo para visualizar o README.</p>}
                </div>
              </div>
            </div>
          </section>
        </div>

        <footer>
          <span>{error || "As informações extras ficam separadas do mapa para manter o editor limpo."}</span>
          <div><button type="button" onClick={onClose} disabled={saving}>Cancelar</button><button type="button" className="primary" onClick={() => void save()} disabled={saving}>{saving ? <LoaderCircle className="spin" size={14} /> : <Save size={14} />} {saving ? "Salvando…" : "Salvar projeto"}</button></div>
        </footer>
      </section>
    </div>
  );
}

function ProjectDocumentModal({ node, profile, onClose }: {
  node: WorkspaceNode;
  profile: ProjectProfile;
  onClose: () => void;
}) {
  const [document, setDocument] = useState<ProjectDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const loadKey = `${node.id}:${node.githubUrl ?? ""}:${profile.documentUrl}:${profile.documentMarkdown}`;

  async function load() {
    setLoading(true);
    setError("");
    try {
      setDocument(await loadProjectDocument({
        githubUrl: node.githubUrl,
        documentUrl: profile.documentUrl,
        documentMarkdown: profile.documentMarkdown,
      }));
    } catch (reason) {
      setDocument(null);
      setError(projectDocumentErrorMessage(reason));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [loadKey]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  return (
    <div className="project-modal-backdrop document" onMouseDown={onClose}>
      <section className="project-document-modal" role="dialog" aria-modal="true" aria-label={`${profile.documentTitle || "README"} de ${node.name}`} onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div className="project-document-title">
            <span>{profile.logoUrl ? <img src={profile.logoUrl} alt="" /> : <FileText size={20} />}</span>
            <div><small>{node.name.toUpperCase()}</small><strong>{profile.documentTitle || "README"}</strong><p>{document?.sourceLabel || "Documento do projeto"}</p></div>
          </div>
          <div className="project-document-actions">
            <button type="button" onClick={() => void load()} title="Atualizar documento"><RefreshCw size={15} /></button>
            {document?.sourceUrl && <a href={document.sourceUrl} target="_blank" rel="noreferrer" title="Abrir fonte"><ExternalLink size={15} /></a>}
            <button type="button" onClick={onClose} aria-label="Fechar"><X size={17} /></button>
          </div>
        </header>

        <div className="project-document-content">
          {loading ? <div className="project-document-state"><LoaderCircle className="spin" size={24} /><strong>Carregando {profile.documentTitle || "README"}</strong><span>Buscando a versão mais recente do documento…</span></div>
            : error ? <div className="project-document-state error"><FileText size={24} /><strong>Documento indisponível</strong><span>{error}</span>{node.githubUrl && <a href={node.githubUrl} target="_blank" rel="noreferrer"><Github size={14} /> Abrir repositório</a>}</div>
              : document ? <DeveloperMessageBody body={document.content} /> : null}
        </div>
      </section>
    </div>
  );
}

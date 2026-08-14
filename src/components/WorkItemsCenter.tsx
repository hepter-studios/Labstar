import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Check,
  CheckCircle2,
  CircleDot,
  ClipboardList,
  Clock3,
  Gavel,
  LoaderCircle,
  Plus,
  RefreshCw,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  getCurrentIdentity,
  listMembers,
  loadCollaboration,
  type CollaborationSpace,
  type LabstarChannel,
  type Member,
} from "../lib/supabase";
import {
  createWorkItem,
  deleteWorkItem,
  listWorkItems,
  updateWorkItem,
  type WorkItem,
  type WorkItemKind,
  type WorkItemPriority,
  type WorkItemStatus,
} from "../lib/work-items";

type Filter = "mine" | "open" | "decisions" | "done";

type CenterData = {
  items: WorkItem[];
  members: Member[];
  channels: LabstarChannel[];
  spaces: CollaborationSpace[];
  currentMemberId: string;
};

const EMPTY_DATA: CenterData = {
  items: [],
  members: [],
  channels: [],
  spaces: [],
  currentMemberId: "",
};

const priorityLabel: Record<WorkItemPriority, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
};

const statusLabel: Record<WorkItemStatus, string> = {
  open: "Aberta",
  in_progress: "Em andamento",
  blocked: "Bloqueada",
  done: "Concluída",
};

const kindLabel: Record<WorkItemKind, string> = {
  task: "Tarefa",
  decision: "Decisão",
  follow_up: "Acompanhamento",
};

function formatDue(value: string | null) {
  if (!value) return "Sem prazo";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Prazo inválido";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function dueState(value: string | null, status: WorkItemStatus) {
  if (!value || status === "done") return "";
  const diff = new Date(value).getTime() - Date.now();
  if (diff < 0) return "overdue";
  if (diff < 24 * 60 * 60 * 1000) return "soon";
  return "";
}

function openChannel(channelId: string | null) {
  if (!channelId) return;
  window.dispatchEvent(new CustomEvent("labstar:open-channel", { detail: { channelId } }));
}

export function WorkItemsCenter() {
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [data, setData] = useState<CenterData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("mine");
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({
    title: "",
    details: "",
    kind: "task" as WorkItemKind,
    priority: "medium" as WorkItemPriority,
    assigneeId: "",
    channelId: "",
    dueAt: "",
  });

  const refresh = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const [itemsResult, membersResult, collaborationResult, identityResult] = await Promise.allSettled([
        listWorkItems(),
        listMembers(),
        loadCollaboration(),
        getCurrentIdentity(),
      ]);
      const collaboration = collaborationResult.status === "fulfilled"
        ? collaborationResult.value
        : { spaces: [], categories: [], channels: [] };
      setData({
        items: itemsResult.status === "fulfilled" ? itemsResult.value : [],
        members: membersResult.status === "fulfilled" ? membersResult.value.members : [],
        channels: collaboration.channels,
        spaces: collaboration.spaces,
        currentMemberId: identityResult.status === "fulfilled" ? identityResult.value?.member?.id ?? "" : "",
      });
      if (itemsResult.status === "rejected") {
        setNotice("Não foi possível carregar tarefas e decisões agora.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const changed = () => void refresh(true);
    window.addEventListener("labstar:work-items-changed", changed);
    const interval = window.setInterval(changed, 45_000);
    return () => {
      window.removeEventListener("labstar:work-items-changed", changed);
      window.clearInterval(interval);
    };
  }, [refresh]);

  useEffect(() => {
    const syncMount = () => {
      const home = document.querySelector<HTMLElement>(".work-home");
      if (!home) {
        setMount(null);
        return;
      }
      let target = home.querySelector<HTMLElement>("[data-labstar-work-items]");
      if (!target) {
        target = document.createElement("div");
        target.dataset.labstarWorkItems = "true";
        const metrics = home.querySelector(".work-home-metrics");
        metrics?.insertAdjacentElement("afterend", target);
      }
      setMount(target);
    };
    syncMount();
    const observer = new MutationObserver(syncMount);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const memberById = useMemo(() => new Map(data.members.map((member) => [member.id, member])), [data.members]);
  const channelById = useMemo(() => new Map(data.channels.map((channel) => [channel.id, channel])), [data.channels]);
  const spaceById = useMemo(() => new Map(data.spaces.map((space) => [space.id, space])), [data.spaces]);
  const openItems = data.items.filter((item) => item.status !== "done");
  const mineItems = openItems.filter((item) => !item.assigneeId || item.assigneeId === data.currentMemberId);
  const overdue = openItems.filter((item) => item.dueAt && new Date(item.dueAt).getTime() < Date.now());
  const decisions = data.items.filter((item) => item.kind === "decision" && item.status !== "done");

  const visibleItems = useMemo(() => {
    if (filter === "mine") return data.items.filter((item) => item.status !== "done" && (!item.assigneeId || item.assigneeId === data.currentMemberId));
    if (filter === "open") return data.items.filter((item) => item.status !== "done");
    if (filter === "decisions") return data.items.filter((item) => item.kind === "decision" && item.status !== "done");
    return data.items.filter((item) => item.status === "done").slice(0, 20);
  }, [data.currentMemberId, data.items, filter]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.title.trim() || !data.currentMemberId) return;
    const channel = data.channels.find((item) => item.id === form.channelId);
    setSaving(true);
    setNotice("");
    try {
      await createWorkItem({
        title: form.title,
        details: form.details,
        kind: form.kind,
        priority: form.priority,
        assigneeId: form.assigneeId || null,
        channelId: form.channelId || null,
        spaceId: channel?.spaceId ?? null,
        createdBy: data.currentMemberId,
        dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
      });
      setForm({ title: "", details: "", kind: "task", priority: "medium", assigneeId: "", channelId: "", dueAt: "" });
      setCreateOpen(false);
      setNotice("Item criado e sincronizado para toda a equipe.");
      await refresh(true);
    } catch {
      setNotice("Não foi possível criar o item agora.");
    } finally {
      setSaving(false);
    }
  }

  async function patch(id: string, values: Partial<WorkItem>) {
    setNotice("");
    try {
      await updateWorkItem(id, values);
      await refresh(true);
    } catch {
      setNotice("Não foi possível atualizar o item.");
    }
  }

  async function remove(id: string) {
    setNotice("");
    try {
      await deleteWorkItem(id);
      await refresh(true);
    } catch {
      setNotice("Não foi possível remover o item.");
    }
  }

  if (!mount) return null;

  return createPortal(
    <section className="work-items-center">
      <header className="work-items-head">
        <div>
          <span><ClipboardList size={16} /></span>
          <div><strong>Tarefas, decisões e acompanhamentos</strong><small>Trabalho que não pode se perder no meio das mensagens.</small></div>
        </div>
        <div>
          <button type="button" className="icon" onClick={() => void refresh(true)} aria-label="Atualizar tarefas"><RefreshCw size={14} className={refreshing ? "spin" : ""} /></button>
          <button type="button" onClick={() => setCreateOpen(true)}><Plus size={14} /> Novo item</button>
        </div>
      </header>

      <div className="work-items-summary" data-labstar-liquid-group>
        <button type="button" className={filter === "mine" ? "active" : ""} onClick={() => setFilter("mine")}><UserRound size={14} /><span>Para mim</span><b>{mineItems.length}</b></button>
        <button type="button" className={filter === "open" ? "active" : ""} onClick={() => setFilter("open")}><CircleDot size={14} /><span>Em aberto</span><b>{openItems.length}</b></button>
        <button type="button" className={`${filter === "decisions" ? "active" : ""} ${decisions.length ? "attention" : ""}`} onClick={() => setFilter("decisions")}><Gavel size={14} /><span>Decisões</span><b>{decisions.length}</b></button>
        <button type="button" className={overdue.length ? "danger" : ""} onClick={() => setFilter("open")}><AlertTriangle size={14} /><span>Atrasadas</span><b>{overdue.length}</b></button>
        <button type="button" className={filter === "done" ? "active" : ""} onClick={() => setFilter("done")}><CheckCircle2 size={14} /><span>Concluídas</span><b>{data.items.filter((item) => item.status === "done").length}</b></button>
      </div>

      <div className="work-items-list">
        {loading ? <div className="work-items-empty"><LoaderCircle className="spin" size={19} /><span>Carregando trabalho…</span></div> : visibleItems.map((item) => {
          const assignee = item.assigneeId ? memberById.get(item.assigneeId) : null;
          const channel = item.channelId ? channelById.get(item.channelId) : null;
          const space = item.spaceId ? spaceById.get(item.spaceId) : null;
          const dueClass = dueState(item.dueAt, item.status);
          return (
            <article key={item.id} className={`work-item ${item.status} priority-${item.priority}`}>
              <button type="button" className="work-item-check" onClick={() => void patch(item.id, { status: item.status === "done" ? "open" : "done" })} aria-label={item.status === "done" ? "Reabrir" : "Concluir"}>{item.status === "done" ? <Check size={14} /> : <span />}</button>
              <div className="work-item-main">
                <div className="work-item-title"><span className={`kind ${item.kind}`}>{kindLabel[item.kind]}</span><strong>{item.title}</strong><span className={`priority ${item.priority}`}>{priorityLabel[item.priority]}</span></div>
                {item.details && <p>{item.details}</p>}
                <div className="work-item-meta">
                  <span className={`status ${item.status}`}><i />{statusLabel[item.status]}</span>
                  <span className={dueClass}><CalendarClock size={12} /> {formatDue(item.dueAt)}</span>
                  <span><UserRound size={12} /> {assignee?.name ?? "Sem responsável"}</span>
                  {channel && <button type="button" onClick={() => openChannel(channel.id)}>#{channel.name}{space ? ` · ${space.name}` : ""}<ArrowRight size={11} /></button>}
                </div>
              </div>
              <div className="work-item-actions">
                {item.status !== "done" && item.status !== "in_progress" && <button type="button" onClick={() => void patch(item.id, { status: "in_progress" })} title="Iniciar"><Clock3 size={14} /></button>}
                {item.status !== "done" && item.status !== "blocked" && <button type="button" onClick={() => void patch(item.id, { status: "blocked" })} title="Bloquear"><AlertTriangle size={14} /></button>}
                <button type="button" className="remove" onClick={() => void remove(item.id)} title="Remover"><Trash2 size={14} /></button>
              </div>
            </article>
          );
        })}
        {!loading && !visibleItems.length && <div className="work-items-empty"><CheckCircle2 size={21} /><strong>Nenhum item nesta visão</strong><span>Crie uma tarefa, decisão ou acompanhamento para manter o trabalho visível.</span></div>}
      </div>

      {notice && <p className="work-items-notice">{notice}</p>}

      {createOpen && <div className="work-item-modal-backdrop" onMouseDown={() => setCreateOpen(false)}>
        <form className="work-item-modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
          <header><div><ClipboardList size={18} /><span><strong>Novo item de trabalho</strong><small>Sincronizado entre Web e aplicativo desktop.</small></span></div><button type="button" onClick={() => setCreateOpen(false)}><X size={16} /></button></header>
          <label className="full">Título<input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="O que precisa acontecer ou ser decidido?" required /></label>
          <label className="full">Contexto<textarea value={form.details} onChange={(event) => setForm((current) => ({ ...current, details: event.target.value }))} rows={4} placeholder="Detalhes, resultado esperado ou motivo da decisão." /></label>
          <label>Tipo<select value={form.kind} onChange={(event) => setForm((current) => ({ ...current, kind: event.target.value as WorkItemKind }))}><option value="task">Tarefa</option><option value="decision">Decisão</option><option value="follow_up">Acompanhamento</option></select></label>
          <label>Prioridade<select value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value as WorkItemPriority }))}><option value="low">Baixa</option><option value="medium">Média</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></label>
          <label>Responsável<select value={form.assigneeId} onChange={(event) => setForm((current) => ({ ...current, assigneeId: event.target.value }))}><option value="">Sem responsável</option>{data.members.filter((member) => member.status === "active").map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
          <label>Prazo<input type="datetime-local" value={form.dueAt} onChange={(event) => setForm((current) => ({ ...current, dueAt: event.target.value }))} /></label>
          <label className="full">Canal relacionado<select value={form.channelId} onChange={(event) => setForm((current) => ({ ...current, channelId: event.target.value }))}><option value="">Nenhum canal</option>{data.channels.filter((channel) => channel.type !== "voice").map((channel) => <option key={channel.id} value={channel.id}>#{channel.name} · {spaceById.get(channel.spaceId)?.name ?? "Labstar"}</option>)}</select></label>
          <footer><button type="button" onClick={() => setCreateOpen(false)}>Cancelar</button><button type="submit" disabled={saving || !form.title.trim()}>{saving ? <LoaderCircle className="spin" size={14} /> : <Plus size={14} />}{saving ? "Criando…" : "Criar item"}</button></footer>
        </form>
      </div>}
    </section>,
    mount,
  );
}

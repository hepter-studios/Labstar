import { CalendarClock, Gavel, ListTodo, LoaderCircle, MessageSquareText, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
  type WorkItemKind,
  type WorkItemPriority,
} from "../lib/work-items";

type MessageMount = {
  element: HTMLElement;
  id: string;
};

type MessageContext = {
  messageId: string;
  body: string;
  author: string;
  channelName: string;
  spaceName: string;
};

type BridgeData = {
  member: Member | null;
  members: Member[];
  channels: LabstarChannel[];
  spaces: CollaborationSpace[];
};

const EMPTY_DATA: BridgeData = {
  member: null,
  members: [],
  channels: [],
  spaces: [],
};

function readContext(element: HTMLElement): MessageContext | null {
  const article = element.closest<HTMLElement>(".chat-message");
  if (!article) return null;
  const header = article.querySelector<HTMLElement>('.message-body header[id^="message-"]');
  const body = article.querySelector<HTMLElement>(".message-body > p")?.textContent?.trim() ?? "";
  const author = header?.querySelector<HTMLElement>("strong")?.textContent?.trim() ?? "Membro";
  const channelName = document.querySelector<HTMLElement>(".channel-heading strong")?.textContent?.trim() ?? "";
  const spaceName = document.querySelector<HTMLElement>(".space-title strong")?.textContent?.trim() ?? "";
  const messageId = header?.id.replace(/^message-/, "") ?? "";
  if (!messageId || !body) return null;
  return { messageId, body, author, channelName, spaceName };
}

function compactTitle(value: string) {
  const firstLine = value.split(/\r?\n/).find((line) => line.trim())?.trim() ?? value.trim();
  return firstLine.length > 96 ? `${firstLine.slice(0, 93)}…` : firstLine;
}

export function MessageWorkItemBridge() {
  const [mounts, setMounts] = useState<MessageMount[]>([]);
  const [data, setData] = useState<BridgeData>(EMPTY_DATA);
  const [context, setContext] = useState<MessageContext | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({
    title: "",
    details: "",
    kind: "task" as WorkItemKind,
    priority: "medium" as WorkItemPriority,
    assigneeId: "",
    dueAt: "",
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [identityResult, membersResult, collaborationResult] = await Promise.allSettled([
        getCurrentIdentity(),
        listMembers(),
        loadCollaboration(),
      ]);
      if (cancelled) return;
      const collaboration = collaborationResult.status === "fulfilled"
        ? collaborationResult.value
        : { spaces: [], categories: [], channels: [] };
      setData({
        member: identityResult.status === "fulfilled" ? identityResult.value?.member ?? null : null,
        members: membersResult.status === "fulfilled" ? membersResult.value.members : [],
        channels: collaboration.channels,
        spaces: collaboration.spaces,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const sync = () => {
      for (const article of document.querySelectorAll<HTMLElement>(".chat-message")) {
        const actions = article.querySelector<HTMLElement>(".message-actions");
        if (!actions || actions.querySelector("[data-labstar-message-work]")) continue;
        const mount = document.createElement("span");
        mount.dataset.labstarMessageWork = "true";
        actions.prepend(mount);
      }
      const next = Array.from(document.querySelectorAll<HTMLElement>("[data-labstar-message-work]"))
        .map((element, index) => ({ element, id: element.closest<HTMLElement>(".chat-message")?.querySelector<HTMLElement>('[id^="message-"]')?.id ?? `message-work-${index}` }));
      setMounts((current) => {
        if (current.length === next.length && current.every((item, index) => item.element === next[index]?.element)) return current;
        return next;
      });
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!context) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) setContext(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [context, saving]);

  const activeMembers = useMemo(() => data.members.filter((member) => member.status === "active"), [data.members]);

  function open(element: HTMLElement) {
    const next = readContext(element);
    if (!next) {
      setNotice("Esta mensagem não possui texto para transformar em trabalho.");
      return;
    }
    setContext(next);
    setForm({
      title: compactTitle(next.body),
      details: `Criado a partir de uma mensagem de ${next.author} em #${next.channelName}.\n\n${next.body}`,
      kind: "task",
      priority: "medium",
      assigneeId: "",
      dueAt: "",
    });
    setNotice("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!context || !data.member || !form.title.trim()) return;
    const space = data.spaces.find((item) => item.name === context.spaceName) ?? null;
    const channel = data.channels.find((item) => item.name === context.channelName && (!space || item.spaceId === space.id))
      ?? data.channels.find((item) => item.name === context.channelName)
      ?? null;
    setSaving(true);
    setNotice("");
    try {
      await createWorkItem({
        title: form.title,
        details: `${form.details.trim()}\n\nMensagem de origem: ${context.messageId}`,
        kind: form.kind,
        priority: form.priority,
        assigneeId: form.assigneeId || null,
        channelId: channel?.id ?? null,
        spaceId: channel?.spaceId ?? space?.id ?? null,
        createdBy: data.member.id,
        dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
      });
      setContext(null);
      setNotice(form.kind === "decision" ? "Decisão registrada no Dashboard." : "Item criado no Dashboard.");
      window.setTimeout(() => setNotice(""), 3200);
    } catch {
      setNotice("Não foi possível criar o item agora.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {mounts.map((mount) => createPortal(
        <button
          type="button"
          className="message-to-work-button"
          title="Transformar em tarefa ou decisão"
          aria-label="Transformar mensagem em tarefa ou decisão"
          onClick={() => open(mount.element)}
        >
          <ListTodo size={14} />
        </button>,
        mount.element,
        mount.id,
      ))}

      {notice && createPortal(<div className="message-work-toast">{notice}</div>, document.body)}

      {context && createPortal(
        <div className="message-work-backdrop" onMouseDown={() => !saving && setContext(null)}>
          <form className="message-work-modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div><span><MessageSquareText size={18} /></span><div><strong>Transformar mensagem em trabalho</strong><small>O item ficará no Dashboard e continuará ligado ao canal.</small></div></div>
              <button type="button" onClick={() => setContext(null)} disabled={saving} aria-label="Fechar"><X size={16} /></button>
            </header>

            <div className="message-work-origin">
              <b>{context.author}</b>
              <span>#{context.channelName} · {context.spaceName}</span>
              <p>{context.body}</p>
            </div>

            <label className="full">Título<input required value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></label>
            <label className="full">Contexto<textarea rows={4} value={form.details} onChange={(event) => setForm((current) => ({ ...current, details: event.target.value }))} /></label>
            <div className="message-work-grid">
              <label>Tipo<select value={form.kind} onChange={(event) => setForm((current) => ({ ...current, kind: event.target.value as WorkItemKind }))}><option value="task">Tarefa</option><option value="decision">Decisão</option><option value="follow_up">Acompanhamento</option></select></label>
              <label>Prioridade<select value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value as WorkItemPriority }))}><option value="low">Baixa</option><option value="medium">Média</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></label>
              <label>Responsável<select value={form.assigneeId} onChange={(event) => setForm((current) => ({ ...current, assigneeId: event.target.value }))}><option value="">Sem responsável</option>{activeMembers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
              <label>Prazo<input type="datetime-local" value={form.dueAt} onChange={(event) => setForm((current) => ({ ...current, dueAt: event.target.value }))} /></label>
            </div>

            <footer>
              <button type="button" onClick={() => setContext(null)} disabled={saving}>Cancelar</button>
              <button type="submit" className="primary" disabled={saving || !data.member || !form.title.trim()}>
                {saving ? <LoaderCircle className="spin" size={15} /> : form.kind === "decision" ? <Gavel size={15} /> : <CalendarClock size={15} />}
                {saving ? "Criando…" : form.kind === "decision" ? "Registrar decisão" : "Criar item"}
              </button>
            </footer>
          </form>
        </div>,
        document.body,
      )}
    </>
  );
}

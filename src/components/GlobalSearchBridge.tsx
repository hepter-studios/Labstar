import { ArrowRight, Bell, File, Hash, LoaderCircle, MessageSquare, Network, Search, UserRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  listMembers,
  listMessages,
  loadCollaboration,
  type ChannelMessage,
  type LabstarChannel,
  type Member,
} from "../lib/supabase";

type NodeRecord = {
  id: string;
  name: string;
  description: string;
  kind: string;
  owner: string;
  status: string;
  priority: string;
};

type SearchKind = "node" | "space" | "channel" | "member" | "message" | "file";

type SearchItem = {
  id: string;
  kind: SearchKind;
  title: string;
  subtitle: string;
  text: string;
  channelId?: string;
  memberName?: string;
  queryHint?: string;
};

const KIND_LABEL: Record<SearchKind, string> = {
  node: "Núcleo",
  space: "Espaço",
  channel: "Canal",
  member: "Pessoa",
  message: "Mensagem",
  file: "Arquivo",
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
}

function readNodes(): NodeRecord[] {
  try {
    const parsed = JSON.parse(localStorage.getItem("labstar-workspace-v1") ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((value) => {
      const row = value as Record<string, unknown>;
      return {
        id: String(row.id ?? ""),
        name: String(row.name ?? "Sem nome"),
        description: String(row.description ?? ""),
        kind: String(row.kind ?? "núcleo"),
        owner: String(row.owner ?? "Sem responsável"),
        status: String(row.status ?? "planejamento"),
        priority: String(row.priority ?? "media"),
      };
    }).filter((node) => node.id);
  } catch {
    return [];
  }
}

function setNativeValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function clickView(label: string) {
  document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)?.click();
}

function icon(kind: SearchKind) {
  if (kind === "node" || kind === "space") return <Network size={15} />;
  if (kind === "channel") return <Hash size={15} />;
  if (kind === "member") return <UserRound size={15} />;
  if (kind === "message") return <MessageSquare size={15} />;
  return <File size={15} />;
}

function channelLabel(channel: LabstarChannel) {
  return channel.type === "voice" ? "Sala de voz" : channel.type === "social" ? "Planejamento social" : "Canal";
}

function score(item: SearchItem, query: string) {
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return 1;
  const title = normalize(item.title);
  const subtitle = normalize(item.subtitle);
  const text = normalize(item.text);
  let total = 0;
  for (const term of terms) {
    if (title === term) total += 120;
    else if (title.startsWith(term)) total += 85;
    else if (title.includes(term)) total += 60;
    if (subtitle.includes(term)) total += 28;
    if (text.includes(term)) total += 14;
  }
  return total;
}

export function GlobalSearchBridge() {
  const [items, setItems] = useState<SearchItem[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const loadedAtRef = useRef(0);
  const loadingRef = useRef<Promise<void> | null>(null);

  const loadIndex = useCallback(async (force = false) => {
    if (!force && Date.now() - loadedAtRef.current < 45_000) return;
    if (loadingRef.current) return loadingRef.current;
    const task = (async () => {
      setLoading(true);
      const [collaborationResult, membersResult] = await Promise.allSettled([loadCollaboration(), listMembers()]);
      const collaboration = collaborationResult.status === "fulfilled" ? collaborationResult.value : { spaces: [], categories: [], channels: [] };
      const members: Member[] = membersResult.status === "fulfilled" ? membersResult.value.members : [];
      const messageResults = await Promise.allSettled(
        collaboration.channels.filter((channel) => channel.type !== "voice").slice(0, 30).map((channel) => listMessages(channel.id)),
      );
      const messages: ChannelMessage[] = messageResults.flatMap((result) => result.status === "fulfilled" ? result.value.slice(-100) : []);
      const spaceById = new Map(collaboration.spaces.map((space) => [space.id, space]));
      const channelById = new Map(collaboration.channels.map((channel) => [channel.id, channel]));
      const next: SearchItem[] = [];

      for (const node of readNodes()) {
        next.push({ id: `node:${node.id}`, kind: "node", title: node.name, subtitle: `${node.kind} · ${node.owner}`, text: `${node.description} ${node.status} ${node.priority}`, queryHint: node.name });
      }
      for (const space of collaboration.spaces) {
        const channel = collaboration.channels.find((item) => item.spaceId === space.id);
        next.push({ id: `space:${space.id}`, kind: "space", title: space.name, subtitle: `${space.kind} · ${space.description || "Espaço de trabalho"}`, text: `${space.description} ${space.icon}`, channelId: channel?.id });
      }
      for (const channel of collaboration.channels) {
        const space = spaceById.get(channel.spaceId);
        next.push({ id: `channel:${channel.id}`, kind: "channel", title: `#${channel.name}`, subtitle: `${channelLabel(channel)} · ${space?.name ?? "Labstar"}`, text: `${channel.description} ${channel.type}`, channelId: channel.id });
      }
      for (const member of members) {
        next.push({ id: `member:${member.id}`, kind: "member", title: member.name, subtitle: `${member.jobRoles[0]?.name || member.jobTitle || "Membro"} · ${member.area || member.email}`, text: `${member.email} ${member.area} ${member.jobTitle}`, memberName: member.name });
      }
      for (const message of messages) {
        const channel = channelById.get(message.channelId);
        if (message.body.trim()) next.push({ id: `message:${message.id}`, kind: "message", title: message.body.slice(0, 90), subtitle: `${message.author?.name ?? "Membro"} em #${channel?.name ?? "canal"}`, text: `${message.body} ${message.author?.name ?? ""}`, channelId: message.channelId, queryHint: message.body.slice(0, 45) });
        for (const attachment of message.attachments) next.push({ id: `file:${attachment.id}`, kind: "file", title: attachment.fileName, subtitle: `Arquivo em #${channel?.name ?? "canal"}`, text: `${attachment.mimeType} ${message.body}`, channelId: message.channelId, queryHint: attachment.fileName });
      }

      setItems(next);
      loadedAtRef.current = Date.now();
      setLoading(false);
    })().finally(() => { loadingRef.current = null; });
    loadingRef.current = task;
    return task;
  }, []);

  useEffect(() => {
    void loadIndex(true);
    const interval = window.setInterval(() => void loadIndex(true), 60_000);
    return () => window.clearInterval(interval);
  }, [loadIndex]);

  useEffect(() => {
    let unbind: (() => void) | undefined;
    const bind = () => {
      const input = document.querySelector<HTMLInputElement>(".global-search input");
      if (!input || inputRef.current === input) return;
      unbind?.();
      inputRef.current = input;
      input.placeholder = "Buscar em tudo no Labstar...";
      const updateRect = () => setRect(input.getBoundingClientRect());
      const onInput = () => { setQuery(input.value); setSelected(0); setOpen(true); updateRect(); };
      const onFocus = () => { setQuery(input.value); setOpen(true); updateRect(); void loadIndex(); };
      input.addEventListener("input", onInput);
      input.addEventListener("focus", onFocus);
      window.addEventListener("resize", updateRect);
      window.addEventListener("scroll", updateRect, true);
      updateRect();
      unbind = () => {
        input.removeEventListener("input", onInput);
        input.removeEventListener("focus", onFocus);
        window.removeEventListener("resize", updateRect);
        window.removeEventListener("scroll", updateRect, true);
        if (inputRef.current === input) inputRef.current = null;
      };
    };
    bind();
    const observer = new MutationObserver(bind);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); unbind?.(); };
  }, [loadIndex]);

  const results = useMemo(() => items.map((item) => ({ item, score: score(item, query) })).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title)).slice(0, 24).map((entry) => entry.item), [items, query]);

  const openItem = useCallback((item: SearchItem) => {
    setOpen(false);
    if (item.kind === "node") {
      clickView("Mapa da organização");
      window.setTimeout(() => { const input = document.querySelector<HTMLInputElement>(".global-search input"); if (input) setNativeValue(input, item.queryHint ?? item.title); }, 80);
      return;
    }
    if (item.kind === "member") {
      clickView("Equipe");
      window.setTimeout(() => { const input = document.querySelector<HTMLInputElement>(".member-search input"); if (input) { setNativeValue(input, item.memberName ?? item.title); input.focus(); } }, 120);
      return;
    }
    clickView("Central de trabalho");
    if (item.channelId) window.setTimeout(() => window.dispatchEvent(new CustomEvent("labstar:open-channel", { detail: { channelId: item.channelId, query: item.queryHint ?? "" } })), 80);
  }, []);

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (!open) return;
      if (event.key === "Escape") setOpen(false);
      if (event.key === "ArrowDown") { event.preventDefault(); setSelected((value) => Math.min(results.length - 1, value + 1)); }
      if (event.key === "ArrowUp") { event.preventDefault(); setSelected((value) => Math.max(0, value - 1)); }
      if (event.key === "Enter" && results[selected]) { event.preventDefault(); openItem(results[selected]); }
    };
    window.addEventListener("keydown", keyboard, true);
    return () => window.removeEventListener("keydown", keyboard, true);
  }, [open, openItem, results, selected]);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if ((event.target as HTMLElement).closest(".global-search, .global-search-v2")) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  if (!open || !rect) return null;
  return createPortal(
    <section className="labstar-global-results global-search-v2" style={{ left: Math.max(12, rect.left), top: rect.bottom + 8, width: Math.min(Math.max(rect.width, 520), window.innerWidth - Math.max(24, rect.left + 12)) }}>
      <header><div><Search size={15} /><strong>{query.trim() ? `Resultados para “${query.trim()}”` : "Pesquisar em todo o Labstar"}</strong></div><span>{loading ? "Atualizando índice" : `${items.length} itens pesquisáveis`}</span></header>
      <div className="labstar-global-result-list">{loading && !results.length ? <div className="labstar-search-state"><LoaderCircle className="spin" size={18} /> Indexando o ambiente…</div> : results.length ? results.map((item, index) => <button type="button" key={item.id} className={selected === index ? "active" : ""} onPointerMove={() => setSelected(index)} onClick={() => openItem(item)}><span className={`labstar-search-kind ${item.kind}`}>{icon(item.kind)}</span><span><strong>{item.title}</strong><small>{item.subtitle}</small></span><em>{KIND_LABEL[item.kind]}</em><ArrowRight size={14} /></button>) : <div className="labstar-search-state"><Search size={18} /><strong>Nada encontrado</strong><span>Tente projeto, pessoa, canal, mensagem ou arquivo.</span></div>}</div>
      <footer><span>↑↓ navegar</span><span>Enter abrir</span><span>Esc fechar</span><span><Bell size={10} /> dados sincronizados</span></footer>
    </section>,
    document.body,
  );
}

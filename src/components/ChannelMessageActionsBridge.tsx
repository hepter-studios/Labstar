import {
  Copy,
  EyeOff,
  FileCode2,
  Link2,
  Pencil,
  Pin,
  Reply,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { deleteMessage, getCurrentIdentity, supabaseClient } from "../lib/supabase";

type ChannelMessageTarget = {
  article: HTMLElement;
  id: string;
  body: string;
  createdAtLabel: string;
  isPinned: boolean;
  canEdit: boolean;
  canModerate: boolean;
  x: number;
  y: number;
};

const MENU_WIDTH = 300;
const MENU_HEIGHT = 470;
const LEGACY_LOCAL_HIDDEN_CHANNEL_KEY = "labstar-hidden-channel-messages-v1";
const LOCAL_HIDDEN_CHANNEL_PREFIX = "labstar-hidden-channel-messages-v2:";

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(value, maximum));
}

function messageIdFromArticle(article: HTMLElement) {
  const header = article.querySelector<HTMLElement>('header[id^="message-"]');
  return header?.id.replace(/^message-/, "") ?? "";
}

function messageTextFromArticle(article: HTMLElement) {
  const body = article.querySelector<HTMLElement>(".message-body");
  if (!body) return "";
  const clone = body.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("header, .message-reply-preview, .message-attachments, button").forEach((node) => node.remove());
  return clone.innerText.trim();
}

function messageDateFromArticle(article: HTMLElement) {
  return article.querySelector<HTMLElement>(".message-body > header time")?.textContent?.trim() || "Mensagem do canal";
}

function localHiddenKey(memberId: string) {
  return `${LOCAL_HIDDEN_CHANNEL_PREFIX}${memberId || "session"}`;
}

function readJsonSet(key: string) {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "[]") as unknown;
    return new Set(Array.isArray(value) ? value.map(String) : []);
  } catch {
    return new Set<string>();
  }
}

function readLocallyHiddenChannelMessages(memberId: string) {
  const next = readJsonSet(localHiddenKey(memberId));
  // Migra silenciosamente o fallback antigo para não fazer mensagens reaparecerem.
  for (const id of readJsonSet(LEGACY_LOCAL_HIDDEN_CHANNEL_KEY)) next.add(id);
  return next;
}

function rememberLocallyHiddenChannelMessage(memberId: string, messageId: string) {
  const hidden = readLocallyHiddenChannelMessages(memberId);
  hidden.add(messageId);
  try {
    window.localStorage.setItem(localHiddenKey(memberId), JSON.stringify([...hidden].slice(-2500)));
  } catch {
    // A ocultação da sessão atual continua funcionando mesmo sem localStorage.
  }
}

function applyHiddenMessages(hidden: Set<string>) {
  if (!hidden.size) return;
  document.querySelectorAll<HTMLElement>(".chat-message").forEach((article) => {
    const id = messageIdFromArticle(article);
    if (id && hidden.has(id)) article.style.display = "none";
  });
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

export function ChannelMessageActionsBridge() {
  const [menu, setMenu] = useState<ChannelMessageTarget | null>(null);
  const [error, setError] = useState("");
  const [confirmDeleteForEveryone, setConfirmDeleteForEveryone] = useState(false);
  const [canModerateContent, setCanModerateContent] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const memberIdRef = useRef("");
  const hiddenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let disposed = false;

    const loadVisibility = async () => {
      let memberId = "";
      try {
        const identity = await getCurrentIdentity();
        if (disposed) return;
        memberId = identity?.member?.id ?? "";
        memberIdRef.current = memberId;
        const member = identity?.member;
        setCanModerateContent(Boolean(member && (
          member.role === "owner"
          || member.role === "admin"
          || member.jobRoles.some((role) => role.permissions.includes("moderate_content") || role.permissions.includes("manage_channels"))
        )));
      } catch {
        // O menu continua disponível com as permissões que a própria mensagem expõe.
      }

      const hidden = readLocallyHiddenChannelMessages(memberId);
      if (supabaseClient && memberId) {
        try {
          const { data, error: hiddenError } = await supabaseClient
            .from("hidden_channel_messages")
            .select("message_id")
            .eq("member_id", memberId);
          if (!hiddenError) for (const row of data ?? []) hidden.add(String(row.message_id));
        } catch {
          // Fallback local cobre ambientes durante rollout da migração.
        }
      }
      hiddenIdsRef.current = hidden;
      applyHiddenMessages(hidden);
    };

    void loadVisibility();
    const observer = new MutationObserver(() => applyHiddenMessages(hiddenIdsRef.current));
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, []);

  async function persistHiddenChannelMessage(messageId: string) {
    const client = supabaseClient;
    if (!client) return false;
    let memberId = memberIdRef.current;
    try {
      if (!memberId) {
        const { data, error: memberError } = await client.rpc("current_member_id");
        if (memberError || !data) return false;
        memberId = String(data);
        memberIdRef.current = memberId;
      }
      const { error: persistError } = await client.from("hidden_channel_messages").upsert({ member_id: memberId, message_id: messageId });
      return !persistError;
    } catch {
      return false;
    }
  }

  useEffect(() => {
    const openForArticle = (article: HTMLElement, preferredX: number, preferredY: number) => {
      const id = messageIdFromArticle(article);
      if (!id) return;

      const canEdit = Boolean(article.querySelector<HTMLButtonElement>('.message-actions button[title="Editar"]'));
      const width = Math.min(MENU_WIDTH, Math.max(220, window.innerWidth - 24));
      const height = Math.min(MENU_HEIGHT, Math.max(260, window.innerHeight - 24));

      setError("");
      setConfirmDeleteForEveryone(false);
      setMenu({
        article,
        id,
        body: messageTextFromArticle(article),
        createdAtLabel: messageDateFromArticle(article),
        isPinned: article.classList.contains("pinned"),
        canEdit,
        canModerate: canEdit || canModerateContent,
        x: clamp(preferredX, 12, Math.max(12, window.innerWidth - width - 12)),
        y: clamp(preferredY, 12, Math.max(12, window.innerHeight - height - 12)),
      });
    };

    const interceptMoreActions = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest<HTMLButtonElement>('.chat-message .message-actions button[aria-label="Mais ações da mensagem"]');
      if (!button) return;
      const article = button.closest<HTMLElement>(".chat-message");
      if (!article) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const rect = button.getBoundingClientRect();
      openForArticle(article, rect.right - MENU_WIDTH, rect.bottom + 8);
    };

    document.addEventListener("click", interceptMoreActions, true);
    return () => document.removeEventListener("click", interceptMoreActions, true);
  }, [canModerateContent]);

  useEffect(() => {
    if (!menu) return undefined;
    const closeOutside = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };
    document.addEventListener("pointerdown", closeOutside, true);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside, true);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [menu]);

  if (!menu) return null;
  const activeMenu = menu;
  const replyButton = activeMenu.article.querySelector<HTMLButtonElement>('.message-actions button[title="Responder"]');
  const editButton = activeMenu.article.querySelector<HTMLButtonElement>('.message-actions button[title="Editar"]');

  function reply() {
    setMenu(null);
    window.requestAnimationFrame(() => replyButton?.click());
  }

  function edit() {
    setMenu(null);
    window.requestAnimationFrame(() => editButton?.click());
  }

  async function copyBody() {
    try {
      await copyText(activeMenu.body);
      setMenu(null);
    } catch {
      setError("Não foi possível copiar o texto desta mensagem.");
    }
  }

  async function copyLink() {
    try {
      const url = new URL(window.location.href);
      url.hash = `message-${activeMenu.id}`;
      await copyText(url.toString());
      setMenu(null);
    } catch {
      setError("Não foi possível copiar o link desta mensagem.");
    }
  }

  function downloadMarkdown() {
    const blob = new Blob([activeMenu.body], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `mensagem-${activeMenu.id.slice(0, 8)}.md`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setMenu(null);
  }

  function speak() {
    if (!("speechSynthesis" in window)) {
      setError("A leitura de mensagens não está disponível neste navegador.");
      return;
    }
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(activeMenu.body));
    setMenu(null);
  }

  function runExistingChannelAction(pattern: RegExp) {
    const article = activeMenu.article;
    const rect = article.getBoundingClientRect();
    setMenu(null);
    article.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: clamp(rect.right - 190, 12, window.innerWidth - 200),
      clientY: clamp(rect.top + 36, 12, window.innerHeight - 180),
    }));
    window.setTimeout(() => {
      const action = Array.from(document.querySelectorAll<HTMLButtonElement>(".context-menu button"))
        .find((button) => pattern.test(button.textContent?.trim() || ""));
      action?.click();
    }, 0);
  }

  async function hideForMe() {
    const memberId = memberIdRef.current;
    hiddenIdsRef.current.add(activeMenu.id);
    rememberLocallyHiddenChannelMessage(memberId, activeMenu.id);
    activeMenu.article.style.display = "none";
    setMenu(null);
    await persistHiddenChannelMessage(activeMenu.id);
  }

  async function deleteForEveryone() {
    if (!confirmDeleteForEveryone) {
      setConfirmDeleteForEveryone(true);
      return;
    }
    try {
      await deleteMessage(activeMenu.id);
      activeMenu.article.remove();
      setMenu(null);
    } catch {
      setConfirmDeleteForEveryone(false);
      setError("Não foi possível apagar esta mensagem para todos.");
    }
  }

  return (
    <div ref={menuRef} className="channel-message-actions-menu" role="menu" data-labstar-destructive-confirmation="true" style={{ left: activeMenu.x, top: activeMenu.y }} onClick={(event) => event.stopPropagation()}>
      <header><strong>Ações da mensagem</strong><small>{activeMenu.createdAtLabel}</small></header>

      <button type="button" role="menuitem" onClick={reply}><Reply size={15} /><span>Responder</span></button>
      {activeMenu.canEdit && <button type="button" role="menuitem" onClick={edit}><Pencil size={15} /><span>Editar em Markdown</span></button>}
      {activeMenu.canModerate && <button type="button" role="menuitem" onClick={() => runExistingChannelAction(/Fixar mensagem|Desafixar/i)}><Pin size={15} /><span>{activeMenu.isPinned ? "Desafixar mensagem" : "Fixar mensagem"}</span></button>}

      <i className="channel-message-menu-separator" />

      <button type="button" role="menuitem" onClick={() => void copyBody()}><Copy size={15} /><span>Copiar texto</span></button>
      <button type="button" role="menuitem" onClick={() => void copyLink()}><Link2 size={15} /><span>Copiar link da mensagem</span></button>
      <button type="button" role="menuitem" onClick={downloadMarkdown}><FileCode2 size={15} /><span>Baixar como Markdown</span></button>
      <button type="button" role="menuitem" onClick={speak}><Volume2 size={15} /><span>Ler mensagem</span></button>

      <i className="channel-message-menu-separator" />
      <button type="button" role="menuitem" onClick={() => void hideForMe()}><EyeOff size={15} /><span>Apagar para mim</span></button>
      {activeMenu.canModerate && <button className={`danger ${confirmDeleteForEveryone ? "confirm" : ""}`} type="button" role="menuitem" onClick={() => void deleteForEveryone()}><Trash2 size={15} /><span>{confirmDeleteForEveryone ? "Confirmar: apagar para todos" : "Apagar para todos"}</span></button>}

      {error && <div className="channel-message-menu-error"><X size={13} /><span>{error}</span></div>}
    </div>
  );
}

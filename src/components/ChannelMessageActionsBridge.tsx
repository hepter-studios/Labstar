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
import { deleteMessage, supabaseClient } from "../lib/supabase";

type ChannelMessageTarget = {
  article: HTMLElement;
  id: string;
  body: string;
  createdAtLabel: string;
  isPinned: boolean;
  canManage: boolean;
  x: number;
  y: number;
};

const MENU_WIDTH = 300;
const MENU_HEIGHT = 470;
const LOCAL_HIDDEN_CHANNEL_KEY = "labstar-hidden-channel-messages-v1";

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

function readLocallyHiddenChannelMessages() {
  try {
    const value = JSON.parse(window.localStorage.getItem(LOCAL_HIDDEN_CHANNEL_KEY) ?? "[]") as unknown;
    return new Set(Array.isArray(value) ? value.map(String) : []);
  } catch {
    return new Set<string>();
  }
}

function rememberLocallyHiddenChannelMessage(messageId: string) {
  const hidden = readLocallyHiddenChannelMessages();
  hidden.add(messageId);
  try {
    window.localStorage.setItem(LOCAL_HIDDEN_CHANNEL_KEY, JSON.stringify([...hidden].slice(-2500)));
  } catch {
    // O fallback visual da sessão atual continua funcionando mesmo sem localStorage.
  }
}

function hideStoredChannelMessages() {
  const hidden = readLocallyHiddenChannelMessages();
  if (!hidden.size) return;
  document.querySelectorAll<HTMLElement>(".chat-message").forEach((article) => {
    const id = messageIdFromArticle(article);
    if (id && hidden.has(id)) article.style.display = "none";
  });
}

async function persistHiddenChannelMessage(messageId: string) {
  const client = supabaseClient;
  if (!client) return false;
  try {
    const { data: memberId, error: memberError } = await client.rpc("current_member_id");
    if (memberError || !memberId) return false;
    const { error } = await client.from("hidden_channel_messages").upsert({
      member_id: String(memberId),
      message_id: messageId,
    });
    return !error;
  } catch {
    return false;
  }
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
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    hideStoredChannelMessages();
    const observer = new MutationObserver(() => hideStoredChannelMessages());
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const openForArticle = (article: HTMLElement, preferredX: number, preferredY: number) => {
      const id = messageIdFromArticle(article);
      if (!id) return;

      const canManage = Boolean(article.querySelector<HTMLButtonElement>('.message-actions button[title="Editar"]'));
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
        canManage,
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
  }, []);

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
      if (action) action.click();
    }, 0);
  }

  async function hideForMe() {
    try {
      rememberLocallyHiddenChannelMessage(activeMenu.id);
      activeMenu.article.style.display = "none";
      setMenu(null);
      void persistHiddenChannelMessage(activeMenu.id);
    } catch {
      setError("Não foi possível ocultar esta mensagem para você.");
    }
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
    <div
      ref={menuRef}
      className="channel-message-actions-menu"
      role="menu"
      data-labstar-destructive-confirmation="true"
      style={{ left: activeMenu.x, top: activeMenu.y }}
      onClick={(event) => event.stopPropagation()}
    >
      <header>
        <strong>Ações da mensagem</strong>
        <small>{activeMenu.createdAtLabel}</small>
      </header>

      <button type="button" role="menuitem" onClick={reply}><Reply size={15} /><span>Responder</span></button>
      {activeMenu.canManage && <button type="button" role="menuitem" onClick={edit}><Pencil size={15} /><span>Editar em Markdown</span></button>}
      <button type="button" role="menuitem" onClick={() => runExistingChannelAction(/Fixar mensagem|Desafixar/i)}><Pin size={15} /><span>{activeMenu.isPinned ? "Desafixar mensagem" : "Fixar mensagem"}</span></button>

      <i className="channel-message-menu-separator" />

      <button type="button" role="menuitem" onClick={() => void copyBody()}><Copy size={15} /><span>Copiar texto</span></button>
      <button type="button" role="menuitem" onClick={() => void copyLink()}><Link2 size={15} /><span>Copiar link da mensagem</span></button>
      <button type="button" role="menuitem" onClick={downloadMarkdown}><FileCode2 size={15} /><span>Baixar como Markdown</span></button>
      <button type="button" role="menuitem" onClick={speak}><Volume2 size={15} /><span>Ler mensagem</span></button>

      <i className="channel-message-menu-separator" />
      <button type="button" role="menuitem" onClick={() => void hideForMe()}><EyeOff size={15} /><span>Apagar para mim</span></button>
      {activeMenu.canManage && (
        <button className={`danger ${confirmDeleteForEveryone ? "confirm" : ""}`} type="button" role="menuitem" onClick={() => void deleteForEveryone()}>
          <Trash2 size={15} /><span>{confirmDeleteForEveryone ? "Confirmar: apagar para todos" : "Apagar para todos"}</span>
        </button>
      )}

      {error && <div className="channel-message-menu-error"><X size={13} /><span>{error}</span></div>}
    </div>
  );
}

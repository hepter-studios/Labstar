import {
  Copy,
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
const MENU_HEIGHT = 430;

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
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const openForArticle = (article: HTMLElement, preferredX: number, preferredY: number) => {
      const id = messageIdFromArticle(article);
      if (!id) return;

      const canManage = Boolean(article.querySelector<HTMLButtonElement>('.message-actions button[title="Editar"]'));
      const width = Math.min(MENU_WIDTH, Math.max(220, window.innerWidth - 24));
      const height = Math.min(MENU_HEIGHT, Math.max(260, window.innerHeight - 24));

      setError("");
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

  return (
    <div
      ref={menuRef}
      className="channel-message-actions-menu"
      role="menu"
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

      {activeMenu.canManage && <>
        <i className="channel-message-menu-separator" />
        <button className="danger" type="button" role="menuitem" onClick={() => runExistingChannelAction(/Excluir mensagem/i)}><Trash2 size={15} /><span>Excluir mensagem</span></button>
      </>}

      {error && <div className="channel-message-menu-error"><X size={13} /><span>{error}</span></div>}
    </div>
  );
}

import { useEffect } from "react";
import { hideDirectMessageForMe } from "../lib/directMessages";

const DECORATED = "data-labstar-delete-options";
const HIDE_BUTTON = "data-labstar-hide-for-me";
const DELETE_BOUND = "data-labstar-delete-for-everyone-bound";

function directMessageId(article: HTMLElement) {
  return article.id.replace(/^dm-message-/, "");
}

function eyeOffIcon() {
  return `
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61C3.98 8.2 2 12 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" x2="22" y1="2" y2="22" />
    </svg>`;
}

function decorateDirectMessageMenu(menu: HTMLElement) {
  const article = menu.closest<HTMLElement>(".dm-message");
  if (!article) return;
  const messageId = directMessageId(article);
  if (!messageId) return;

  const buttons = Array.from(menu.querySelectorAll<HTMLButtonElement>("button"));
  const deleteForEveryone = buttons.find((button) => /Excluir mensagem|Apagar para todos|Confirmar: apagar para todos/i.test(button.textContent ?? "")) ?? null;

  if (deleteForEveryone) {
    deleteForEveryone.dataset.skipDestructiveGuard = "true";
    const label = deleteForEveryone.querySelector<HTMLElement>("span");
    if (label && !deleteForEveryone.dataset.confirmingDelete) label.textContent = "Apagar para todos";

    if (deleteForEveryone.getAttribute(DELETE_BOUND) !== "true") {
      deleteForEveryone.setAttribute(DELETE_BOUND, "true");
      deleteForEveryone.addEventListener("click", (event) => {
        if (deleteForEveryone.dataset.confirmingDelete === "true") return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        deleteForEveryone.dataset.confirmingDelete = "true";
        deleteForEveryone.classList.add("confirm");
        const currentLabel = deleteForEveryone.querySelector<HTMLElement>("span");
        if (currentLabel) currentLabel.textContent = "Confirmar: apagar para todos";
        window.setTimeout(() => {
          if (!deleteForEveryone.isConnected) return;
          delete deleteForEveryone.dataset.confirmingDelete;
          deleteForEveryone.classList.remove("confirm");
          const resetLabel = deleteForEveryone.querySelector<HTMLElement>("span");
          if (resetLabel) resetLabel.textContent = "Apagar para todos";
        }, 4200);
      }, true);
    }
  }

  if (!menu.querySelector(`[${HIDE_BUTTON}]`)) {
    const hideButton = document.createElement("button");
    hideButton.type = "button";
    hideButton.setAttribute("role", "menuitem");
    hideButton.setAttribute(HIDE_BUTTON, "true");
    hideButton.dataset.skipDestructiveGuard = "true";
    hideButton.innerHTML = `${eyeOffIcon()}<span>Apagar para mim</span>`;
    hideButton.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const label = hideButton.querySelector<HTMLElement>("span");
      hideButton.disabled = true;
      if (label) label.textContent = "Apagando para você…";
      try {
        await hideDirectMessageForMe(messageId);
        article.style.display = "none";
        menu.style.display = "none";
      } catch {
        hideButton.disabled = false;
        if (label) label.textContent = "Não foi possível apagar para mim";
        window.setTimeout(() => {
          if (hideButton.isConnected && label) label.textContent = "Apagar para mim";
        }, 2400);
      }
    });

    const separatorBeforeDelete = deleteForEveryone?.previousElementSibling;
    if (separatorBeforeDelete?.tagName === "I") {
      menu.insertBefore(hideButton, separatorBeforeDelete);
    } else if (deleteForEveryone) {
      menu.insertBefore(hideButton, deleteForEveryone);
    } else {
      const separator = document.createElement("i");
      menu.appendChild(separator);
      menu.appendChild(hideButton);
    }
  }

  menu.setAttribute(DECORATED, "true");
}

export function DirectMessageDeleteOptionsBridge() {
  useEffect(() => {
    const decorate = () => {
      document.querySelectorAll<HTMLElement>(".dm-message-menu").forEach(decorateDirectMessageMenu);
    };

    decorate();
    const observer = new MutationObserver(decorate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}

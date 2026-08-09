import { useEffect } from "react";
import "../channel-runtime-access.css";
import {
  listManagedChannels,
  loadChannelAccessDirectory,
  type ChannelAccessConfig,
  type ChannelAccessDirectory,
} from "../lib/channel-access";

const CREATE_TRIGGER = "data-labstar-professional-create-channel";
const READ_ONLY_NOTICE = "data-labstar-read-only-notice";

function plusSvg() {
  return `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M12 5v14"/></svg>`;
}

function lockSvg() {
  return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
}

function canPostReadOnly(directory: ChannelAccessDirectory) {
  return directory.member.role === "owner"
    || directory.member.role === "admin"
    || directory.member.jobRoles.some((role) => role.permissions.includes("manage_channels") || role.permissions.includes("moderate_content"));
}

function categoryName(header: HTMLElement) {
  return header.querySelector<HTMLElement>("span")?.textContent?.trim() || "categoria";
}

function activeChannelId() {
  return document.querySelector<HTMLButtonElement>(".channel-list > button.active")?.dataset.channelId ?? "";
}

function applyReadOnlyState(directory: ChannelAccessDirectory, channels: ChannelAccessConfig[]) {
  const room = document.querySelector<HTMLElement>(".message-room");
  if (!room) return;
  const channel = channels.find((item) => item.id === activeChannelId());
  const restricted = Boolean(channel?.readOnly) && !canPostReadOnly(directory);
  room.classList.toggle("labstar-professional-read-only", restricted);

  const currentNotice = room.querySelector<HTMLElement>(`[${READ_ONLY_NOTICE}]`);
  if (!restricted) {
    currentNotice?.remove();
    return;
  }

  if (!currentNotice) {
    const notice = document.createElement("div");
    notice.className = "read-only-notice professional-read-only-notice";
    notice.setAttribute(READ_ONLY_NOTICE, "true");
    notice.innerHTML = `${lockSvg()} <span>Este canal é somente leitura. Você pode acompanhar o conteúdo, mas não publicar mensagens.</span>`;
    const composer = room.querySelector(".message-composer");
    room.insertBefore(notice, composer ?? null);
  }
}

function injectCreateButtons(directory: ChannelAccessDirectory) {
  if (!directory.canCreate) return;
  document.querySelectorAll<HTMLElement>(".channel-category > header").forEach((header) => {
    if (header.querySelector('button[aria-label^="Criar canal em "]')) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "professional-create-channel-trigger";
    button.setAttribute(CREATE_TRIGGER, "true");
    button.setAttribute("aria-label", `Criar canal em ${categoryName(header)}`);
    button.setAttribute("title", "Criar canal");
    button.innerHTML = plusSvg();
    header.appendChild(button);
  });
}

export function ChannelRuntimeAccessBridge() {
  useEffect(() => {
    let disposed = false;
    let directory: ChannelAccessDirectory | null = null;
    let channels: ChannelAccessConfig[] = [];
    let refreshTimer = 0;

    const apply = () => {
      if (disposed || !directory) return;
      injectCreateButtons(directory);
      applyReadOnlyState(directory, channels);
    };

    const refresh = async () => {
      window.clearTimeout(refreshTimer);
      try {
        const [nextDirectory, nextChannels] = await Promise.all([
          loadChannelAccessDirectory(),
          listManagedChannels().catch(() => []),
        ]);
        if (disposed) return;
        directory = nextDirectory;
        channels = nextChannels;
        apply();
      } catch {
        // A interface antiga continua disponível durante rollout da migração.
      }
    };

    void refresh();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "data-channel-id"] });
    const onRefresh = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => void refresh(), 100);
    };
    window.addEventListener("labstar:collaboration-refreshed", onRefresh);
    window.addEventListener("labstar:open-channel", onRefresh);

    return () => {
      disposed = true;
      window.clearTimeout(refreshTimer);
      observer.disconnect();
      window.removeEventListener("labstar:collaboration-refreshed", onRefresh);
      window.removeEventListener("labstar:open-channel", onRefresh);
      document.querySelectorAll(`[${CREATE_TRIGGER}], [${READ_ONLY_NOTICE}]`).forEach((node) => node.remove());
      document.querySelectorAll(".labstar-professional-read-only").forEach((node) => node.classList.remove("labstar-professional-read-only"));
    };
  }, []);

  return null;
}

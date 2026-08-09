import { useEffect } from "react";
import "../channel-runtime-access.css";
import {
  listManagedChannels,
  loadChannelAccessDirectory,
  type ChannelAccessConfig,
  type ChannelAccessDirectory,
} from "../lib/channel-access";
import { supabaseClient } from "../lib/supabase";

const CREATE_TRIGGER = "data-labstar-professional-create-channel";
const READ_ONLY_NOTICE = "data-labstar-read-only-notice";

function plusSvg() {
  return `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M12 5v14"/></svg>`;
}

function lockSvg() {
  return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
}

function categoryName(header: HTMLElement) {
  return header.querySelector<HTMLElement>("span")?.textContent?.trim() || "categoria";
}

function activeChannelId() {
  return document.querySelector<HTMLButtonElement>(".channel-list > button.active")?.dataset.channelId ?? "";
}

function applyReadOnlyState(channels: ChannelAccessConfig[], posting: Map<string, boolean>) {
  const room = document.querySelector<HTMLElement>(".message-room");
  if (!room) return;
  const channel = channels.find((item) => item.id === activeChannelId());
  const restricted = Boolean(channel && posting.get(channel.id) === false);
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
    notice.innerHTML = `${lockSvg()} <span>Você pode ler este canal, mas as regras do canal ou da categoria não permitem publicar aqui.</span>`;
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

async function postingDirectory(channels: ChannelAccessConfig[]) {
  const result = new Map<string, boolean>();
  if (!supabaseClient) return result;
  await Promise.all(channels.map(async (channel) => {
    try {
      const { data, error } = await supabaseClient.rpc("member_can_post_labstar_channel", { target_channel_id: channel.id });
      if (!error) result.set(channel.id, Boolean(data));
    } catch {
      // Em rollout antigo o campo read_only local continua sendo usado abaixo.
    }
  }));
  return result;
}

export function ChannelRuntimeAccessBridge() {
  useEffect(() => {
    let disposed = false;
    let directory: ChannelAccessDirectory | null = null;
    let channels: ChannelAccessConfig[] = [];
    let posting = new Map<string, boolean>();
    let refreshTimer = 0;

    const apply = () => {
      if (disposed || !directory) return;
      injectCreateButtons(directory);
      // Se o RPC ainda não existir, preserva o comportamento do read_only do canal.
      if (!posting.size) {
        posting = new Map(channels.map((channel) => [channel.id, !channel.readOnly]));
      }
      applyReadOnlyState(channels, posting);
    };

    const refresh = async () => {
      window.clearTimeout(refreshTimer);
      try {
        const [nextDirectory, nextChannels] = await Promise.all([
          loadChannelAccessDirectory(),
          listManagedChannels().catch(() => []),
        ]);
        const nextPosting = await postingDirectory(nextChannels);
        if (disposed) return;
        directory = nextDirectory;
        channels = nextChannels;
        posting = nextPosting;
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

import { CheckCircle2, Copy, LoaderCircle, Pin, Search, Settings2, Trash2, Users, Webhook, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { clearChannelChat, clearDirectConversation } from "../lib/chatMaintenance";
import { listDirectThreads } from "../lib/directMessages";
import { listMembers, loadCollaboration } from "../lib/supabase";

type Menu =
  | { kind: "channel"; x: number; y: number; button: HTMLButtonElement; name: string; channelId: string }
  | { kind: "space"; x: number; y: number; button: HTMLButtonElement; name: string }
  | { kind: "direct"; x: number; y: number; name: string; threadId: string | null }
  | null;

type ClearState = "idle" | "confirm" | "working";
type ActionProgress = {
  tone: "working" | "success" | "error";
  title: string;
  detail: string;
} | null;

const TRIGGER_ATTRIBUTE = "data-labstar-channel-menu-trigger";
const DIRECT_TRIGGER_ATTRIBUTE = "data-labstar-direct-menu-trigger";
const MENU_WIDTH = 245;
const ACTION_TIMEOUT_MS = 15_000;

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

function channelName(button: HTMLButtonElement) {
  const label = Array.from(button.children).find((child) => child.tagName === "SPAN");
  return label?.textContent?.trim() || "canal";
}

function clampMenuX(value: number) {
  return Math.max(8, Math.min(value, window.innerWidth - MENU_WIDTH - 8));
}

function clampMenuY(value: number, height = 330) {
  return Math.max(8, Math.min(value, window.innerHeight - height - 8));
}

function maintenanceErrorText(error: unknown) {
  if (error && typeof error === "object") {
    const value = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
    return [value.code, value.message, value.details, value.hint].filter(Boolean).map(String).join(" ");
  }
  return error instanceof Error ? error.message : String(error ?? "");
}

function friendlyMaintenanceError(error: unknown) {
  const message = maintenanceErrorText(error);
  if (/action_timeout/i.test(message)) {
    return "A operação demorou mais que o esperado. Nada será escondido: tente novamente em alguns segundos.";
  }
  if (/clear_channel_chat|clear_direct_conversation|function .* does not exist|PGRST202|schema cache/i.test(message)) {
    return "A rotina de limpeza ainda não está ativa no banco publicado.";
  }
  if (/manage_channels|required|permission|denied|42501|access_denied/i.test(message)) {
    return "Você não tem permissão para limpar este chat.";
  }
  if (/ambiguous/i.test(message)) {
    return "Não consegui identificar essa conversa com segurança.";
  }
  if (/channel_required|direct_thread_required/i.test(message)) {
    return "O Labstar não encontrou o identificador desta conversa. Reabra o canal ou a DM e tente novamente.";
  }
  return "Não foi possível limpar o chat agora.";
}

function withActionTimeout<T>(promise: Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("action_timeout")), ACTION_TIMEOUT_MS);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function WorkspaceQuickMenus() {
  const [menu, setMenu] = useState<Menu>(null);
  const [clearState, setClearState] = useState<ClearState>("idle");
  const [notice, setNotice] = useState("");
  const [actionProgress, setActionProgress] = useState<ActionProgress>(null);
  const progressTimerRef = useRef(0);
  const ref = useRef<HTMLElement>(null);

  function showMenu(next: Exclude<Menu, null>) {
    setClearState("idle");
    setNotice("");
    setMenu(next);
  }

  function showProgress(progress: NonNullable<ActionProgress>, autoHideMs = 0) {
    window.clearTimeout(progressTimerRef.current);
    setActionProgress(progress);
    if (autoHideMs > 0) {
      progressTimerRef.current = window.setTimeout(() => setActionProgress(null), autoHideMs);
    }
  }

  useEffect(() => () => window.clearTimeout(progressTimerRef.current), []);

  useEffect(() => {
    const openChannelMenu = (button: HTMLButtonElement, x: number, y: number) => {
      showMenu({
        kind: "channel",
        x: clampMenuX(x),
        y: clampMenuY(y),
        button,
        name: channelName(button),
        channelId: button.dataset.channelId ?? "",
      });
    };

    const openDirectMenu = (x: number, y: number) => {
      const conversation = document.querySelector<HTMLElement>(".dm-conversation");
      const name = document.querySelector<HTMLElement>(".dm-conversation-person strong")?.textContent?.trim() || "Conversa privada";
      showMenu({
        kind: "direct",
        x: clampMenuX(x),
        y: clampMenuY(y, 280),
        name,
        threadId: conversation?.dataset.threadId || null,
      });
    };

    const decorateChannels = () => {
      document.querySelectorAll<HTMLButtonElement>(".channel-list > button").forEach((button) => {
        if (button.querySelector(`[${TRIGGER_ATTRIBUTE}]`)) return;

        const trigger = document.createElement("i");
        trigger.className = "channel-quick-menu-trigger";
        trigger.setAttribute(TRIGGER_ATTRIBUTE, "true");
        trigger.setAttribute("role", "button");
        trigger.setAttribute("tabindex", "0");
        trigger.setAttribute("aria-label", `Ações do canal ${channelName(button)}`);
        trigger.setAttribute("title", "Mais ações do canal");
        trigger.textContent = "•••";

        trigger.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const rect = trigger.getBoundingClientRect();
          openChannelMenu(button, rect.right - MENU_WIDTH, rect.bottom + 6);
        });

        trigger.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          event.stopPropagation();
          const rect = trigger.getBoundingClientRect();
          openChannelMenu(button, rect.right - MENU_WIDTH, rect.bottom + 6);
        });

        button.appendChild(trigger);
      });
    };

    const decorateDirectConversation = () => {
      const actions = document.querySelector<HTMLElement>(".dm-conversation-actions");
      if (!actions || actions.querySelector(`[${DIRECT_TRIGGER_ATTRIBUTE}]`)) return;

      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className = "dm-conversation-more";
      trigger.setAttribute(DIRECT_TRIGGER_ATTRIBUTE, "true");
      trigger.setAttribute("aria-label", "Mais ações da conversa privada");
      trigger.setAttribute("title", "Mais ações da conversa");
      trigger.textContent = "•••";
      trigger.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const rect = trigger.getBoundingClientRect();
        openDirectMenu(rect.right - MENU_WIDTH, rect.bottom + 7);
      });
      actions.appendChild(trigger);
    };

    const open = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const channel = target?.closest<HTMLButtonElement>(".channel-list > button");
      if (channel) {
        event.preventDefault();
        openChannelMenu(channel, event.clientX, event.clientY);
        return;
      }

      const direct = target?.closest<HTMLElement>(".dm-conversation");
      if (direct && !target?.closest(".dm-message")) {
        event.preventDefault();
        openDirectMenu(event.clientX, event.clientY);
        return;
      }

      const space = target?.closest<HTMLButtonElement>(".space-list button");
      if (space) {
        event.preventDefault();
        showMenu({
          kind: "space",
          x: clampMenuX(event.clientX),
          y: clampMenuY(event.clientY, 220),
          button: space,
          name: space.getAttribute("title")?.trim() || "Espaço",
        });
      }
    };

    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setMenu(null);
    };
    const escape = (event: KeyboardEvent) => event.key === "Escape" && setMenu(null);

    decorateChannels();
    decorateDirectConversation();
    const observer = new MutationObserver(() => {
      decorateChannels();
      decorateDirectConversation();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("contextmenu", open, true);
    document.addEventListener("pointerdown", close);
    window.addEventListener("keydown", escape);
    return () => {
      observer.disconnect();
      document.removeEventListener("contextmenu", open, true);
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", escape);
      document.querySelectorAll(`[${TRIGGER_ATTRIBUTE}], [${DIRECT_TRIGGER_ATTRIBUTE}]`).forEach((trigger) => trigger.remove());
    };
  }, []);

  const activeMenu = menu;
  const canClearChannel = activeMenu?.kind === "channel" && Boolean(document.querySelector(".add-space"));
  const canClearDirect = activeMenu?.kind === "direct";

  function openSelected() {
    if (!activeMenu || activeMenu.kind === "direct") return;
    activeMenu.button.click();
    setMenu(null);
  }

  function openSpaceSettings() {
    if (!activeMenu || activeMenu.kind !== "space") return;
    activeMenu.button.click();
    window.setTimeout(() => document.querySelector<HTMLButtonElement>('button[aria-label="Configurar espaço"]')?.click(), 30);
    setMenu(null);
  }

  function focusChannelSearch() {
    if (!activeMenu || activeMenu.kind !== "channel") return;
    activeMenu.button.click();
    window.setTimeout(() => document.querySelector<HTMLInputElement>(".message-toolbar input")?.focus(), 30);
    setMenu(null);
  }

  function focusDirectSearch() {
    document.querySelector<HTMLInputElement>(".dm-conversation-actions input")?.focus();
    setMenu(null);
  }

  function toggleDirectPinned() {
    document.querySelector<HTMLButtonElement>('.dm-conversation-actions button[title="Mostrar fixadas"], .dm-conversation-actions button[title="Mostrar todas"]')?.click();
    setMenu(null);
  }

  function toggleMembers() {
    if (!activeMenu || activeMenu.kind !== "channel") return;
    activeMenu.button.click();
    window.setTimeout(() => document.querySelector<HTMLButtonElement>('.channel-head-actions button[title="Mostrar membros"]')?.click(), 30);
    setMenu(null);
  }

  function openIntegrations() {
    if (!activeMenu || activeMenu.kind !== "channel") return;
    activeMenu.button.click();
    window.setTimeout(() => document.querySelector<HTMLButtonElement>('.channel-head-actions button[title="Integrações e automações"]')?.click(), 30);
    setMenu(null);
  }

  async function resolveChannelId(target: Extract<Exclude<Menu, null>, { kind: "channel" }>) {
    if (target.channelId) return target.channelId;
    const collaboration = await loadCollaboration();
    const visibleSpaceName = document.querySelector<HTMLElement>(".space-title strong")?.textContent?.trim().toLocaleLowerCase() || "";
    const currentSpace = collaboration.spaces.find((space) => space.name.trim().toLocaleLowerCase() === visibleSpaceName);
    const candidates = collaboration.channels.filter((channel) =>
      channel.name.trim().toLocaleLowerCase() === target.name.trim().toLocaleLowerCase()
      && (!currentSpace || channel.spaceId === currentSpace.id)
    );
    if (candidates.length !== 1) throw new Error("channel_ambiguous");
    return candidates[0].id;
  }

  async function resolveDirectThreadId(target: Extract<Exclude<Menu, null>, { kind: "direct" }>) {
    if (target.threadId) return target.threadId;
    const [team, threads] = await Promise.all([listMembers(), listDirectThreads()]);
    const normalizedName = target.name.trim().toLocaleLowerCase();
    const candidates = team.members.filter((member) => member.name.trim().toLocaleLowerCase() === normalizedName);
    const candidateIds = new Set(candidates.map((member) => member.id));
    const matchingThreads = threads.filter((thread) => candidateIds.has(thread.otherMemberId));
    if (matchingThreads.length !== 1) throw new Error("direct_thread_ambiguous");
    return matchingThreads[0].threadId;
  }

  function removeVisibleMessagesAfterSuccess(target: Exclude<Menu, null>) {
    if (target.kind === "direct") {
      document.querySelectorAll(".dm-message").forEach((node) => node.remove());
      return;
    }
    if (target.kind === "channel" && target.button.classList.contains("active")) {
      document.querySelectorAll(".chat-message").forEach((node) => node.remove());
    }
  }

  async function clearCurrentChat() {
    if (!activeMenu || activeMenu.kind === "space" || clearState === "working") return;
    const target = activeMenu;

    if (clearState !== "confirm") {
      setClearState("confirm");
      setNotice(target.kind === "direct"
        ? "A conversa será apagada para os dois participantes. Clique novamente para confirmar."
        : "O histórico deste canal será apagado para todos. Clique novamente para confirmar.");
      return;
    }

    setClearState("working");
    setNotice("");
    showProgress({
      tone: "working",
      title: target.kind === "direct" ? "Limpando conversa" : "Limpando canal",
      detail: "Aguarde. O Labstar está removendo as mensagens do banco.",
    });

    try {
      const count = target.kind === "direct"
        ? await withActionTimeout(clearDirectConversation(await resolveDirectThreadId(target)))
        : await withActionTimeout(clearChannelChat(await resolveChannelId(target)));

      removeVisibleMessagesAfterSuccess(target);
      setClearState("idle");
      setNotice(count > 0 ? `${count} mensagem(ns) removida(s).` : "O chat já estava vazio.");
      showProgress({
        tone: "success",
        title: target.kind === "direct" ? "Conversa limpa" : "Canal limpo",
        detail: count > 0 ? `${count} mensagem(ns) removida(s) com sucesso.` : "Esse chat já estava vazio.",
      }, 1800);
      window.setTimeout(() => setMenu(null), 450);
    } catch (error) {
      const friendly = friendlyMaintenanceError(error);
      setClearState("idle");
      setNotice(friendly);
      showProgress({
        tone: "error",
        title: "Não foi possível concluir",
        detail: friendly,
      }, 3500);
    }
  }

  return (
    <>
      {activeMenu && (
        <aside
          ref={ref}
          data-labstar-destructive-confirmation="true"
          className={`workspace-quick-menu ${activeMenu.kind}`}
          style={{ left: activeMenu.x, top: activeMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <header>
            <strong>{activeMenu.kind === "channel" ? `# ${activeMenu.name}` : activeMenu.name}</strong>
            <button type="button" onClick={() => setMenu(null)} aria-label="Fechar"><X size={12}/></button>
          </header>
          <div>
            {activeMenu.kind !== "direct" && <button type="button" onClick={openSelected}>{activeMenu.kind === "channel" ? <Search size={14}/> : <Settings2 size={14}/>} Abrir {activeMenu.kind === "channel" ? "canal" : "Espaço"}</button>}
            {activeMenu.kind === "channel" && <button type="button" onClick={focusChannelSearch}><Search size={14}/> Buscar neste canal</button>}
            {activeMenu.kind === "direct" && <button type="button" onClick={focusDirectSearch}><Search size={14}/> Buscar nesta conversa</button>}
            {activeMenu.kind === "direct" && <button type="button" onClick={toggleDirectPinned}><Pin size={14}/> Mostrar fixadas</button>}
            <button type="button" onClick={() => { void copyText(activeMenu.kind === "channel" ? `#${activeMenu.name}` : activeMenu.name); setMenu(null); }}><Copy size={14}/> Copiar nome</button>
            {activeMenu.kind === "channel" && <button type="button" onClick={toggleMembers}><Users size={14}/> Alternar membros</button>}
            {activeMenu.kind === "channel" && <button type="button" onClick={openIntegrations}><Webhook size={14}/> Integrações</button>}
            {activeMenu.kind === "space" && <button type="button" onClick={openSpaceSettings}><Settings2 size={14}/> Configurações do Espaço</button>}

            {(canClearDirect || canClearChannel) && <i className="workspace-menu-separator" />}
            {(canClearDirect || canClearChannel) && (
              <button type="button" className={`danger ${clearState === "confirm" ? "confirm" : ""}`} disabled={clearState === "working"} onClick={() => void clearCurrentChat()}>
                {clearState === "working" ? <LoaderCircle className="spin" size={14}/> : <Trash2 size={14}/>}
                {clearState === "working"
                  ? "Limpando…"
                  : clearState === "confirm"
                    ? activeMenu.kind === "direct" ? "Confirmar: apagar para os dois" : "Confirmar limpeza do canal"
                    : activeMenu.kind === "direct" ? "Limpar conversa" : "Limpar chat"}
              </button>
            )}
            {notice && <p className={clearState === "confirm" ? "warning" : ""}>{notice}</p>}
          </div>
        </aside>
      )}

      {actionProgress && (
        <div className={`labstar-action-progress ${actionProgress.tone}`} role="status" aria-live="assertive" aria-busy={actionProgress.tone === "working"}>
          <span>
            {actionProgress.tone === "working"
              ? <LoaderCircle className="spin" size={20}/>
              : actionProgress.tone === "success"
                ? <CheckCircle2 size={20}/>
                : <X size={20}/>} 
          </span>
          <div><strong>{actionProgress.title}</strong><small>{actionProgress.detail}</small></div>
        </div>
      )}
    </>
  );
}

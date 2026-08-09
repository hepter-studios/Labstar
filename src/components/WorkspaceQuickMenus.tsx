import { Copy, Search, Settings2, Users, Webhook, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Menu =
  | { kind: "channel"; x: number; y: number; button: HTMLButtonElement; name: string }
  | { kind: "space"; x: number; y: number; button: HTMLButtonElement; name: string }
  | null;

const TRIGGER_ATTRIBUTE = "data-labstar-channel-menu-trigger";

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

export function WorkspaceQuickMenus() {
  const [menu, setMenu] = useState<Menu>(null);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const openChannelMenu = (button: HTMLButtonElement, x: number, y: number) => {
      setMenu({
        kind: "channel",
        x: Math.max(8, Math.min(x, window.innerWidth - 245)),
        y: Math.max(8, Math.min(y, window.innerHeight - 250)),
        button,
        name: channelName(button),
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
          openChannelMenu(button, rect.right - 225, rect.bottom + 6);
        });

        trigger.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          event.stopPropagation();
          const rect = trigger.getBoundingClientRect();
          openChannelMenu(button, rect.right - 225, rect.bottom + 6);
        });

        button.appendChild(trigger);
      });
    };

    const open = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const channel = target?.closest<HTMLButtonElement>(".channel-list > button");
      if (channel) {
        event.preventDefault();
        openChannelMenu(channel, event.clientX, event.clientY);
        return;
      }

      const space = target?.closest<HTMLButtonElement>(".space-list button");
      if (space) {
        event.preventDefault();
        setMenu({
          kind: "space",
          x: Math.max(8, Math.min(event.clientX, window.innerWidth - 245)),
          y: Math.max(8, Math.min(event.clientY, window.innerHeight - 200)),
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
    const observer = new MutationObserver(decorateChannels);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("contextmenu", open, true);
    document.addEventListener("pointerdown", close);
    window.addEventListener("keydown", escape);
    return () => {
      observer.disconnect();
      document.removeEventListener("contextmenu", open, true);
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", escape);
      document.querySelectorAll(`[${TRIGGER_ATTRIBUTE}]`).forEach((trigger) => trigger.remove());
    };
  }, []);

  if (!menu) return null;
  const activeMenu = menu;

  function openSelected() {
    activeMenu.button.click();
    setMenu(null);
  }

  function openSpaceSettings() {
    activeMenu.button.click();
    window.setTimeout(() => document.querySelector<HTMLButtonElement>('button[aria-label="Configurar espaço"]')?.click(), 30);
    setMenu(null);
  }

  function focusChannelSearch() {
    activeMenu.button.click();
    window.setTimeout(() => document.querySelector<HTMLInputElement>(".message-toolbar input")?.focus(), 30);
    setMenu(null);
  }

  function toggleMembers() {
    activeMenu.button.click();
    window.setTimeout(() => document.querySelector<HTMLButtonElement>('.channel-head-actions button[title="Mostrar membros"]')?.click(), 30);
    setMenu(null);
  }

  function openIntegrations() {
    activeMenu.button.click();
    window.setTimeout(() => document.querySelector<HTMLButtonElement>('.channel-head-actions button[title="Integrações e automações"]')?.click(), 30);
    setMenu(null);
  }

  return (
    <aside ref={ref} className="workspace-quick-menu" style={{ left: activeMenu.x, top: activeMenu.y }} onClick={(event) => event.stopPropagation()}>
      <header><strong>{activeMenu.kind === "channel" ? `# ${activeMenu.name}` : activeMenu.name}</strong><button type="button" onClick={() => setMenu(null)} aria-label="Fechar"><X size={12}/></button></header>
      <div>
        <button type="button" onClick={openSelected}>{activeMenu.kind === "channel" ? <Search size={14}/> : <Settings2 size={14}/>} Abrir {activeMenu.kind === "channel" ? "canal" : "Espaço"}</button>
        {activeMenu.kind === "channel" && <button type="button" onClick={focusChannelSearch}><Search size={14}/> Buscar neste canal</button>}
        <button type="button" onClick={() => { void copyText(activeMenu.kind === "channel" ? `#${activeMenu.name}` : activeMenu.name); setMenu(null); }}><Copy size={14}/> Copiar nome</button>
        {activeMenu.kind === "channel" && <button type="button" onClick={toggleMembers}><Users size={14}/> Alternar membros</button>}
        {activeMenu.kind === "channel" && <button type="button" onClick={openIntegrations}><Webhook size={14}/> Integrações</button>}
        {activeMenu.kind === "space" && <button type="button" onClick={openSpaceSettings}><Settings2 size={14}/> Configurações do Espaço</button>}
      </div>
    </aside>
  );
}

import { Copy, Search, Settings2, Users, Webhook, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Menu =
  | { kind: "channel"; x: number; y: number; button: HTMLButtonElement; name: string }
  | { kind: "space"; x: number; y: number; button: HTMLButtonElement; name: string }
  | null;

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

export function WorkspaceQuickMenus() {
  const [menu, setMenu] = useState<Menu>(null);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const open = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const channel = target?.closest<HTMLButtonElement>(".channel-list button");
      if (channel) {
        event.preventDefault();
        setMenu({ kind: "channel", x: Math.min(event.clientX, window.innerWidth - 245), y: Math.min(event.clientY, window.innerHeight - 245), button: channel, name: channel.querySelector("span")?.textContent?.trim() || "canal" });
        return;
      }
      const space = target?.closest<HTMLButtonElement>(".space-list button");
      if (space) {
        event.preventDefault();
        setMenu({ kind: "space", x: Math.min(event.clientX, window.innerWidth - 245), y: Math.min(event.clientY, window.innerHeight - 200), button: space, name: space.getAttribute("title")?.trim() || "Espaço" });
      }
    };
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setMenu(null);
    };
    const escape = (event: KeyboardEvent) => event.key === "Escape" && setMenu(null);
    document.addEventListener("contextmenu", open, true);
    document.addEventListener("pointerdown", close);
    window.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("contextmenu", open, true);
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", escape);
    };
  }, []);

  if (!menu) return null;

  function openSelected() {
    menu.button.click();
    setMenu(null);
  }

  function openSpaceSettings() {
    menu.button.click();
    window.setTimeout(() => document.querySelector<HTMLButtonElement>('button[aria-label="Configurar espaço"]')?.click(), 30);
    setMenu(null);
  }

  function focusChannelSearch() {
    menu.button.click();
    window.setTimeout(() => document.querySelector<HTMLInputElement>(".message-toolbar input")?.focus(), 30);
    setMenu(null);
  }

  function toggleMembers() {
    menu.button.click();
    window.setTimeout(() => document.querySelector<HTMLButtonElement>('.channel-head-actions button[title="Mostrar membros"]')?.click(), 30);
    setMenu(null);
  }

  function openIntegrations() {
    menu.button.click();
    window.setTimeout(() => document.querySelector<HTMLButtonElement>('.channel-head-actions button[title="Integrações e automações"]')?.click(), 30);
    setMenu(null);
  }

  return (
    <aside ref={ref} className="workspace-quick-menu" style={{ left: menu.x, top: menu.y }} onClick={(event) => event.stopPropagation()}>
      <header><strong>{menu.kind === "channel" ? `# ${menu.name}` : menu.name}</strong><button type="button" onClick={() => setMenu(null)} aria-label="Fechar"><X size={12}/></button></header>
      <div>
        <button type="button" onClick={openSelected}>{menu.kind === "channel" ? <Search size={14}/> : <Settings2 size={14}/>} Abrir {menu.kind === "channel" ? "canal" : "Espaço"}</button>
        {menu.kind === "channel" && <button type="button" onClick={focusChannelSearch}><Search size={14}/> Buscar neste canal</button>}
        <button type="button" onClick={() => { void copyText(menu.kind === "channel" ? `#${menu.name}` : menu.name); setMenu(null); }}><Copy size={14}/> Copiar nome</button>
        {menu.kind === "channel" && <button type="button" onClick={toggleMembers}><Users size={14}/> Alternar membros</button>}
        {menu.kind === "channel" && <button type="button" onClick={openIntegrations}><Webhook size={14}/> Integrações</button>}
        {menu.kind === "space" && <button type="button" onClick={openSpaceSettings}><Settings2 size={14}/> Configurações do Espaço</button>}
      </div>
    </aside>
  );
}

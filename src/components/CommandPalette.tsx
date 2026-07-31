import {
  Bell,
  CircleHelp,
  Command,
  LayoutDashboard,
  LogOut,
  Map,
  MessagesSquare,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";
import { secureSignOut } from "../lib/access";

type CommandItem = {
  id: string;
  title: string;
  description: string;
  keywords: string;
  icon: ComponentType<{ size?: number }>;
  dangerous?: boolean;
  run: () => void | Promise<void>;
};

function click(selector: string) {
  const target = document.querySelector<HTMLButtonElement>(selector);
  if (!target || target.disabled) return false;
  target.click();
  return true;
}

function clickButtonByText(containerSelector: string, text: string) {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(`${containerSelector} button`));
  const target = buttons.find((button) => button.textContent?.trim().toLocaleLowerCase() === text.toLocaleLowerCase());
  if (!target || target.disabled) return false;
  target.click();
  return true;
}

function afterPaint(callback: () => void, attempts = 8) {
  let remaining = attempts;
  const check = () => {
    if (remaining <= 0) return;
    remaining -= 1;
    window.requestAnimationFrame(() => {
      callback();
      if (!document.querySelector(".global-settings")) window.setTimeout(check, 25);
    });
  };
  check();
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [headerTarget, setHeaderTarget] = useState<Element | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const findTarget = () => setHeaderTarget(document.querySelector(".header-actions"));
    findTarget();
    const observer = new MutationObserver(findTarget);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLocaleLowerCase() === "p") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const commands = useMemo<CommandItem[]>(() => [
    {
      id: "overview",
      title: "Abrir visão geral",
      description: "Ir para o painel executivo do Labstar.",
      keywords: "inicio dashboard overview visão geral",
      icon: LayoutDashboard,
      run: () => { click('button[aria-label="Visão geral"]'); },
    },
    {
      id: "map",
      title: "Abrir mapa da organização",
      description: "Ir para empresas, projetos, produtos e relações.",
      keywords: "mapa organização empresas projetos estrutura",
      icon: Map,
      run: () => { click('button[aria-label="Mapa da organização"]'); },
    },
    {
      id: "collaboration",
      title: "Abrir Central de trabalho",
      description: "Ir para Espaços, canais, DMs e colaboração.",
      keywords: "central trabalho discord canais mensagens dm chat",
      icon: MessagesSquare,
      run: () => { click('button[aria-label="Central de trabalho"]'); },
    },
    {
      id: "team",
      title: "Abrir Equipe",
      description: "Gerenciar membros, cargos, áreas e acessos.",
      keywords: "equipe membros cargos pessoas permissões",
      icon: Users,
      run: () => { click('button[aria-label="Equipe"]'); },
    },
    {
      id: "settings",
      title: "Configurações do Labstar",
      description: "Conta, aparência, notificações, mídia e segurança.",
      keywords: "configuração conta aparência notificações audio video segurança",
      icon: Settings,
      run: () => { click('button[aria-label="Configurações do Labstar"]'); },
    },
    {
      id: "diagnostics",
      title: "Abrir diagnóstico do sistema",
      description: "Verificar app, rede, API Rust, banco e sessão.",
      keywords: "diagnóstico rust api banco rede sessão erro saúde health",
      icon: ShieldCheck,
      run: () => {
        if (!document.querySelector(".global-settings")) click('button[aria-label="Configurações do Labstar"]');
        afterPaint(() => {
          if (document.querySelector(".global-settings")) clickButtonByText(".global-settings-nav", "Segurança");
        });
      },
    },
    {
      id: "profile",
      title: "Abrir meu perfil",
      description: "Foto, nome, cargo e informações da conta.",
      keywords: "perfil conta avatar foto usuário",
      icon: UserRound,
      run: () => { click(".avatar-button"); },
    },
    {
      id: "notifications",
      title: "Abrir notificações",
      description: "Ver avisos, menções e atualizações recentes.",
      keywords: "notificações avisos menções alerta",
      icon: Bell,
      run: () => { click('button[aria-label="Notificações"]'); },
    },
    {
      id: "create",
      title: "Criar novo núcleo",
      description: "Adicionar uma empresa, projeto, produto ou área ao mapa.",
      keywords: "novo criar núcleo projeto empresa produto área",
      icon: Plus,
      run: () => { click(".create-button"); },
    },
    {
      id: "help",
      title: "Abrir ajuda",
      description: "Ver orientações rápidas e termos do ambiente.",
      keywords: "ajuda suporte termos privacidade",
      icon: CircleHelp,
      run: () => { click('button[aria-label="Ajuda"]'); },
    },
    {
      id: "logout",
      title: "Sair do Labstar",
      description: "Encerrar a sessão local com limpeza segura.",
      keywords: "sair logout desconectar trocar conta",
      icon: LogOut,
      dangerous: true,
      run: () => secureSignOut(),
    },
  ], []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return commands;
    const terms = normalized.split(/\s+/).filter(Boolean);
    return commands.filter((item) => {
      const haystack = `${item.title} ${item.description} ${item.keywords}`.toLocaleLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }, [commands, query]);

  useEffect(() => {
    setActive((current) => Math.min(current, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  async function execute(item: CommandItem | undefined) {
    if (!item) return;
    setOpen(false);
    setQuery("");
    await item.run();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((current) => filtered.length ? (current + 1) % filtered.length : 0);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => filtered.length ? (current - 1 + filtered.length) % filtered.length : 0);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      void execute(filtered[active]);
    }
  }

  const launcher = headerTarget ? createPortal(
    <button
      type="button"
      className="icon-button command-palette-launcher"
      aria-label="Central de comandos"
      data-tooltip="Comandos  Ctrl+Shift+P"
      onClick={() => setOpen(true)}
    >
      <Command size={16} />
    </button>,
    headerTarget,
  ) : null;

  return (
    <>
      {launcher}
      {open && createPortal(
        <div className="command-palette-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
          <section className="command-palette" role="dialog" aria-modal="true" aria-label="Central de comandos" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <Search size={17} />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => { setQuery(event.target.value); setActive(0); }}
                onKeyDown={onKeyDown}
                placeholder="Buscar ação, tela ou configuração…"
                aria-label="Buscar comando"
              />
              <kbd>ESC</kbd>
            </header>
            <div className="command-palette-list" role="listbox" aria-label="Comandos disponíveis">
              {filtered.map((item, index) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={active === index}
                    className={`${active === index ? "active" : ""} ${item.dangerous ? "danger" : ""}`}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => void execute(item)}
                  >
                    <span><Icon size={17} /></span>
                    <div><strong>{item.title}</strong><small>{item.description}</small></div>
                    {index === active && <kbd>ENTER</kbd>}
                  </button>
                );
              })}
              {!filtered.length && (
                <div className="command-palette-empty">
                  <Search size={20} />
                  <strong>Nenhum comando encontrado</strong>
                  <span>Tente “equipe”, “configurações”, “diagnóstico” ou “central”.</span>
                </div>
              )}
            </div>
            <footer>
              <span><kbd>↑</kbd><kbd>↓</kbd> navegar</span>
              <span><kbd>ENTER</kbd> executar</span>
              <span><kbd>CTRL</kbd><b>+</b><kbd>SHIFT</kbd><b>+</b><kbd>P</kbd> abrir</span>
            </footer>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}

import { Copy, ExternalLink, Github, Instagram, MessageSquare, Users, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getMemberProfileConnections, type PublicProfileConnections } from "../lib/profile-connections";
import { listMembers, type Member } from "../lib/supabase";
import { Avatar } from "./Avatar";

type MenuState = { x: number; y: number; member: Member } | null;

const emptyConnections: PublicProfileConnections = { github: null, instagramUsername: "" };

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function openDirectMessage(member: Member) {
  document.querySelector<HTMLButtonElement>('.workspace-dm-entry')?.click();
  window.setTimeout(() => {
    const input = document.querySelector<HTMLInputElement>(".dm-search input");
    if (input) {
      setInputValue(input, member.name);
      input.focus();
    }
    window.setTimeout(() => {
      const entries = Array.from(document.querySelectorAll<HTMLElement>(".dm-contact-entry"));
      const entry = entries.find((item) => item.querySelector("strong")?.textContent?.trim() === member.name);
      entry?.querySelector<HTMLButtonElement>(".dm-contact-main")?.click();
    }, 80);
  }, 80);
}

export function MemberQuickActions() {
  const [menu, setMenu] = useState<MenuState>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [connections, setConnections] = useState<PublicProfileConnections>(emptyConnections);
  const menuRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let cancelled = false;
    void listMembers().then((result) => {
      if (!cancelled) setMembers(result.members);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!menu) {
      setConnections(emptyConnections);
      return;
    }
    void getMemberProfileConnections(menu.member.id).then((result) => {
      if (!cancelled) setConnections(result);
    });
    return () => { cancelled = true; };
  }, [menu?.member.id]);

  useEffect(() => {
    const resolveMember = (target: HTMLElement | null) => {
      const row = target?.closest<HTMLElement>(".channel-member-row");
      if (!row) return null;
      const name = row.querySelector("b")?.textContent?.trim();
      if (!name) return null;
      return members.find((member) => member.name === name) ?? null;
    };

    const open = (event: MouseEvent) => {
      const member = resolveMember(event.target as HTMLElement | null);
      if (!member) return;
      const row = (event.target as HTMLElement).closest<HTMLElement>(".channel-member-row");
      if (!row) return;
      event.preventDefault();
      setMenu({ x: Math.min(event.clientX, window.innerWidth - 280), y: Math.min(event.clientY, window.innerHeight - 320), member });
    };

    const context = (event: MouseEvent) => {
      const member = resolveMember(event.target as HTMLElement | null);
      if (!member) return;
      event.preventDefault();
      setMenu({ x: Math.min(event.clientX, window.innerWidth - 280), y: Math.min(event.clientY, window.innerHeight - 320), member });
    };

    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(null);
    };
    const escape = (event: KeyboardEvent) => event.key === "Escape" && setMenu(null);

    document.addEventListener("click", open, true);
    document.addEventListener("contextmenu", context, true);
    document.addEventListener("pointerdown", close);
    window.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("click", open, true);
      document.removeEventListener("contextmenu", context, true);
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", escape);
    };
  }, [members]);

  if (!menu) return null;
  const role = menu.member.jobRoles[0];
  const hasConnections = Boolean(connections.github || connections.instagramUsername);

  return (
    <aside ref={menuRef} className="member-quick-card" style={{ left: menu.x, top: menu.y }} role="dialog" aria-label={`Ações para ${menu.member.name}`} onClick={(event) => event.stopPropagation()}>
      <button className="member-quick-close" type="button" onClick={() => setMenu(null)} aria-label="Fechar"><X size={13} /></button>
      <div className="member-quick-profile"><Avatar name={menu.member.name} url={menu.member.avatarUrl} size="lg" status={menu.member.status === "active" ? "online" : "offline"}/><div><strong>{menu.member.name}</strong><span>{role?.name || menu.member.jobTitle || menu.member.role}</span><small>{menu.member.area || menu.member.email}</small></div></div>
      {hasConnections && (
        <div className="member-quick-connections">
          <small>CONTAS CONECTADAS</small>
          {connections.github && <a href={connections.github.profileUrl} target="_blank" rel="noreferrer"><Github size={13}/><span>@{connections.github.username}</span><ExternalLink size={10}/></a>}
          {connections.instagramUsername && <a href={`https://www.instagram.com/${connections.instagramUsername}/`} target="_blank" rel="noreferrer"><Instagram size={13}/><span>@{connections.instagramUsername}</span><ExternalLink size={10}/></a>}
        </div>
      )}
      <div className="member-quick-actions">
        <button type="button" onClick={() => { openDirectMessage(menu.member); setMenu(null); }}><MessageSquare size={14}/> Mensagem</button>
        <button type="button" onClick={() => { void navigator.clipboard.writeText(menu.member.email); setMenu(null); }}><Copy size={14}/> Copiar e-mail</button>
        <button type="button" onClick={() => { document.querySelector<HTMLButtonElement>('button[aria-label="Equipe"]')?.click(); setMenu(null); }}><Users size={14}/> Abrir na Equipe</button>
      </div>
    </aside>
  );
}

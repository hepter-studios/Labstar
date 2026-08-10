import {
  AtSign,
  BriefcaseBusiness,
  Building2,
  Check,
  Copy,
  Hash,
  Mail,
  Server,
  ShieldCheck,
  Slash,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  listMembers,
  loadCollaboration,
  type CollaborationSpace,
  type LabstarChannel,
  type Member,
} from "../lib/supabase";
import { Avatar } from "./Avatar";

type FieldElement = HTMLInputElement | HTMLTextAreaElement;
type Trigger = "@" | "#" | "/";

type Suggestion =
  | { id: string; kind: "member"; member: Member }
  | { id: string; kind: "channel"; channel: LabstarChannel; spaceName: string }
  | { id: string; kind: "space"; space: CollaborationSpace }
  | { id: string; kind: "command"; command: CommandSuggestion };

type CommandSuggestion = {
  key: string;
  label: string;
  detail: string;
  snippet: string;
  cursorOffset?: number;
};

type AutocompleteState = {
  field: FieldElement;
  trigger: Trigger;
  query: string;
  tokenStart: number;
  cursor: number;
  position: {
    left: number;
    width: number;
    top?: number;
    bottom?: number;
  };
};

const COMMANDS: CommandSuggestion[] = [
  { key: "codigo", label: "Código", detail: "Inserir um bloco de código", snippet: "```\n\n```", cursorOffset: 4 },
  { key: "tarefa", label: "Tarefa", detail: "Criar um item marcável", snippet: "- [ ] " },
  { key: "citacao", label: "Citação", detail: "Inserir uma citação Markdown", snippet: "> " },
  { key: "titulo", label: "Título", detail: "Inserir um título Markdown", snippet: "# " },
  { key: "link", label: "Link", detail: "Inserir um link Markdown", snippet: "[texto](https://)", cursorOffset: 1 },
  { key: "separador", label: "Separador", detail: "Inserir uma linha divisória", snippet: "\n---\n" },
];

const PROFILE_SELECTOR = [
  ".chat-message > .user-avatar",
  ".chat-message .message-body header > strong",
  ".channel-member-row",
  ".channel-user .user-avatar",
  ".channel-user strong",
  ".dm-message > .user-avatar",
  ".dm-message-body header > strong",
  ".dm-conversation-person",
  ".dm-thread-intro > .user-avatar",
  ".dm-thread-intro > h2",
  ".dm-profile-hero",
  ".dm-own-profile",
  ".dm-contact-main .user-avatar",
  ".dm-contact-main strong",
  ".dm-home-contact-grid .user-avatar",
  ".dm-home-contact-grid strong",
  ".member-card .user-avatar",
  ".member-card strong",
  ".member-row .user-avatar",
  ".member-row strong",
].join(",");

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim();
}

function isComposer(field: FieldElement) {
  return Boolean(field.closest(".message-composer,.dm-composer"));
}

function supportsAutocomplete(field: FieldElement) {
  if (field.disabled || field.readOnly) return false;
  if (field instanceof HTMLInputElement) {
    const type = (field.type || "text").toLocaleLowerCase();
    if (!["text", "search", ""].includes(type)) return false;
  }
  if (field.matches(".dm-note-field,.project-markdown-input")) return false;
  return Boolean(field.closest([
    ".message-composer",
    ".dm-composer",
    ".dm-search",
    ".channel-search",
    ".message-toolbar",
    ".dm-conversation-actions",
    ".global-search",
    ".member-search",
  ].join(",")));
}

function fieldPosition(field: FieldElement) {
  const rect = field.getBoundingClientRect();
  const left = Math.max(10, Math.min(rect.left, window.innerWidth - 280));
  const width = Math.min(Math.max(rect.width, 320), window.innerWidth - left - 10);
  if (rect.top >= 240) {
    return { left, width, bottom: Math.max(10, window.innerHeight - rect.top + 8) };
  }
  return { left, width, top: Math.min(window.innerHeight - 210, rect.bottom + 8) };
}

function autocompleteFromField(field: FieldElement): AutocompleteState | null {
  if (!supportsAutocomplete(field)) return null;
  const cursor = field.selectionStart ?? field.value.length;
  const before = field.value.slice(0, cursor);
  const match = before.match(/(^|[\s([{])([@#/])([^\s@#/]{0,48})$/);
  if (!match) return null;
  const trigger = match[2] as Trigger;
  if (trigger === "/" && !isComposer(field)) return null;
  const query = match[3] ?? "";
  return {
    field,
    trigger,
    query,
    tokenStart: cursor - query.length - 1,
    cursor,
    position: fieldPosition(field),
  };
}

function setNativeFieldValue(field: FieldElement, value: string, cursor: number) {
  const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
  window.requestAnimationFrame(() => {
    field.focus();
    field.setSelectionRange(cursor, cursor);
  });
}

function memberNameFromTarget(element: Element) {
  const avatar = element.matches(".user-avatar") ? element : element.querySelector<HTMLElement>(".user-avatar");
  const avatarLabel = avatar?.getAttribute("aria-label") ?? "";
  if (/^Foto de\s+/i.test(avatarLabel)) return avatarLabel.replace(/^Foto de\s+/i, "").trim();

  if (element.matches("strong,h2,b")) return element.textContent?.trim() ?? "";
  const named = element.querySelector<HTMLElement>("strong,h2,b");
  return named?.textContent?.trim() ?? "";
}

function roleLabel(member: Member) {
  const labels: Record<Member["role"], string> = {
    owner: "Proprietário",
    admin: "Administrador",
    manager: "Gestor",
    member: "Membro",
    viewer: "Visualizador",
  };
  return labels[member.role] ?? member.role;
}

function statusLabel(member: Member) {
  if (member.status === "active") return "Ativo";
  if (member.status === "pending") return "Aguardando aprovação";
  return "Suspenso";
}

function formatLastSeen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sem registro recente";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MemberProfileModal({ member, onClose }: { member: Member; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(member.email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="universal-profile-backdrop" onMouseDown={onClose}>
      <section className="universal-profile-card" role="dialog" aria-modal="true" aria-label={`Perfil de ${member.name}`} onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div className="universal-profile-heading">
            <Avatar name={member.name} url={member.avatarUrl} size="xl" />
            <div>
              <small>PERFIL DO MEMBRO</small>
              <h2>{member.name}</h2>
              <p>{member.jobRoles[0]?.name || member.jobTitle || "Membro da equipe"}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar perfil"><X size={17} /></button>
        </header>

        <div className="universal-profile-status-row">
          <span className={`universal-profile-status ${member.status}`}><i />{statusLabel(member)}</span>
          <span><ShieldCheck size={13} /> {roleLabel(member)}</span>
          <span>Última atividade: {formatLastSeen(member.lastSeenAt)}</span>
        </div>

        <div className="universal-profile-info-grid">
          <section>
            <h3><BriefcaseBusiness size={14} /> Função</h3>
            <strong>{member.jobTitle || member.jobRoles[0]?.name || "Não informada"}</strong>
            <span>{member.area || member.jobRoles[0]?.department || "Área não informada"}</span>
          </section>
          <section>
            <h3><Building2 size={14} /> Área / departamento</h3>
            <strong>{member.jobRoles[0]?.department || member.area || "Geral"}</strong>
            <span>{member.jobRoles.length ? `${member.jobRoles.length} cargo(s) profissional(is)` : "Sem cargo profissional adicional"}</span>
          </section>
        </div>

        {!!member.jobRoles.length && (
          <section className="universal-profile-section">
            <h3>CARGOS</h3>
            <div className="universal-profile-chips">
              {member.jobRoles.map((role) => <span key={role.id} style={{ "--profile-role-color": role.color } as CSSProperties}><i />{role.name}</span>)}
            </div>
          </section>
        )}

        <section className="universal-profile-section">
          <h3>PROJETOS / RESPONSABILIDADES</h3>
          {member.assignments.length
            ? <div className="universal-profile-chips assignments">{member.assignments.map((assignment) => <span key={assignment}>{assignment}</span>)}</div>
            : <p>Nenhuma atribuição específica registrada no perfil.</p>}
        </section>

        <footer>
          <div><Mail size={14} /><span>{member.email}</span></div>
          <button type="button" onClick={() => void copyEmail()}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copiado" : "Copiar e-mail"}</button>
        </footer>
      </section>
    </div>
  );
}

export function UniversalProfileMentionBridge() {
  const [members, setMembers] = useState<Member[]>([]);
  const [spaces, setSpaces] = useState<CollaborationSpace[]>([]);
  const [channels, setChannels] = useState<LabstarChannel[]>([]);
  const [autocomplete, setAutocomplete] = useState<AutocompleteState | null>(null);
  const [selected, setSelected] = useState(0);
  const [profile, setProfile] = useState<Member | null>(null);
  const loadedAtRef = useRef(0);
  const loadingRef = useRef<Promise<void> | null>(null);

  const loadDirectory = useCallback(async (force = false) => {
    if (!force && Date.now() - loadedAtRef.current < 45_000) return;
    if (loadingRef.current) return loadingRef.current;
    const task = (async () => {
      const [membersResult, collaborationResult] = await Promise.allSettled([listMembers(), loadCollaboration()]);
      if (membersResult.status === "fulfilled") setMembers(membersResult.value.members);
      if (collaborationResult.status === "fulfilled") {
        setSpaces(collaborationResult.value.spaces);
        setChannels(collaborationResult.value.channels);
      }
      loadedAtRef.current = Date.now();
    })().finally(() => { loadingRef.current = null; });
    loadingRef.current = task;
    return task;
  }, []);

  useEffect(() => {
    void loadDirectory(true);
    const interval = window.setInterval(() => void loadDirectory(true), 60_000);
    return () => window.clearInterval(interval);
  }, [loadDirectory]);

  const memberByName = useMemo(() => {
    const map = new Map<string, Member>();
    for (const member of members) map.set(normalize(member.name), member);
    return map;
  }, [members]);

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!autocomplete) return [];
    const query = normalize(autocomplete.query);
    const scoreText = (value: string) => {
      const text = normalize(value);
      if (!query) return 1;
      if (text.startsWith(query)) return 3;
      if (text.includes(query)) return 2;
      return 0;
    };

    if (autocomplete.trigger === "@") {
      return members
        .filter((member) => member.status === "active")
        .map((member) => ({ member, score: Math.max(scoreText(member.name), scoreText(member.email), scoreText(member.jobRoles[0]?.name || member.jobTitle)) }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score || a.member.name.localeCompare(b.member.name))
        .slice(0, 10)
        .map(({ member }) => ({ id: `member:${member.id}`, kind: "member" as const, member }));
    }

    if (autocomplete.trigger === "#") {
      const spaceNameById = new Map(spaces.map((space) => [space.id, space.name]));
      const channelSuggestions = channels
        .map((channel) => ({ channel, score: Math.max(scoreText(channel.name), scoreText(channel.description), scoreText(spaceNameById.get(channel.spaceId) || "")) }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score || a.channel.name.localeCompare(b.channel.name))
        .slice(0, 8)
        .map(({ channel }) => ({ id: `channel:${channel.id}`, kind: "channel" as const, channel, spaceName: spaceNameById.get(channel.spaceId) || "Labstar" }));
      const spaceSuggestions = spaces
        .map((space) => ({ space, score: Math.max(scoreText(space.name), scoreText(space.description)) }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score || a.space.name.localeCompare(b.space.name))
        .slice(0, 4)
        .map(({ space }) => ({ id: `space:${space.id}`, kind: "space" as const, space }));
      return [...channelSuggestions, ...spaceSuggestions].slice(0, 10);
    }

    return COMMANDS
      .map((command) => ({ command, score: Math.max(scoreText(command.key), scoreText(command.label), scoreText(command.detail)) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.command.label.localeCompare(b.command.label))
      .map(({ command }) => ({ id: `command:${command.key}`, kind: "command" as const, command }));
  }, [autocomplete, channels, members, spaces]);

  const refreshForField = useCallback((field: FieldElement | null) => {
    if (!field) {
      setAutocomplete(null);
      return;
    }
    const next = autocompleteFromField(field);
    setAutocomplete(next);
    setSelected(0);
    if (next) void loadDirectory();
  }, [loadDirectory]);

  const chooseSuggestion = useCallback((suggestion: Suggestion) => {
    if (!autocomplete) return;
    const { field, tokenStart, cursor } = autocomplete;
    const composer = isComposer(field);
    const before = field.value.slice(0, tokenStart);
    const after = field.value.slice(cursor);
    let replacement = "";
    let finalCursor = 0;

    if (suggestion.kind === "member") {
      replacement = composer ? `@${suggestion.member.name} ` : suggestion.member.name;
      finalCursor = before.length + replacement.length;
    } else if (suggestion.kind === "channel") {
      replacement = composer ? `#${suggestion.channel.name} ` : suggestion.channel.name;
      finalCursor = before.length + replacement.length;
    } else if (suggestion.kind === "space") {
      replacement = composer ? `#${suggestion.space.name} ` : suggestion.space.name;
      finalCursor = before.length + replacement.length;
    } else {
      replacement = suggestion.command.snippet;
      finalCursor = before.length + (suggestion.command.cursorOffset ?? replacement.length);
    }

    setNativeFieldValue(field, `${before}${replacement}${after}`, finalCursor);
    setAutocomplete(null);
  }, [autocomplete]);

  useEffect(() => {
    const input = (event: Event) => {
      const field = event.target;
      if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) refreshForField(field);
    };
    const focus = (event: FocusEvent) => {
      const field = event.target;
      if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) refreshForField(field);
    };
    const click = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target) return;

      const profileTarget = target.closest(PROFILE_SELECTOR);
      if (profileTarget) {
        const name = memberNameFromTarget(profileTarget);
        const member = memberByName.get(normalize(name));
        if (member) {
          event.preventDefault();
          event.stopPropagation();
          setAutocomplete(null);
          setProfile(member);
          return;
        }
      }

      const field = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ? target : null;
      if (field) refreshForField(field);
      else if (!target.closest(".universal-autocomplete")) setAutocomplete(null);
    };
    document.addEventListener("input", input, true);
    document.addEventListener("focusin", focus, true);
    document.addEventListener("click", click, true);
    return () => {
      document.removeEventListener("input", input, true);
      document.removeEventListener("focusin", focus, true);
      document.removeEventListener("click", click, true);
    };
  }, [memberByName, refreshForField]);

  useEffect(() => {
    if (!autocomplete) return undefined;
    const reposition = () => setAutocomplete((current) => current ? { ...current, position: fieldPosition(current.field) } : current);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [autocomplete?.field]);

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (!autocomplete || !suggestions.length) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        setSelected((value) => (value + 1) % suggestions.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        setSelected((value) => (value - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        chooseSuggestion(suggestions[Math.min(selected, suggestions.length - 1)]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setAutocomplete(null);
      }
    };
    window.addEventListener("keydown", keyboard, true);
    return () => window.removeEventListener("keydown", keyboard, true);
  }, [autocomplete, chooseSuggestion, selected, suggestions]);

  return (
    <>
      {autocomplete && suggestions.length > 0 && (
        <section
          className="universal-autocomplete"
          style={{
            left: autocomplete.position.left,
            width: autocomplete.position.width,
            top: autocomplete.position.top,
            bottom: autocomplete.position.bottom,
          }}
          aria-label="Sugestões do Labstar"
        >
          <header>
            <div>
              {autocomplete.trigger === "@" ? <AtSign size={14} /> : autocomplete.trigger === "#" ? <Hash size={14} /> : <Slash size={14} />}
              <strong>{autocomplete.trigger === "@" ? "Mencionar pessoa" : autocomplete.trigger === "#" ? "Canal ou servidor" : "Comando rápido"}</strong>
            </div>
            <span>{autocomplete.query ? `“${autocomplete.query}”` : autocomplete.trigger === "@" ? "Equipe" : autocomplete.trigger === "#" ? "Labstar" : "Atalhos"}</span>
          </header>
          <div className="universal-autocomplete-list">
            {suggestions.map((suggestion, index) => (
              <button
                key={suggestion.id}
                type="button"
                className={selected === index ? "active" : ""}
                onPointerMove={() => setSelected(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => chooseSuggestion(suggestion)}
              >
                {suggestion.kind === "member" ? (
                  <>
                    <Avatar name={suggestion.member.name} url={suggestion.member.avatarUrl} size="sm" />
                    <span><strong>{suggestion.member.name}</strong><small>{suggestion.member.jobRoles[0]?.name || suggestion.member.jobTitle || suggestion.member.area || "Membro"}</small></span>
                    <em>@ pessoa</em>
                  </>
                ) : suggestion.kind === "channel" ? (
                  <>
                    <span className="universal-autocomplete-icon"><Hash size={15} /></span>
                    <span><strong>{suggestion.channel.name}</strong><small>{suggestion.spaceName}{suggestion.channel.description ? ` · ${suggestion.channel.description}` : ""}</small></span>
                    <em># canal</em>
                  </>
                ) : suggestion.kind === "space" ? (
                  <>
                    <span className="universal-autocomplete-icon"><Server size={15} /></span>
                    <span><strong>{suggestion.space.name}</strong><small>{suggestion.space.description || "Servidor / espaço de trabalho"}</small></span>
                    <em># servidor</em>
                  </>
                ) : (
                  <>
                    <span className="universal-autocomplete-icon"><Slash size={15} /></span>
                    <span><strong>/{suggestion.command.key}</strong><small>{suggestion.command.detail}</small></span>
                    <em>comando</em>
                  </>
                )}
              </button>
            ))}
          </div>
          <footer><span>↑↓ navegar</span><span>Enter/Tab inserir</span><span>Esc fechar</span></footer>
        </section>
      )}

      {profile && <MemberProfileModal member={profile} onClose={() => setProfile(null)} />}
    </>
  );
}

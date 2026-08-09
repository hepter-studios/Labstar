import {
  Check,
  Eye,
  EyeOff,
  Folder,
  LoaderCircle,
  LockKeyhole,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  getCurrentIdentity,
  listJobRoles,
  listMembers,
  loadCollaboration,
  supabaseClient,
  type CollaborationSpace,
  type JobRole,
  type Member,
  type MemberRole,
} from "../lib/supabase";

type CategoryAccess = {
  id: string;
  spaceId: string;
  name: string;
  isPrivate: boolean;
  readOnly: boolean;
  allowedRoles: MemberRole[];
  allowedJobRoleIds: string[];
  allowedMemberIds: string[];
};

type Directory = {
  member: Member;
  members: Member[];
  roles: JobRole[];
  spaces: CollaborationSpace[];
  categories: CategoryAccess[];
  canManage: boolean;
};

const TRIGGER = "data-labstar-category-access";
const accessLevels: Array<{ value: MemberRole; label: string; detail: string }> = [
  { value: "manager", label: "Gestores", detail: "Liderança operacional" },
  { value: "member", label: "Membros", detail: "Equipe padrão" },
  { value: "viewer", label: "Convidados", detail: "Acesso limitado" },
];

function stringArray(value: unknown) {
  return Array.isArray(value) ? [...new Set(value.map(String).filter(Boolean))] : [];
}

function roleArray(value: unknown): MemberRole[] {
  const valid = new Set<MemberRole>(["owner", "admin", "manager", "member", "viewer"]);
  return stringArray(value).filter((item): item is MemberRole => valid.has(item as MemberRole));
}

function canManageCategories(member: Member) {
  return member.role === "owner"
    || member.role === "admin"
    || member.jobRoles.some((role) => role.permissions.includes("manage_channels") || role.permissions.includes("manage_private_channels"));
}

async function loadDirectory(): Promise<Directory> {
  if (!supabaseClient) throw new Error("supabase_not_configured");
  const identity = await getCurrentIdentity();
  if (!identity?.member) throw new Error("active_member_required");

  const [team, roles, collaboration, categoryResult] = await Promise.all([
    listMembers(),
    listJobRoles(),
    loadCollaboration(),
    supabaseClient
      .from("channel_categories")
      .select("id,space_id,name,is_private,read_only,allowed_roles,allowed_job_roles,allowed_member_ids")
      .order("position", { ascending: true }),
  ]);

  if (categoryResult.error) throw categoryResult.error;

  return {
    member: identity.member,
    members: team.members.filter((item) => item.status === "active"),
    roles,
    spaces: collaboration.spaces,
    categories: (categoryResult.data ?? []).map((row) => ({
      id: String(row.id),
      spaceId: String(row.space_id),
      name: String(row.name ?? "categoria"),
      isPrivate: Boolean(row.is_private),
      readOnly: Boolean(row.read_only),
      allowedRoles: roleArray(row.allowed_roles),
      allowedJobRoleIds: stringArray(row.allowed_job_roles),
      allowedMemberIds: stringArray(row.allowed_member_ids),
    })),
    canManage: canManageCategories(identity.member),
  };
}

function settingsSvg() {
  return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.72l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z"/><circle cx="12" cy="12" r="3"/></svg>`;
}

function visibleCategoryName(header: HTMLElement) {
  return header.querySelector<HTMLElement>("button span, span")?.textContent?.trim().toLocaleLowerCase() ?? "";
}

export function CategoryAccessPortal() {
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [editing, setEditing] = useState<CategoryAccess | null>(null);
  const [draft, setDraft] = useState<CategoryAccess | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [roleSearch, setRoleSearch] = useState("");
  const refreshTimer = useRef(0);

  async function refresh() {
    try {
      const next = await loadDirectory();
      setDirectory(next);
      if (editing) {
        const updated = next.categories.find((item) => item.id === editing.id);
        if (updated) {
          setEditing(updated);
          setDraft(updated);
        }
      }
    } catch {
      // Durante rollout da migração o restante da Central continua funcionando.
    }
  }

  useEffect(() => { void refresh(); }, []);

  useEffect(() => {
    if (!directory?.canManage) return;

    const decorate = () => {
      const currentSpaceName = document.querySelector<HTMLElement>(".space-title strong")?.textContent?.trim().toLocaleLowerCase() ?? "";
      const space = directory.spaces.find((item) => item.name.trim().toLocaleLowerCase() === currentSpaceName) ?? directory.spaces[0];
      if (!space) return;

      document.querySelectorAll<HTMLElement>(".channel-category > header").forEach((header) => {
        const name = visibleCategoryName(header);
        const category = directory.categories.find((item) => item.spaceId === space.id && item.name.trim().toLocaleLowerCase() === name);
        if (!category) return;
        header.dataset.categoryId = category.id;
        if (header.querySelector(`[${TRIGGER}]`)) return;
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute(TRIGGER, category.id);
        button.setAttribute("title", "Editar categoria e acesso");
        button.setAttribute("aria-label", `Editar categoria ${category.name}`);
        button.className = "category-access-trigger";
        button.innerHTML = settingsSvg();
        header.appendChild(button);
      });
    };

    const click = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest<HTMLElement>(`[${TRIGGER}]`);
      if (!button) return;
      const id = button.getAttribute(TRIGGER) ?? "";
      const category = directory.categories.find((item) => item.id === id);
      if (!category) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setEditing(category);
      setDraft({ ...category, allowedRoles: [...category.allowedRoles], allowedJobRoleIds: [...category.allowedJobRoleIds], allowedMemberIds: [...category.allowedMemberIds] });
      setMemberSearch("");
      setRoleSearch("");
      setNotice("");
    };

    decorate();
    const observer = new MutationObserver(decorate);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    document.addEventListener("click", click, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("click", click, true);
      document.querySelectorAll(`[${TRIGGER}]`).forEach((node) => node.remove());
    };
  }, [directory]);

  useEffect(() => {
    const rerun = () => {
      window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => void refresh(), 160);
    };
    window.addEventListener("labstar:collaboration-refreshed", rerun);
    return () => {
      window.clearTimeout(refreshTimer.current);
      window.removeEventListener("labstar:collaboration-refreshed", rerun);
    };
  }, [editing]);

  async function save() {
    if (!draft || !supabaseClient || saving) return;
    setSaving(true);
    setNotice("");
    try {
      const { error } = await supabaseClient.from("channel_categories").update({
        name: draft.name.trim(),
        is_private: draft.isPrivate,
        read_only: draft.readOnly,
        allowed_roles: draft.isPrivate ? [...new Set<MemberRole>(["owner", "admin", ...draft.allowedRoles.filter((role) => role !== "owner" && role !== "admin")])] : [],
        allowed_job_roles: draft.isPrivate ? [...new Set(draft.allowedJobRoleIds)] : [],
        allowed_member_ids: draft.isPrivate ? [...new Set(draft.allowedMemberIds)] : [],
      }).eq("id", draft.id);
      if (error) throw error;
      setNotice("Categoria atualizada.");
      window.dispatchEvent(new CustomEvent("labstar:refresh-collaboration"));
      window.setTimeout(() => {
        setEditing(null);
        setDraft(null);
        void refresh();
      }, 180);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error ?? "");
      setNotice(/42501|permission|denied/i.test(text)
        ? "Sua conta não tem permissão para editar esta categoria."
        : /column|schema cache|allowed_job_roles|is_private/i.test(text)
          ? "A atualização de permissões por categoria ainda está sendo aplicada no banco."
          : "Não foi possível salvar a categoria agora.");
    } finally {
      setSaving(false);
    }
  }

  if (!directory || !editing || !draft) return null;

  return createPortal(
    <CategoryAccessModal
      directory={directory}
      draft={draft}
      saving={saving}
      notice={notice}
      memberSearch={memberSearch}
      roleSearch={roleSearch}
      onDraft={setDraft}
      onMemberSearch={setMemberSearch}
      onRoleSearch={setRoleSearch}
      onClose={() => !saving && (setEditing(null), setDraft(null))}
      onSave={() => void save()}
    />,
    document.body,
  );
}

function CategoryAccessModal({ directory, draft, saving, notice, memberSearch, roleSearch, onDraft, onMemberSearch, onRoleSearch, onClose, onSave }: {
  directory: Directory;
  draft: CategoryAccess;
  saving: boolean;
  notice: string;
  memberSearch: string;
  roleSearch: string;
  onDraft: (value: CategoryAccess) => void;
  onMemberSearch: (value: string) => void;
  onRoleSearch: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const filteredMembers = useMemo(() => {
    const query = memberSearch.trim().toLocaleLowerCase();
    return directory.members.filter((member) => member.id !== directory.member.id && (!query || `${member.name} ${member.email} ${member.jobTitle} ${member.area}`.toLocaleLowerCase().includes(query)));
  }, [directory.member.id, directory.members, memberSearch]);

  const filteredRoles = useMemo(() => {
    const query = roleSearch.trim().toLocaleLowerCase();
    return directory.roles.filter((role) => !query || `${role.name} ${role.department}`.toLocaleLowerCase().includes(query));
  }, [directory.roles, roleSearch]);

  const toggleLevel = (role: MemberRole) => onDraft({ ...draft, allowedRoles: draft.allowedRoles.includes(role) ? draft.allowedRoles.filter((item) => item !== role) : [...draft.allowedRoles, role] });
  const toggleRole = (id: string) => onDraft({ ...draft, allowedJobRoleIds: draft.allowedJobRoleIds.includes(id) ? draft.allowedJobRoleIds.filter((item) => item !== id) : [...draft.allowedJobRoleIds, id] });
  const toggleMember = (id: string) => onDraft({ ...draft, allowedMemberIds: draft.allowedMemberIds.includes(id) ? draft.allowedMemberIds.filter((item) => item !== id) : [...draft.allowedMemberIds, id] });
  const explicit = draft.allowedRoles.length + draft.allowedJobRoleIds.length + draft.allowedMemberIds.length;

  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && !saving && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose, saving]);

  return (
    <div className="channel-access-backdrop category-access-backdrop" onMouseDown={() => !saving && onClose()}>
      <section className="channel-access-modal category-access-modal" role="dialog" aria-modal="true" aria-label={`Permissões da categoria ${draft.name}`} onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><span>{draft.isPrivate ? <LockKeyhole size={18} /> : <Folder size={18} />}</span><div><strong>{draft.name || "Categoria"}</strong><p>Acesso definido aqui é herdado pelos canais da categoria.</p></div></div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Fechar"><X size={17} /></button>
        </header>

        <div className="channel-access-scroll category-access-scroll">
          <section className="channel-access-section category-access-section">
            <div className="channel-access-section-title"><Settings2 size={15} /><div><strong>Categoria</strong></div></div>
            <label>Nome<input value={draft.name} maxLength={60} onChange={(event) => onDraft({ ...draft, name: event.target.value })} /></label>
          </section>

          <section className="channel-access-section category-access-section">
            <div className="channel-access-section-title"><Eye size={15} /><div><strong>Visibilidade</strong><small>Os canais herdam esta regra automaticamente.</small></div></div>
            <div className="channel-visibility-choice">
              <button type="button" className={!draft.isPrivate ? "active" : ""} onClick={() => onDraft({ ...draft, isPrivate: false })}><Eye size={17} /><span><b>Pública</b><small>Todos os membros ativos</small></span>{!draft.isPrivate && <Check size={15} />}</button>
              <button type="button" className={draft.isPrivate ? "active" : ""} onClick={() => onDraft({ ...draft, isPrivate: true })}><LockKeyhole size={17} /><span><b>Privada</b><small>Somente pessoas autorizadas</small></span>{draft.isPrivate && <Check size={15} />}</button>
            </div>

            {draft.isPrivate && <div className="channel-restrictions">
              <div className="channel-access-note"><ShieldCheck size={15} /><span><b>Proprietário e administradores mantêm acesso.</b><small>Isso evita categorias impossíveis de administrar.</small></span></div>

              <fieldset>
                <legend>Níveis de acesso</legend>
                <div className="channel-level-grid">{accessLevels.map((level) => <label key={level.value} className={draft.allowedRoles.includes(level.value) ? "active" : ""}><input type="checkbox" checked={draft.allowedRoles.includes(level.value)} onChange={() => toggleLevel(level.value)} /><span><b>{level.label}</b><small>{level.detail}</small></span></label>)}</div>
              </fieldset>

              <fieldset>
                <legend>Cargos profissionais</legend>
                <label className="channel-access-search"><Search size={13} /><input value={roleSearch} onChange={(event) => onRoleSearch(event.target.value)} placeholder="Buscar cargo" /></label>
                <div className="channel-role-grid">{filteredRoles.map((role) => <label key={role.id} className={draft.allowedJobRoleIds.includes(role.id) ? "active" : ""} style={{ "--role-color": role.color } as React.CSSProperties}><input type="checkbox" checked={draft.allowedJobRoleIds.includes(role.id)} onChange={() => toggleRole(role.id)} /><i /><span><b>{role.name}</b><small>{role.department}</small></span></label>)}</div>
              </fieldset>

              <fieldset>
                <legend>Pessoas específicas</legend>
                <label className="channel-access-search"><Search size={13} /><input value={memberSearch} onChange={(event) => onMemberSearch(event.target.value)} placeholder="Buscar pessoa" /></label>
                <div className="channel-member-access-list">{filteredMembers.map((member) => <label key={member.id} className={draft.allowedMemberIds.includes(member.id) ? "active" : ""}><input type="checkbox" checked={draft.allowedMemberIds.includes(member.id)} onChange={() => toggleMember(member.id)} /><span className="channel-member-monogram">{member.name.slice(0, 2).toUpperCase()}</span><span><b>{member.name}</b><small>{member.jobRoles[0]?.name || member.jobTitle || member.area || "Membro"}</small></span></label>)}</div>
              </fieldset>

              {explicit === 0 && <div className="channel-access-warning"><EyeOff size={15} /><span>Sem grupos selecionados, somente a administração poderá ver esta categoria.</span></div>}
            </div>}
          </section>

          <section className="channel-access-section compact category-access-section">
            <div className="channel-access-section-title"><Users size={15} /><div><strong>Publicação</strong></div></div>
            <label className="channel-readonly-toggle"><input type="checkbox" checked={draft.readOnly} onChange={(event) => onDraft({ ...draft, readOnly: event.target.checked })} /><span><b>Somente leitura</b><small>Os canais herdados ficam disponíveis para leitura, mas a equipe comum não publica.</small></span><i /></label>
          </section>
        </div>

        <footer>
          <div>{notice && <span role="status">{notice}</span>}</div>
          <div><button type="button" onClick={onClose} disabled={saving}>Cancelar</button><button type="button" className="primary" onClick={onSave} disabled={saving || draft.name.trim().length < 2}>{saving ? <LoaderCircle className="spin" size={14} /> : <Save size={14} />} {saving ? "Salvando…" : "Salvar"}</button></div>
        </footer>
      </section>
    </div>
  );
}

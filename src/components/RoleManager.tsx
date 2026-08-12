import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  LoaderCircle,
  Plus,
  Save,
  Search,
  Shield,
  Star,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  createJobRole,
  deleteJobRole,
  listJobRoles,
  updateJobRole,
  type JobRole,
} from "../lib/supabase";

const permissionOptions = [
  { permission: "manage_members", label: "Gerenciar membros", detail: "Editar dados organizacionais e acesso de pessoas comuns. Owner e administradores continuam protegidos." },
  { permission: "manage_roles", label: "Gerenciar cargos profissionais", detail: "Criar, editar, ordenar e remover cargos da empresa." },
  { permission: "create_channels", label: "Criar canais", detail: "Criar canais e categorias sem receber administração total." },
  { permission: "manage_channels", label: "Gerenciar canais", detail: "Editar canais, categorias, integrações e configurações gerais." },
  { permission: "manage_private_channels", label: "Gerenciar acesso privado", detail: "Configurar quem pode ver categorias e canais restritos." },
  { permission: "moderate_content", label: "Moderar mensagens", detail: "Fixar, remover ou organizar conteúdo de outras pessoas." },
  { permission: "manage_projects", label: "Editar projetos e mapa", detail: "Alterar projetos, núcleos, progresso e documentação." },
  { permission: "publish_social", label: "Aprovar e publicar conteúdo", detail: "Gerenciar o planejamento social e suas aprovações." },
  { permission: "view_financial", label: "Visualizar financeiro", detail: "Acessar informações financeiras quando essa área estiver habilitada." },
] as const;

const departments = [
  "Diretoria",
  "Gestão / Liderança",
  "Tecnologia",
  "Design / Produto",
  "Comercial / Vendas",
  "Marketing",
  "Financeiro / Administrativo",
  "Recursos Humanos",
  "Jurídico",
  "Operações / Produção",
  "Nível de entrada",
  "Outros",
];

const devPreviewRoles: JobRole[] = [
  { id: "preview-ceo", name: "CEO", department: "Diretoria", color: "#ef5b62", icon: "star", position: 1, permissions: ["manage_members", "manage_roles"] },
  { id: "preview-cso", name: "CSO", department: "Diretoria Científica", color: "#8B1E3F", icon: "star", position: 2, permissions: ["manage_projects"] },
];

export function RoleBadge({ role, compact = false }: { role: JobRole; compact?: boolean }) {
  return (
    <span className={`professional-role-badge ${compact ? "compact" : ""}`} style={{ "--role-color": role.color } as React.CSSProperties}>
      <i><Shield size={compact ? 15 : 18} fill="currentColor" /><Star size={compact ? 7 : 8} fill="#080a0f" /></i>
      <b>{role.name}</b>
    </span>
  );
}

export function RoleManager() {
  const isDevPreview = import.meta.env.DEV && new URLSearchParams(window.location.search).has("preview");
  const [roles, setRoles] = useState<JobRole[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<Omit<JobRole, "id">>({
    name: "",
    department: "Outros",
    color: "#8baeff",
    icon: "star",
    position: 100,
    permissions: [],
  });
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  async function refresh(preferredId?: string) {
    const data = isDevPreview ? devPreviewRoles : await listJobRoles();
    setRoles(data);
    const id = preferredId || selectedId || data[0]?.id || "";
    setSelectedId(id);
    const selected = data.find((role) => role.id === id) ?? data[0];
    if (selected) setDraft({ ...selected });
  }

  useEffect(() => { void refresh(); }, []);

  const grouped = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return departments.map((department) => ({
      department,
      roles: roles.filter((role) => role.department === department && (!query || `${role.name} ${role.permissions.join(" ")}`.toLocaleLowerCase().includes(query))),
    })).filter((group) => group.roles.length);
  }, [roles, search]);

  function select(role: JobRole) {
    setSelectedId(role.id);
    setDraft({ ...role, permissions: [...role.permissions] });
    setMessage("");
    setDeleteConfirm(false);
  }

  function startNew() {
    setSelectedId("");
    setDraft({
      name: "Novo cargo",
      department: "Outros",
      color: "#8baeff",
      icon: "star",
      position: Math.max(0, ...roles.map((role) => role.position)) + 1,
      permissions: [],
    });
    setMessage("");
    setDeleteConfirm(false);
  }

  function duplicateCurrent() {
    if (!selectedId) return;
    setSelectedId("");
    setDraft((current) => ({
      ...current,
      name: `${current.name} — cópia`,
      position: Math.max(0, ...roles.map((role) => role.position)) + 1,
      permissions: [...current.permissions],
    }));
    setDeleteConfirm(false);
    setMessage("Cópia preparada. Revise e salve como um novo cargo.");
  }

  async function save() {
    setSaving(true);
    setMessage("");
    setDeleteConfirm(false);
    try {
      if (isDevPreview) {
        const nextId = selectedId || `preview-role-${Date.now()}`;
        const nextRole = { ...draft, id: nextId };
        setRoles((current) => selectedId
          ? current.map((role) => role.id === selectedId ? nextRole : role)
          : [...current, nextRole]);
        setSelectedId(nextId);
        setDraft({ ...nextRole });
        setMessage("Cargo profissional salvo");
        return;
      }
      if (selectedId) {
        await updateJobRole(selectedId, draft);
        await refresh(selectedId);
      } else {
        const created = await createJobRole(draft);
        await refresh(created.id);
      }
      setMessage("Cargo profissional salvo");
    } catch {
      setMessage("Não foi possível salvar o cargo. Verifique sua permissão administrativa.");
    } finally {
      setSaving(false);
    }
  }

  async function move(direction: -1 | 1) {
    if (!selectedId) return;
    const ordered = [...roles].sort((a, b) => a.position - b.position);
    const index = ordered.findIndex((role) => role.id === selectedId);
    const target = ordered[index + direction];
    const current = ordered[index];
    if (!current || !target) return;
    if (isDevPreview) {
      setRoles((items) => items.map((role) => {
        if (role.id === current.id) return { ...role, position: target.position };
        if (role.id === target.id) return { ...role, position: current.position };
        return role;
      }));
      setDraft((value) => ({ ...value, position: target.position }));
      return;
    }
    await Promise.all([
      updateJobRole(current.id, { position: target.position }),
      updateJobRole(target.id, { position: current.position }),
    ]);
    await refresh(selectedId);
  }

  async function removeSelectedRole() {
    if (!selectedId || saving) return;
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      setMessage("Clique novamente para excluir este cargo. As pessoas permanecem na equipe e apenas perdem a atribuição.");
      return;
    }
    setSaving(true);
    setMessage("Excluindo cargo…");
    try {
      if (isDevPreview) {
        const remaining = roles.filter((role) => role.id !== selectedId);
        const next = remaining.sort((a, b) => a.position - b.position)[0];
        setRoles(remaining);
        setSelectedId(next?.id ?? "");
        if (next) setDraft({ ...next, permissions: [...next.permissions] });
        setDeleteConfirm(false);
        setMessage("Cargo removido.");
        return;
      }
      await deleteJobRole(selectedId);
      setSelectedId("");
      setDeleteConfirm(false);
      setMessage("Cargo removido.");
      await refresh();
    } catch {
      setDeleteConfirm(false);
      setMessage("Não foi possível excluir este cargo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="roles-manager professional-roles-manager">
      <aside className="roles-list-panel">
        <header>
          <div><strong>Cargos profissionais</strong><small>{roles.length} cargos configurados</small></div>
          <button onClick={startNew}><Plus size={15} /> Criar cargo</button>
        </header>
        <label className="roles-search"><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cargo ou permissão" /></label>
        <div className="roles-scroll">
          {grouped.map((group) => (
            <section key={group.department}>
              <h3>{group.department}</h3>
              {group.roles.map((role) => (
                <button key={role.id} className={selectedId === role.id ? "active" : ""} onClick={() => select(role)}>
                  <RoleBadge role={role} compact />
                  <span>{role.permissions.length ? `${role.permissions.length} permissões` : "sem permissão extra"}</span>
                </button>
              ))}
            </section>
          ))}
        </div>
      </aside>

      <main className="role-editor">
        <header>
          <div>
            <span className="role-preview-icon" style={{ "--role-color": draft.color } as React.CSSProperties}><Shield size={26} fill="currentColor" /><Star size={12} fill="#080a0f" /></span>
            <div><small>{selectedId ? "Editar cargo" : "Novo cargo"}</small><strong>{draft.name || "Sem nome"}</strong></div>
          </div>
          <div className="role-order">
            {selectedId && <button onClick={duplicateCurrent} title="Duplicar este cargo"><Copy size={15} /></button>}
            <button onClick={() => void move(-1)} title="Subir na hierarquia"><ChevronUp size={16} /></button>
            <button onClick={() => void move(1)} title="Descer na hierarquia"><ChevronDown size={16} /></button>
          </div>
        </header>

        <div className="role-editor-scroll">
          <div className="professional-role-explainer">
            <ShieldCheckCopy />
            <div><strong>Cargo profissional e nível de acesso são coisas diferentes.</strong><p>O cargo representa a função da pessoa. Permissões extras só devem ser concedidas quando forem necessárias.</p></div>
          </div>

          <section className="role-identity-section">
            <header><div><strong>Identidade do cargo</strong><small>Nome, departamento e cor usados em perfis e mensagens.</small></div><RoleBadge role={{ ...draft, id: selectedId }} /></header>
            <div className="role-form-grid">
              <label className="full">Nome do cargo<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Ex.: Desenvolvedor Front-end" /></label>
              <label className="full">Departamento<select value={draft.department} onChange={(event) => setDraft({ ...draft, department: event.target.value })}>{departments.map((department) => <option key={department}>{department}</option>)}</select></label>
              <label className="full role-color-field">Cor<input type="color" value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} /><span>{draft.color.toUpperCase()}</span><div>{["#ef5b62", "#8B1E3F", "#f39c5a", "#4f9cff", "#b67cff", "#32c5a4", "#ff72ad", "#d2a93b", "#74bf70", "#8d98aa"].map((color) => <button key={color} type="button" style={{ background: color }} onClick={() => setDraft({ ...draft, color })} aria-label={`Usar cor ${color}`} /> )}</div></label>
            </div>
          </section>

          <fieldset className="permission-grid professional-permission-grid">
            <legend>Permissões adicionais</legend>
            <p>Deixe tudo desmarcado quando o cargo for somente visual.</p>
            {permissionOptions.map(({ permission, label, detail }) => (
              <label key={permission} className={draft.permissions.includes(permission) ? "active" : ""}>
                <input type="checkbox" checked={draft.permissions.includes(permission)} onChange={() => setDraft({
                  ...draft,
                  permissions: draft.permissions.includes(permission)
                    ? draft.permissions.filter((item) => item !== permission)
                    : [...draft.permissions, permission],
                })} />
                <span><Shield size={15} /><span><b>{label}</b><small>{detail}</small></span></span>
              </label>
            ))}
          </fieldset>
        </div>

        <footer>
          {selectedId && <button className={`danger-text ${deleteConfirm ? "confirm" : ""}`} disabled={saving} onClick={() => void removeSelectedRole()}><Trash2 size={14} /> {deleteConfirm ? "Confirmar exclusão" : "Excluir cargo"}</button>}
          <span>{message}</span>
          <button className="primary" disabled={saving || draft.name.trim().length < 2} onClick={() => void save()}>
            {saving ? <LoaderCircle className="spin" size={15} /> : message === "Cargo profissional salvo" ? <Check size={15} /> : <Save size={15} />}
            {saving ? "Salvando…" : "Salvar cargo"}
          </button>
        </footer>
      </main>
    </section>
  );
}

function ShieldCheckCopy() {
  return <span className="professional-role-info-icon"><Shield size={17} /><Check size={10} /></span>;
}

import {
  Check,
  ChevronDown,
  ChevronUp,
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
  ["manage_members", "Gerenciar pessoas"],
  ["manage_channels", "Gerenciar espaços e canais"],
  ["manage_projects", "Editar projetos e mapa"],
  ["publish_social", "Aprovar e publicar conteúdo"],
  ["moderate_content", "Moderar mensagens"],
  ["view_financial", "Visualizar financeiro"],
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

export function RoleBadge({ role, compact = false }: { role: JobRole; compact?: boolean }) {
  return (
    <span className={`professional-role-badge ${compact ? "compact" : ""}`} style={{ "--role-color": role.color } as React.CSSProperties}>
      <i><Shield size={compact ? 15 : 18} fill="currentColor" /><Star size={compact ? 7 : 8} fill="#080a0f" /></i>
      <b>{role.name}</b>
    </span>
  );
}

export function RoleManager() {
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

  async function refresh(preferredId?: string) {
    const data = await listJobRoles();
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
      roles: roles.filter((role) => role.department === department && (!query || role.name.toLocaleLowerCase().includes(query))),
    })).filter((group) => group.roles.length);
  }, [roles, search]);

  function select(role: JobRole) {
    setSelectedId(role.id);
    setDraft({ ...role });
    setMessage("");
  }

  function startNew() {
    setSelectedId("");
    setDraft({
      name: "Novo cargo",
      department: "Outros",
      color: "#8baeff",
      icon: "star",
      position: Math.max(100, ...roles.map((role) => role.position)) + 1,
      permissions: [],
    });
    setMessage("");
  }

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      if (selectedId) {
        await updateJobRole(selectedId, draft);
        await refresh(selectedId);
      } else {
        const created = await createJobRole(draft);
        await refresh(created.id);
      }
      setMessage("Cargo salvo");
    } catch {
      setMessage("Não foi possível salvar o cargo");
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
    await Promise.all([
      updateJobRole(current.id, { position: target.position }),
      updateJobRole(target.id, { position: current.position }),
    ]);
    await refresh(selectedId);
  }

  return (
    <section className="roles-manager">
      <aside className="roles-list-panel">
        <header>
          <div><strong>Cargos profissionais</strong><small>{roles.length} cargos configurados</small></div>
          <button onClick={startNew}><Plus size={15} /> Criar cargo</button>
        </header>
        <label className="roles-search"><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cargo" /></label>
        <div className="roles-scroll">
          {grouped.map((group) => (
            <section key={group.department}>
              <h3>{group.department}</h3>
              {group.roles.map((role) => (
                <button key={role.id} className={selectedId === role.id ? "active" : ""} onClick={() => select(role)}>
                  <RoleBadge role={role} compact />
                  <span>posição {role.position}</span>
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
            <div><small>{selectedId ? "EDITAR CARGO" : "NOVO CARGO"}</small><strong>{draft.name || "Sem nome"}</strong></div>
          </div>
          <div className="role-order">
            <button onClick={() => void move(-1)} title="Subir na hierarquia"><ChevronUp size={16} /></button>
            <button onClick={() => void move(1)} title="Descer na hierarquia"><ChevronDown size={16} /></button>
          </div>
        </header>

        <div className="role-preview">
          <span>Prévia nas mensagens e na equipe</span>
          <RoleBadge role={{ ...draft, id: selectedId }} />
        </div>

        <div className="role-form-grid">
          <label className="full">Nome do cargo<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Ex.: Desenvolvedor Front-end" /></label>
          <label>Departamento<select value={draft.department} onChange={(event) => setDraft({ ...draft, department: event.target.value })}>{departments.map((department) => <option key={department}>{department}</option>)}</select></label>
          <label>Posição hierárquica<input type="number" min="1" max="999" value={draft.position} onChange={(event) => setDraft({ ...draft, position: Number(event.target.value) })} /></label>
          <label className="full role-color-field">Cor sólida<input type="color" value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} /><span>{draft.color.toUpperCase()}</span><div>{["#ef5b62", "#f39c5a", "#4f9cff", "#b67cff", "#32c5a4", "#ff72ad", "#d2a93b", "#74bf70", "#8d98aa"].map((color) => <button key={color} type="button" style={{ background: color }} onClick={() => setDraft({ ...draft, color })} aria-label={`Usar cor ${color}`} /> )}</div></label>
        </div>

        <fieldset className="permission-grid">
          <legend>Permissões específicas</legend>
          <p>O nível técnico de acesso continua separado do cargo profissional.</p>
          {permissionOptions.map(([permission, label]) => (
            <label key={permission}>
              <input type="checkbox" checked={draft.permissions.includes(permission)} onChange={() => setDraft({
                ...draft,
                permissions: draft.permissions.includes(permission)
                  ? draft.permissions.filter((item) => item !== permission)
                  : [...draft.permissions, permission],
              })} />
              <span><Shield size={15} /><b>{label}</b></span>
            </label>
          ))}
        </fieldset>

        <footer>
          {selectedId && <button className="danger-text" onClick={async () => {
            if (!window.confirm("Excluir este cargo? As pessoas não serão excluídas.")) return;
            await deleteJobRole(selectedId);
            setSelectedId("");
            await refresh();
          }}><Trash2 size={14} /> Excluir cargo</button>}
          <span>{message}</span>
          <button className="primary" disabled={saving || draft.name.trim().length < 2} onClick={() => void save()}>
            {saving ? <LoaderCircle className="spin" size={15} /> : message === "Cargo salvo" ? <Check size={15} /> : <Save size={15} />}
            {saving ? "Salvando…" : "Salvar cargo"}
          </button>
        </footer>
      </main>
    </section>
  );
}

import { LoaderCircle, Save, Shield, UserCog, UserPlus, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  getCurrentIdentity,
  inviteMember,
  listJobRoles,
  listMembers,
  setMemberJobRoles,
  updateMember,
  type JobRole,
  type Member,
} from "../lib/supabase";
import { RoleManager } from "./RoleManager";

type OpenPanel = "members" | "roles" | null;

type Capabilities = {
  memberId: string;
  canManageMembers: boolean;
  canManageRoles: boolean;
  nativeAdmin: boolean;
};

const MEMBER_TRIGGER = "data-labstar-delegated-members";
const ROLE_TRIGGER = "data-labstar-delegated-roles";

function hasPermission(member: Member, permission: string) {
  return member.jobRoles.some((role) => role.permissions.includes(permission));
}

export function ProfessionalPermissionBridge() {
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [open, setOpen] = useState<OpenPanel>(null);

  useEffect(() => {
    let disposed = false;
    void getCurrentIdentity().then((identity) => {
      if (disposed || !identity?.member) return;
      const member = identity.member;
      const nativeAdmin = member.role === "owner" || member.role === "admin";
      setCapabilities({
        memberId: member.id,
        nativeAdmin,
        canManageMembers: nativeAdmin || hasPermission(member, "manage_members"),
        canManageRoles: nativeAdmin || hasPermission(member, "manage_roles"),
      });
    }).catch(() => undefined);
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    if (!capabilities || capabilities.nativeAdmin) return;

    const decorate = () => {
      document.querySelectorAll<HTMLElement>(".team-section-tabs").forEach((tabs) => {
        if (capabilities.canManageMembers && !tabs.querySelector(`[${MEMBER_TRIGGER}]`)) {
          const button = document.createElement("button");
          button.type = "button";
          button.setAttribute(MEMBER_TRIGGER, "true");
          button.innerHTML = `<span aria-hidden="true">◎</span> Administração`;
          tabs.appendChild(button);
        }
        if (capabilities.canManageRoles && !tabs.querySelector(`[${ROLE_TRIGGER}]`)) {
          const button = document.createElement("button");
          button.type = "button";
          button.setAttribute(ROLE_TRIGGER, "true");
          button.innerHTML = `<span aria-hidden="true">◇</span> Cargos profissionais`;
          tabs.appendChild(button);
        }
      });
    };

    const click = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(`[${MEMBER_TRIGGER}]`)) {
        event.preventDefault();
        event.stopPropagation();
        setOpen("members");
      } else if (target?.closest(`[${ROLE_TRIGGER}]`)) {
        event.preventDefault();
        event.stopPropagation();
        setOpen("roles");
      }
    };

    decorate();
    const observer = new MutationObserver(decorate);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("click", click, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("click", click, true);
      document.querySelectorAll(`[${MEMBER_TRIGGER}], [${ROLE_TRIGGER}]`).forEach((node) => node.remove());
    };
  }, [capabilities]);

  if (!capabilities || !open) return null;
  return createPortal(
    <div className="delegated-admin-backdrop" onMouseDown={() => setOpen(null)}>
      <section className="delegated-admin-modal" role="dialog" aria-modal="true" aria-label={open === "roles" ? "Cargos profissionais" : "Administração de membros"} onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>{open === "roles" ? <Shield size={18} /> : <UserCog size={18} />}<strong>{open === "roles" ? "Cargos profissionais" : "Administração de membros"}</strong></div>
          <button type="button" onClick={() => setOpen(null)} aria-label="Fechar"><X size={17} /></button>
        </header>
        <div className="delegated-admin-body">
          {open === "roles"
            ? <RoleManager />
            : <DelegatedMemberManager currentMemberId={capabilities.memberId} canManageRoles={capabilities.canManageRoles} />}
        </div>
      </section>
    </div>,
    document.body,
  );
}

function DelegatedMemberManager({ currentMemberId, canManageRoles }: { currentMemberId: string; canManageRoles: boolean }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<JobRole[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState({ email: "", name: "", jobTitle: "", area: "", role: "member" as "manager" | "member" | "viewer" });

  async function refresh(preferredId?: string) {
    setLoading(true);
    try {
      const [team, jobRoles] = await Promise.all([listMembers(), listJobRoles()]);
      const editable = team.members.filter((member) => member.id !== currentMemberId && member.role !== "owner" && member.role !== "admin");
      setMembers(editable);
      setRoles(jobRoles);
      const id = preferredId || selectedId || editable[0]?.id || "";
      setSelectedId(id);
      const selected = editable.find((member) => member.id === id) ?? editable[0] ?? null;
      setDraft(selected ? { ...selected, jobRoles: [...selected.jobRoles], assignments: [...selected.assignments] } : null);
    } catch {
      setNotice("Não foi possível carregar os membros agora.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  const selected = useMemo(() => members.find((member) => member.id === selectedId) ?? null, [members, selectedId]);

  function choose(member: Member) {
    setSelectedId(member.id);
    setDraft({ ...member, jobRoles: [...member.jobRoles], assignments: [...member.assignments] });
    setNotice("");
  }

  async function save() {
    if (!draft || saving) return;
    setSaving(true);
    setNotice("Salvando…");
    try {
      const updated = await updateMember(draft.id, {
        name: draft.name,
        jobTitle: draft.jobTitle,
        area: draft.area,
        role: draft.role,
        status: draft.status,
      });
      let assigned = updated.jobRoles;
      if (canManageRoles) assigned = await setMemberJobRoles(draft.id, draft.jobRoles.map((role) => role.id));
      const finalMember = { ...updated, jobRoles: assigned };
      setMembers((current) => current.map((member) => member.id === finalMember.id ? finalMember : member));
      setDraft({ ...finalMember, assignments: [...finalMember.assignments], jobRoles: [...finalMember.jobRoles] });
      setNotice("Alterações salvas.");
    } catch {
      setNotice("A alteração foi recusada. Verifique as permissões desse cargo profissional.");
    } finally {
      setSaving(false);
    }
  }

  async function addMember(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setNotice("Autorizando membro…");
    try {
      const result = await inviteMember(invite);
      setInvite({ email: "", name: "", jobTitle: "", area: "", role: "member" });
      setInviteOpen(false);
      setNotice(result.emailSent ? "Membro autorizado e convite enviado." : "Membro autorizado. O link pode ser solicitado na tela de entrada.");
      await refresh(result.member.id);
    } catch {
      setNotice("Não foi possível autorizar esse membro.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="delegated-admin-loading"><LoaderCircle className="spin" size={18} /> Carregando equipe</div>;

  return (
    <div className="delegated-member-layout">
      <aside>
        <div className="delegated-member-list-head"><strong>Membros administráveis</strong><button type="button" onClick={() => setInviteOpen((value) => !value)}><UserPlus size={14} /> Adicionar</button></div>
        <div className="delegated-member-list">{members.map((member) => <button key={member.id} className={member.id === selectedId ? "active" : ""} onClick={() => choose(member)}><Users size={14} /><span><b>{member.name}</b><small>{member.jobRoles[0]?.name || member.jobTitle || member.role}</small></span></button>)}</div>
      </aside>

      <main>
        {inviteOpen ? <form className="delegated-member-form" onSubmit={(event) => void addMember(event)}>
          <h3>Adicionar membro</h3>
          <label>E-mail<input type="email" required value={invite.email} onChange={(event) => setInvite({ ...invite, email: event.target.value })} /></label>
          <label>Nome<input value={invite.name} onChange={(event) => setInvite({ ...invite, name: event.target.value })} /></label>
          <div><label>Cargo informado<input value={invite.jobTitle} onChange={(event) => setInvite({ ...invite, jobTitle: event.target.value })} /></label><label>Área<input value={invite.area} onChange={(event) => setInvite({ ...invite, area: event.target.value })} /></label></div>
          <label>Nível<select value={invite.role} onChange={(event) => setInvite({ ...invite, role: event.target.value as typeof invite.role })}><option value="manager">Gestor</option><option value="member">Membro</option><option value="viewer">Convidado</option></select></label>
          <button className="primary" disabled={saving || !invite.email.trim()} type="submit">{saving ? <LoaderCircle className="spin" size={14} /> : <UserPlus size={14} />} Autorizar</button>
        </form> : draft && selected ? <div className="delegated-member-form">
          <h3>{selected.name}</h3>
          <label>Nome<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          <div><label>Cargo informado<input value={draft.jobTitle} onChange={(event) => setDraft({ ...draft, jobTitle: event.target.value })} /></label><label>Área<input value={draft.area} onChange={(event) => setDraft({ ...draft, area: event.target.value })} /></label></div>
          <div><label>Nível<select value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as Member["role"] })}><option value="manager">Gestor</option><option value="member">Membro</option><option value="viewer">Convidado</option></select></label><label>Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as Member["status"] })}><option value="active">Ativo</option><option value="pending">Pendente</option><option value="suspended">Suspenso</option></select></label></div>
          {canManageRoles && <fieldset><legend>Cargos profissionais</legend><div className="delegated-role-list">{roles.map((role) => { const selectedOrder = draft.jobRoles.findIndex((item) => item.id === role.id); const checked = selectedOrder >= 0; return <label key={role.id} className={checked ? "active" : ""}><input type="checkbox" checked={checked} onChange={() => setDraft({ ...draft, jobRoles: checked ? draft.jobRoles.filter((item) => item.id !== role.id) : [...draft.jobRoles, role] })} />{checked && <em aria-label={`Ordem ${selectedOrder + 1}`}>{selectedOrder + 1}</em>}<span style={{ "--role-color": role.color } as React.CSSProperties} /><b>{role.name}</b></label>; })}</div></fieldset>}
          <button type="button" className="primary" disabled={saving || !draft.name.trim()} onClick={() => void save()}>{saving ? <LoaderCircle className="spin" size={14} /> : <Save size={14} />} Salvar</button>
        </div> : <div className="delegated-admin-empty">Nenhum membro disponível para administração.</div>}
        {notice && <p className="delegated-admin-notice">{notice}</p>}
      </main>
    </div>
  );
}

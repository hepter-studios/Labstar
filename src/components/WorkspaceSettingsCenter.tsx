import {
  Activity,
  Boxes,
  CheckCircle2,
  FolderPlus,
  Hash,
  LoaderCircle,
  LockKeyhole,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Users,
  Webhook,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { updateChannelPermissions } from "../lib/channel-admin";
import type {
  ChannelCategory,
  CollaborationSpace,
  LabstarChannel,
  Member,
  MemberRole,
} from "../lib/supabase";
import { Avatar } from "./Avatar";

type Tab = "general" | "channels" | "members" | "permissions" | "integrations" | "security";

type Props = {
  space: CollaborationSpace;
  categories: ChannelCategory[];
  channels: LabstarChannel[];
  members: Member[];
  currentMember: Member;
  onClose: () => void;
  onEditIdentity: () => void;
  onCreateCategory: () => void;
  onCreateChannel: (categoryId: string) => void;
  onSelectChannel: (channelId: string) => void;
  onOpenIntegrations: () => void;
  onOpenTeam: () => void;
  onPermissionsSaved: () => Promise<void>;
};

const tabs: Array<{ id: Tab; label: string; icon: typeof Settings2 }> = [
  { id: "general", label: "Visão geral", icon: SlidersHorizontal },
  { id: "channels", label: "Canais e categorias", icon: Hash },
  { id: "members", label: "Membros", icon: Users },
  { id: "permissions", label: "Permissões", icon: LockKeyhole },
  { id: "integrations", label: "Integrações", icon: Webhook },
  { id: "security", label: "Segurança", icon: ShieldCheck },
];

const roleOptions: Array<{ value: MemberRole; label: string }> = [
  { value: "owner", label: "Proprietário" },
  { value: "admin", label: "Administrador" },
  { value: "manager", label: "Gestor" },
  { value: "member", label: "Membro" },
  { value: "viewer", label: "Visualizador" },
];

export function WorkspaceSettingsCenter({
  space,
  categories,
  channels,
  members,
  currentMember,
  onClose,
  onEditIdentity,
  onCreateCategory,
  onCreateChannel,
  onSelectChannel,
  onOpenIntegrations,
  onOpenTeam,
  onPermissionsSaved,
}: Props) {
  const [tab, setTab] = useState<Tab>("general");
  const [memberSearch, setMemberSearch] = useState("");
  const [channelSearch, setChannelSearch] = useState("");

  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  const activeMembers = useMemo(() => members.filter((member) => member.status === "active"), [members]);
  const visibleMembers = useMemo(() => {
    const query = memberSearch.trim().toLocaleLowerCase();
    if (!query) return activeMembers;
    return activeMembers.filter((member) => `${member.name} ${member.email} ${member.area} ${member.jobTitle}`.toLocaleLowerCase().includes(query));
  }, [activeMembers, memberSearch]);

  const visibleChannels = useMemo(() => {
    const query = channelSearch.trim().toLocaleLowerCase();
    if (!query) return channels;
    return channels.filter((channel) => `${channel.name} ${channel.description} ${channel.type}`.toLocaleLowerCase().includes(query));
  }, [channels, channelSearch]);

  const assignmentOptions = useMemo(() => {
    const values = new Set<string>();
    for (const member of activeMembers) member.assignments.forEach((assignment) => assignment.trim() && values.add(assignment.trim()));
    for (const channel of channels) channel.allowedAssignments.forEach((assignment) => assignment.trim() && values.add(assignment.trim()));
    return [...values].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [activeMembers, channels]);

  const restrictedChannels = channels.filter((channel) => channel.allowedRoles.length || channel.allowedAssignments.length);
  const voiceChannels = channels.filter((channel) => channel.type === "voice").length;
  const textChannels = channels.filter((channel) => channel.type !== "voice" && channel.type !== "social").length;
  const canManage = currentMember.role === "owner" || currentMember.role === "admin" || currentMember.jobRoles.some((role) => role.permissions.includes("manage_channels"));

  return (
    <div className="workspace-settings-backdrop" onMouseDown={onClose}>
      <section className="workspace-settings-center" role="dialog" aria-modal="true" aria-label={`Configurações de ${space.name}`} onMouseDown={(event) => event.stopPropagation()}>
        <aside className="workspace-settings-nav">
          <div className="workspace-settings-identity">
            <span style={{ "--space-color": space.color } as React.CSSProperties}>
              {space.logoUrl ? <img src={space.logoUrl} alt="" /> : <Star size={18} fill="currentColor" />}
            </span>
            <div><strong>{space.name}</strong><small>Configurações do Espaço</small></div>
          </div>
          <nav>
            {tabs.map(({ id, label, icon: Icon }) => (
              <button key={id} className={tab === id ? "active" : ""} type="button" onClick={() => setTab(id)}><Icon size={15} /> {label}</button>
            ))}
          </nav>
          <div className="workspace-settings-foot"><span><ShieldCheck size={13} /> {canManage ? "Administração habilitada" : "Visualização limitada"}</span></div>
        </aside>

        <main className="workspace-settings-content">
          <header className="workspace-settings-head">
            <div><small>ESPAÇO · {space.kind.toLocaleUpperCase()}</small><h2>{tabs.find((item) => item.id === tab)?.label}</h2></div>
            <button type="button" onClick={onClose} aria-label="Fechar configurações do espaço"><X size={18} /></button>
          </header>

          <div className="workspace-settings-scroll">
            {tab === "general" && <GeneralTab space={space} categories={categories} channels={channels} members={activeMembers} voiceChannels={voiceChannels} textChannels={textChannels} canManage={canManage} onEditIdentity={onEditIdentity} />}

            {tab === "channels" && (
              <section className="workspace-admin-section">
                <header><div><strong>Estrutura de canais</strong><p>Organize conversa, avisos, reuniões e planejamento por categoria.</p></div>{canManage && <button type="button" onClick={onCreateCategory}><FolderPlus size={14} /> Nova categoria</button>}</header>
                <label className="workspace-admin-search"><Search size={14} /><input value={channelSearch} onChange={(event) => setChannelSearch(event.target.value)} placeholder="Buscar canais" /></label>
                <div className="workspace-category-admin-list">
                  {categories.map((category) => {
                    const categoryChannels = visibleChannels.filter((channel) => channel.categoryId === category.id);
                    if (channelSearch.trim() && !categoryChannels.length) return null;
                    return <article key={category.id}>
                      <header><span><strong>{category.name}</strong><small>{categoryChannels.length} canal{categoryChannels.length === 1 ? "" : "is"}</small></span>{canManage && <button type="button" onClick={() => onCreateChannel(category.id)}>+ Canal</button>}</header>
                      <div>{categoryChannels.map((channel) => <button key={channel.id} type="button" onClick={() => { onSelectChannel(channel.id); onClose(); }}><Hash size={14} /><span><strong>{channel.name}</strong><small>{channel.description || channel.type}</small></span>{(channel.allowedRoles.length > 0 || channel.allowedAssignments.length > 0) && <LockKeyhole size={12} />}</button>)}</div>
                    </article>;
                  })}
                  {!categories.length && <WorkspaceEmpty icon={<Hash size={22} />} title="Nenhuma categoria" text="Crie uma categoria para começar a organizar os canais deste Espaço." />}
                </div>
              </section>
            )}

            {tab === "members" && (
              <section className="workspace-admin-section">
                <header><div><strong>Membros deste ecossistema</strong><p>Consulte quem está ativo, cargo e área. A administração completa continua no diretório global.</p></div><button type="button" onClick={() => { onOpenTeam(); onClose(); }}><Users size={14} /> Gerenciar equipe</button></header>
                <label className="workspace-admin-search"><Search size={14} /><input value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Buscar nome, e-mail, cargo ou área" /></label>
                <div className="workspace-member-admin-list">
                  {visibleMembers.map((member) => <article key={member.id}><Avatar name={member.name} url={member.avatarUrl} size="sm" status="online" /><span><strong>{member.name}</strong><small>{member.email}</small></span><em>{member.jobRoles[0]?.name || member.jobTitle || member.role}</em><i>{member.area || "Sem área"}</i></article>)}
                  {!visibleMembers.length && <WorkspaceEmpty icon={<Users size={22} />} title="Nenhum membro encontrado" text="Ajuste a busca ou gerencie os membros no diretório global." />}
                </div>
              </section>
            )}

            {tab === "permissions" && (
              <section className="workspace-admin-section">
                <header><div><strong>Permissões por canal</strong><p>{canManage ? "Defina níveis técnicos e atribuições que podem abrir cada canal. Vazio significa toda a equipe ativa." : "Veja quais canais têm restrições por nível ou atribuição."}</p></div></header>
                <div className="permission-summary-grid"><article><LockKeyhole size={16} /><strong>{restrictedChannels.length}</strong><span>Canais restritos</span></article><article><Hash size={16} /><strong>{channels.length - restrictedChannels.length}</strong><span>Canais gerais</span></article><article><ShieldCheck size={16} /><strong>{currentMember.role}</strong><span>Seu nível</span></article></div>
                <div className="workspace-permission-editor-list">
                  {channels.map((channel) => <ChannelPermissionEditor key={channel.id} channel={channel} assignments={assignmentOptions} canManage={canManage} onSaved={onPermissionsSaved} />)}
                  {!channels.length && <WorkspaceEmpty icon={<LockKeyhole size={22} />} title="Nenhum canal" text="Crie canais antes de configurar permissões." />}
                </div>
              </section>
            )}

            {tab === "integrations" && (
              <section className="workspace-admin-section">
                <header><div><strong>Integrações do Espaço</strong><p>GitHub, monitoramento, suporte, Discord e renovações ficam isolados por Espaço.</p></div></header>
                <div className="workspace-integration-hero"><Webhook size={25} /><div><strong>Central de automações</strong><p>Escolha o canal que recebe cada evento e mantenha incidentes, deploys e vencimentos no lugar certo.</p></div><button type="button" onClick={() => { onOpenIntegrations(); onClose(); }}><Webhook size={14} /> Abrir integrações</button></div>
              </section>
            )}

            {tab === "security" && (
              <section className="workspace-admin-section">
                <header><div><strong>Segurança do Espaço</strong><p>Resumo operacional das proteções aplicadas na interface e no acesso.</p></div></header>
                <div className="workspace-security-list">
                  <article><CheckCircle2 size={17} /><div><strong>Autorização por membro</strong><span>Somente identidades autorizadas pelo backend Rust passam pelo gate global.</span></div></article>
                  <article><ShieldCheck size={17} /><div><strong>Permissões por canal</strong><span>Canais podem restringir acesso por nível e atribuições registradas.</span></div></article>
                  <article><Activity size={17} /><div><strong>Operações recuperáveis</strong><span>Falhas assíncronas e de rede geram feedback sem derrubar a sessão atual.</span></div></article>
                  <article><LockKeyhole size={17} /><div><strong>Ações destrutivas</strong><span>A confirmação global pode ser ligada nas Configurações gerais do Labstar.</span></div></article>
                </div>
              </section>
            )}
          </div>
        </main>
      </section>
    </div>
  );
}

function ChannelPermissionEditor({ channel, assignments, canManage, onSaved }: {
  channel: LabstarChannel;
  assignments: string[];
  canManage: boolean;
  onSaved: () => Promise<void>;
}) {
  const [roles, setRoles] = useState<MemberRole[]>(channel.allowedRoles);
  const [selectedAssignments, setSelectedAssignments] = useState<string[]>(channel.allowedAssignments);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    setRoles(channel.allowedRoles);
    setSelectedAssignments(channel.allowedAssignments);
  }, [channel.id, channel.allowedRoles.join("|"), channel.allowedAssignments.join("|")]);

  const dirty = roles.join("|") !== channel.allowedRoles.join("|")
    || selectedAssignments.join("|") !== channel.allowedAssignments.join("|");
  const openToTeam = roles.length === 0 && selectedAssignments.length === 0;

  function toggleRole(role: MemberRole) {
    if (!canManage) return;
    setRoles((current) => current.includes(role) ? current.filter((item) => item !== role) : [...current, role]);
    setStatus("");
  }

  function toggleAssignment(assignment: string) {
    if (!canManage) return;
    setSelectedAssignments((current) => current.includes(assignment) ? current.filter((item) => item !== assignment) : [...current, assignment]);
    setStatus("");
  }

  async function save() {
    if (!canManage || !dirty) return;
    setSaving(true);
    setStatus("Salvando…");
    try {
      const result = await updateChannelPermissions({ channelId: channel.id, allowedRoles: roles, allowedAssignments: selectedAssignments });
      setRoles(result.allowedRoles);
      setSelectedAssignments(result.allowedAssignments);
      await onSaved();
      setStatus("Permissões salvas");
    } catch {
      setRoles(channel.allowedRoles);
      setSelectedAssignments(channel.allowedAssignments);
      setStatus("O banco recusou a alteração. Nada foi modificado.");
    } finally {
      setSaving(false);
    }
  }

  return <article className="channel-permission-editor">
    <header>
      <span><Hash size={14}/><div><strong>{channel.name}</strong><small>{channel.description || channel.type}</small></div></span>
      <b className={openToTeam ? "open" : "restricted"}>{openToTeam ? "Equipe ativa" : "Restrito"}</b>
    </header>
    <div className="channel-permission-groups">
      <fieldset disabled={!canManage || saving}>
        <legend>Níveis de acesso</legend>
        <div>{roleOptions.map((role) => <label key={role.value}><input type="checkbox" checked={roles.includes(role.value)} onChange={() => toggleRole(role.value)}/><span>{role.label}</span></label>)}</div>
      </fieldset>
      <fieldset disabled={!canManage || saving}>
        <legend>Atribuições / projetos</legend>
        {assignments.length ? <div>{assignments.map((assignment) => <label key={assignment}><input type="checkbox" checked={selectedAssignments.includes(assignment)} onChange={() => toggleAssignment(assignment)}/><span>{assignment}</span></label>)}</div> : <p>Nenhuma atribuição foi cadastrada na equipe.</p>}
      </fieldset>
    </div>
    <footer>
      <span className={status.includes("recusou") ? "error" : ""}>{status || (openToTeam ? "Sem restrições adicionais." : `${roles.length} nível(is) · ${selectedAssignments.length} atribuição(ões)`)}</span>
      {canManage && <button type="button" disabled={!dirty || saving} onClick={() => void save()}>{saving ? <LoaderCircle className="spin" size={13}/> : <Save size={13}/>} Salvar</button>}
    </footer>
  </article>;
}

function GeneralTab({ space, categories, channels, members, voiceChannels, textChannels, canManage, onEditIdentity }: {
  space: CollaborationSpace;
  categories: ChannelCategory[];
  channels: LabstarChannel[];
  members: Member[];
  voiceChannels: number;
  textChannels: number;
  canManage: boolean;
  onEditIdentity: () => void;
}) {
  return <>
    <section className="workspace-admin-section workspace-overview-card">
      <div className="workspace-overview-identity"><span style={{ "--space-color": space.color } as React.CSSProperties}>{space.logoUrl ? <img src={space.logoUrl} alt="" /> : <Star size={25} fill="currentColor" />}</span><div><small>{space.kind.toLocaleUpperCase()}</small><h3>{space.name}</h3><p>{space.description || "Sem descrição configurada."}</p></div>{canManage && <button type="button" onClick={onEditIdentity}><Settings2 size={14} /> Editar identidade</button>}</div>
      <div className="workspace-overview-stats"><article><Boxes size={16} /><strong>{categories.length}</strong><span>Categorias</span></article><article><Hash size={16} /><strong>{textChannels}</strong><span>Canais de texto</span></article><article><Activity size={16} /><strong>{voiceChannels}</strong><span>Salas de voz</span></article><article><Users size={16} /><strong>{members.length}</strong><span>Membros ativos</span></article></div>
    </section>
    <section className="workspace-admin-section"><header><div><strong>Saúde da estrutura</strong><p>Resumo rápido para detectar um Espaço incompleto.</p></div></header><div className="workspace-health-checks"><span className={space.description ? "ok" : "warn"}><i /> Descrição do Espaço</span><span className={categories.length ? "ok" : "warn"}><i /> Categorias organizadas</span><span className={channels.length ? "ok" : "warn"}><i /> Canais configurados</span><span className={voiceChannels ? "ok" : "warn"}><i /> Sala de voz disponível</span></div></section>
  </>;
}

function WorkspaceEmpty({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="workspace-admin-empty">{icon}<strong>{title}</strong><span>{text}</span></div>;
}

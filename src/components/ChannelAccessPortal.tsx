import {
  Check,
  Eye,
  EyeOff,
  Hash,
  LoaderCircle,
  LockKeyhole,
  MessageSquareLock,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { loadCollaboration, type MemberRole } from "../lib/supabase";
import {
  channelAccessErrorMessage,
  createManagedChannel,
  deleteManagedChannel,
  listManagedChannels,
  loadChannelAccessDirectory,
  loadManagedChannel,
  updateManagedChannel,
  type ChannelAccessConfig,
  type ChannelAccessDirectory,
  type ChannelAccessDraft,
  type ManagedChannelType,
} from "../lib/channel-access";

type OpenState =
  | { mode: "create"; spaceId: string; categoryId: string }
  | { mode: "edit"; channelId: string }
  | null;

type CollaborationSnapshot = Awaited<ReturnType<typeof loadCollaboration>>;

const SETTINGS_TRIGGER = "data-channel-access-settings-trigger";
const MENU_TRIGGER = "data-channel-access-menu-trigger";

const channelTypes: Array<{ value: ManagedChannelType; label: string }> = [
  { value: "text", label: "Conversa" },
  { value: "announcement", label: "Avisos" },
  { value: "rules", label: "Regras" },
  { value: "voice", label: "Reunião por voz" },
  { value: "social", label: "Planejamento social" },
];

const accessLevels: Array<{ value: MemberRole; label: string; detail: string }> = [
  { value: "manager", label: "Gestores", detail: "Liderança operacional" },
  { value: "member", label: "Membros", detail: "Equipe padrão" },
  { value: "viewer", label: "Convidados", detail: "Acesso somente leitura geral" },
];

function emptyDraft(spaceId = "", categoryId: string | null = null): ChannelAccessDraft {
  return {
    spaceId,
    categoryId,
    name: "",
    description: "",
    type: "text",
    isPrivate: false,
    readOnly: false,
    allowedRoles: [],
    allowedJobRoleIds: [],
    allowedMemberIds: [],
    allowedAssignments: [],
  };
}

function draftFromChannel(channel: ChannelAccessConfig): ChannelAccessDraft {
  return {
    spaceId: channel.spaceId,
    categoryId: channel.categoryId,
    name: channel.name,
    description: channel.description,
    type: channel.type,
    isPrivate: channel.isPrivate,
    readOnly: channel.readOnly,
    allowedRoles: channel.allowedRoles.filter((role) => role !== "owner" && role !== "admin"),
    allowedJobRoleIds: channel.allowedJobRoleIds,
    allowedMemberIds: channel.allowedMemberIds,
    allowedAssignments: channel.allowedAssignments,
  };
}

function textOf(selector: string, root: ParentNode = document) {
  return root.querySelector<HTMLElement>(selector)?.textContent?.trim() ?? "";
}

function channelName(button: HTMLButtonElement) {
  return Array.from(button.children).find((child) => child.tagName === "SPAN")?.textContent?.trim() ?? "";
}

function settingsSvg() {
  return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.72l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z"/><circle cx="12" cy="12" r="3"/></svg>`;
}

export function ChannelAccessPortal() {
  const [directory, setDirectory] = useState<ChannelAccessDirectory | null>(null);
  const [snapshot, setSnapshot] = useState<CollaborationSnapshot | null>(null);
  const [managedChannels, setManagedChannels] = useState<ChannelAccessConfig[]>([]);
  const [open, setOpen] = useState<OpenState>(null);
  const [draft, setDraft] = useState<ChannelAccessDraft>(() => emptyDraft());
  const [loadingEditor, setLoadingEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [roleSearch, setRoleSearch] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const refreshTimerRef = useRef(0);

  async function refreshDirectory() {
    try {
      const result = await loadChannelAccessDirectory();
      setDirectory(result);
      return result;
    } catch {
      setDirectory(null);
      return null;
    }
  }

  async function refreshSnapshot() {
    try {
      const [collaboration, channels] = await Promise.all([
        loadCollaboration(),
        listManagedChannels().catch(() => []),
      ]);
      setSnapshot(collaboration);
      setManagedChannels(channels);
      return collaboration;
    } catch {
      return null;
    }
  }

  useEffect(() => {
    void refreshDirectory();
    void refreshSnapshot();
  }, []);

  function resolveSpace(snapshotValue: CollaborationSnapshot) {
    const visibleName = textOf(".space-title strong").toLocaleLowerCase();
    return snapshotValue.spaces.find((space) => space.name.trim().toLocaleLowerCase() === visibleName)
      ?? snapshotValue.spaces[0]
      ?? null;
  }

  function resolveChannelFromButton(button: HTMLButtonElement, snapshotValue: CollaborationSnapshot) {
    if (button.dataset.channelId) return snapshotValue.channels.find((channel) => channel.id === button.dataset.channelId) ?? null;
    const space = resolveSpace(snapshotValue);
    const name = channelName(button).toLocaleLowerCase();
    const categoryName = textOf(".channel-category > header span", button.closest(".channel-category") ?? document).toLocaleLowerCase();
    const category = snapshotValue.categories.find((item) => item.spaceId === space?.id && item.name.trim().toLocaleLowerCase() === categoryName);
    const matches = snapshotValue.channels.filter((channel) =>
      channel.spaceId === space?.id
      && channel.name.trim().toLocaleLowerCase() === name
      && (!category || channel.categoryId === category.id)
    );
    const found = matches.length === 1 ? matches[0] : null;
    if (found) button.dataset.channelId = found.id;
    return found;
  }

  function resolveActiveChannel(snapshotValue: CollaborationSnapshot) {
    const active = document.querySelector<HTMLButtonElement>(".channel-list > button.active");
    return active ? resolveChannelFromButton(active, snapshotValue) : null;
  }

  async function openCreateFromButton(button: HTMLElement) {
    const currentDirectory = directory ?? await refreshDirectory();
    if (!currentDirectory?.canCreate) return;
    const currentSnapshot = snapshot ?? await refreshSnapshot();
    if (!currentSnapshot) return;
    const categorySection = button.closest<HTMLElement>(".channel-category");
    const categoryName = textOf(":scope > header span", categorySection ?? document).toLocaleLowerCase();
    const space = resolveSpace(currentSnapshot);
    const category = currentSnapshot.categories.find((item) => item.spaceId === space?.id && item.name.trim().toLocaleLowerCase() === categoryName);
    if (!space || !category) {
      setNotice("Não consegui identificar esta categoria com segurança.");
      return;
    }
    setDraft(emptyDraft(space.id, category.id));
    setDeleteConfirm(false);
    setMemberSearch("");
    setRoleSearch("");
    setNotice("");
    setOpen({ mode: "create", spaceId: space.id, categoryId: category.id });
  }

  async function openActiveEditor() {
    const currentDirectory = directory ?? await refreshDirectory();
    if (!currentDirectory?.canManage) return;
    const currentSnapshot = snapshot ?? await refreshSnapshot();
    if (!currentSnapshot) return;
    const channel = resolveActiveChannel(currentSnapshot);
    if (!channel) {
      setNotice("Abra o canal que deseja editar e tente novamente.");
      return;
    }
    setOpen({ mode: "edit", channelId: channel.id });
    setLoadingEditor(true);
    setDeleteConfirm(false);
    setMemberSearch("");
    setRoleSearch("");
    setNotice("");
    try {
      const managed = managedChannels.find((item) => item.id === channel.id) ?? await loadManagedChannel(channel.id);
      setDraft(draftFromChannel(managed));
    } catch (error) {
      setDraft({
        ...emptyDraft(channel.spaceId, channel.categoryId),
        name: channel.name,
        description: channel.description,
        type: channel.type,
        isPrivate: channel.allowedRoles.length > 0 || channel.allowedAssignments.length > 0,
        allowedRoles: channel.allowedRoles.filter((role) => role !== "owner" && role !== "admin"),
        allowedAssignments: channel.allowedAssignments,
      });
      setNotice(channelAccessErrorMessage(error));
    } finally {
      setLoadingEditor(false);
    }
  }

  useEffect(() => {
    const captureClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const createButton = target?.closest<HTMLElement>('button[aria-label^="Criar canal em "]');
      if (createButton && directory?.canCreate) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        void openCreateFromButton(createButton);
        return;
      }

      if (target?.closest(`[${SETTINGS_TRIGGER}], [${MENU_TRIGGER}]`)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        void openActiveEditor();
      }
    };

    document.addEventListener("click", captureClick, true);
    return () => document.removeEventListener("click", captureClick, true);
  }, [directory, snapshot, managedChannels]);

  useEffect(() => {
    const decorate = () => {
      if (!directory) return;
      const currentSnapshot = snapshot;
      if (currentSnapshot) {
        document.querySelectorAll<HTMLButtonElement>(".channel-list > button").forEach((button) => {
          const channel = resolveChannelFromButton(button, currentSnapshot);
          if (!channel) return;
          button.dataset.channelId = channel.id;
          const managed = managedChannels.find((item) => item.id === channel.id);
          const privateChannel = managed?.isPrivate || channel.allowedRoles.length > 0 || channel.allowedAssignments.length > 0;
          button.classList.toggle("labstar-private-channel", Boolean(privateChannel));
          button.dataset.channelReadOnly = managed?.readOnly ? "true" : "false";
        });
      }

      if (directory.canManage) {
        const actions = document.querySelector<HTMLElement>(".channel-head-actions");
        if (actions && !actions.querySelector(`[${SETTINGS_TRIGGER}]`)) {
          const button = document.createElement("button");
          button.type = "button";
          button.setAttribute(SETTINGS_TRIGGER, "true");
          button.setAttribute("title", "Editar canal e acesso");
          button.setAttribute("aria-label", "Editar canal e acesso");
          button.innerHTML = settingsSvg();
          actions.prepend(button);
        }

        document.querySelectorAll<HTMLElement>(".workspace-quick-menu.channel > div").forEach((menuBody) => {
          if (menuBody.querySelector(`[${MENU_TRIGGER}]`)) return;
          const button = document.createElement("button");
          button.type = "button";
          button.setAttribute(MENU_TRIGGER, "true");
          button.innerHTML = `${settingsSvg()} Editar canal e acesso`;
          const separator = menuBody.querySelector(".workspace-menu-separator");
          menuBody.insertBefore(button, separator ?? null);
        });
      }
    };

    decorate();
    const observer = new MutationObserver(decorate);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    return () => {
      observer.disconnect();
      document.querySelectorAll(`[${SETTINGS_TRIGGER}], [${MENU_TRIGGER}]`).forEach((node) => node.remove());
    };
  }, [directory, snapshot, managedChannels]);

  useEffect(() => {
    const refresh = () => {
      window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = window.setTimeout(() => void refreshSnapshot(), 120);
    };
    window.addEventListener("labstar:collaboration-refreshed", refresh);
    return () => {
      window.clearTimeout(refreshTimerRef.current);
      window.removeEventListener("labstar:collaboration-refreshed", refresh);
    };
  }, []);

  async function save() {
    if (!open || !directory || saving || draft.name.trim().length < 2) return;
    setSaving(true);
    setNotice("");
    try {
      const saved = open.mode === "create"
        ? await createManagedChannel(draft, directory.member.id)
        : await updateManagedChannel(open.channelId, draft);
      setManagedChannels((current) => [...current.filter((item) => item.id !== saved.id), saved]);
      setNotice(open.mode === "create" ? "Canal criado com as regras de acesso escolhidas." : "Canal e permissões atualizados.");
      window.dispatchEvent(new CustomEvent("labstar:refresh-collaboration", { detail: { channelId: saved.id } }));
      window.setTimeout(() => setOpen(null), 280);
    } catch (error) {
      setNotice(channelAccessErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function removeChannel() {
    if (!open || open.mode !== "edit" || saving) return;
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      setNotice("Clique novamente para confirmar. O canal e o histórico vinculado serão removidos para todos.");
      return;
    }
    setSaving(true);
    try {
      await deleteManagedChannel(open.channelId);
      setOpen(null);
      window.dispatchEvent(new CustomEvent("labstar:refresh-collaboration"));
    } catch (error) {
      setDeleteConfirm(false);
      setNotice(channelAccessErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  const modal = open && directory ? createPortal(
    <ChannelAccessModal
      mode={open.mode}
      draft={draft}
      directory={directory}
      loading={loadingEditor}
      saving={saving}
      notice={notice}
      memberSearch={memberSearch}
      roleSearch={roleSearch}
      deleteConfirm={deleteConfirm}
      onDraft={setDraft}
      onMemberSearch={setMemberSearch}
      onRoleSearch={setRoleSearch}
      onClose={() => !saving && setOpen(null)}
      onSave={() => void save()}
      onDelete={() => void removeChannel()}
    />,
    document.body,
  ) : null;

  return modal;
}

function ChannelAccessModal({
  mode,
  draft,
  directory,
  loading,
  saving,
  notice,
  memberSearch,
  roleSearch,
  deleteConfirm,
  onDraft,
  onMemberSearch,
  onRoleSearch,
  onClose,
  onSave,
  onDelete,
}: {
  mode: "create" | "edit";
  draft: ChannelAccessDraft;
  directory: ChannelAccessDirectory;
  loading: boolean;
  saving: boolean;
  notice: string;
  memberSearch: string;
  roleSearch: string;
  deleteConfirm: boolean;
  onDraft: (draft: ChannelAccessDraft) => void;
  onMemberSearch: (value: string) => void;
  onRoleSearch: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const filteredMembers = useMemo(() => {
    const query = memberSearch.trim().toLocaleLowerCase();
    return directory.members.filter((member) => member.id !== directory.member.id && (!query || `${member.name} ${member.email} ${member.jobTitle} ${member.area}`.toLocaleLowerCase().includes(query)));
  }, [directory.member.id, directory.members, memberSearch]);

  const filteredRoles = useMemo(() => {
    const query = roleSearch.trim().toLocaleLowerCase();
    return directory.jobRoles.filter((role) => !query || `${role.name} ${role.department}`.toLocaleLowerCase().includes(query));
  }, [directory.jobRoles, roleSearch]);

  function toggleRole(role: MemberRole) {
    onDraft({
      ...draft,
      allowedRoles: draft.allowedRoles.includes(role)
        ? draft.allowedRoles.filter((item) => item !== role)
        : [...draft.allowedRoles, role],
    });
  }

  function toggleJobRole(id: string) {
    onDraft({
      ...draft,
      allowedJobRoleIds: draft.allowedJobRoleIds.includes(id)
        ? draft.allowedJobRoleIds.filter((item) => item !== id)
        : [...draft.allowedJobRoleIds, id],
    });
  }

  function toggleMember(id: string) {
    onDraft({
      ...draft,
      allowedMemberIds: draft.allowedMemberIds.includes(id)
        ? draft.allowedMemberIds.filter((item) => item !== id)
        : [...draft.allowedMemberIds, id],
    });
  }

  const explicitAccess = draft.allowedRoles.length + draft.allowedJobRoleIds.length + draft.allowedMemberIds.length;

  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && !saving && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose, saving]);

  return (
    <div className="channel-access-backdrop" onMouseDown={() => !saving && onClose()}>
      <section className="channel-access-modal" role="dialog" aria-modal="true" aria-label={mode === "create" ? "Criar canal" : "Editar canal"} onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><span>{draft.isPrivate ? <MessageSquareLock size={19} /> : <Hash size={19} />}</span><div><small>CANAIS / ADMINISTRAÇÃO</small><strong>{mode === "create" ? "Criar canal" : `Editar #${draft.name || "canal"}`}</strong><p>Nome, tipo e privacidade ficam no mesmo lugar.</p></div></div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Fechar"><X size={17} /></button>
        </header>

        {loading ? <div className="channel-access-loading"><LoaderCircle className="spin" size={22} /><strong>Carregando permissões</strong></div> : (
          <div className="channel-access-scroll">
            <section className="channel-access-section">
              <div className="channel-access-section-title"><Hash size={15} /><div><strong>Informações do canal</strong><small>O nome é convertido automaticamente para o padrão #canal.</small></div></div>
              <label>Nome do canal<input autoFocus required minLength={2} maxLength={60} value={draft.name} onChange={(event) => onDraft({ ...draft, name: event.target.value })} placeholder="ex.: desenvolvimento" /></label>
              <label>Descrição<textarea rows={3} value={draft.description} onChange={(event) => onDraft({ ...draft, description: event.target.value })} placeholder="Explique para que este canal existe…" /></label>
              <label>Tipo<select value={draft.type} onChange={(event) => onDraft({ ...draft, type: event.target.value as ManagedChannelType })}>{channelTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            </section>

            <section className="channel-access-section">
              <div className="channel-access-section-title"><Eye size={15} /><div><strong>Quem pode ver este canal?</strong><small>Canal público aparece para todos. Privado só aparece para pessoas autorizadas.</small></div></div>
              <div className="channel-visibility-choice">
                <button type="button" className={!draft.isPrivate ? "active" : ""} onClick={() => onDraft({ ...draft, isPrivate: false })}><Eye size={17} /><span><b>Público</b><small>Todos os membros ativos do espaço</small></span>{!draft.isPrivate && <Check size={15} />}</button>
                <button type="button" className={draft.isPrivate ? "active" : ""} onClick={() => onDraft({ ...draft, isPrivate: true })}><LockKeyhole size={17} /><span><b>Privado / restrito</b><small>Somente níveis, cargos ou pessoas escolhidas</small></span>{draft.isPrivate && <Check size={15} />}</button>
              </div>

              {draft.isPrivate && (
                <div className="channel-restrictions">
                  <div className="channel-access-note"><ShieldCheck size={15} /><span><b>Proprietário e administradores sempre têm acesso.</b><small>Isso evita que um canal fique impossível de administrar.</small></span></div>

                  <fieldset>
                    <legend>Níveis de acesso</legend>
                    <p>São permissões técnicas do Labstar, separadas do cargo profissional.</p>
                    <div className="channel-level-grid">{accessLevels.map((level) => <label key={level.value} className={draft.allowedRoles.includes(level.value) ? "active" : ""}><input type="checkbox" checked={draft.allowedRoles.includes(level.value)} onChange={() => toggleRole(level.value)} /><span><b>{level.label}</b><small>{level.detail}</small></span></label>)}</div>
                  </fieldset>

                  <fieldset>
                    <legend>Cargos profissionais</legend>
                    <p>Ex.: CEO, Desenvolvedor, Design, Marketing. Qualquer cargo marcado recebe acesso.</p>
                    <label className="channel-access-search"><Search size={13} /><input value={roleSearch} onChange={(event) => onRoleSearch(event.target.value)} placeholder="Buscar cargo profissional" /></label>
                    <div className="channel-role-grid">
                      {filteredRoles.map((role) => <label key={role.id} className={draft.allowedJobRoleIds.includes(role.id) ? "active" : ""} style={{ "--role-color": role.color } as React.CSSProperties}><input type="checkbox" checked={draft.allowedJobRoleIds.includes(role.id)} onChange={() => toggleJobRole(role.id)} /><i /><span><b>{role.name}</b><small>{role.department}</small></span></label>)}
                      {!filteredRoles.length && <p className="channel-access-empty">Nenhum cargo encontrado.</p>}
                    </div>
                  </fieldset>

                  <fieldset>
                    <legend>Pessoas específicas</legend>
                    <p>Use quando apenas uma ou algumas pessoas devem entrar, independentemente do cargo.</p>
                    <label className="channel-access-search"><Search size={13} /><input value={memberSearch} onChange={(event) => onMemberSearch(event.target.value)} placeholder="Buscar pessoa" /></label>
                    <div className="channel-member-access-list">
                      {filteredMembers.map((member) => <label key={member.id} className={draft.allowedMemberIds.includes(member.id) ? "active" : ""}><input type="checkbox" checked={draft.allowedMemberIds.includes(member.id)} onChange={() => toggleMember(member.id)} /><span className="channel-member-monogram">{member.name.slice(0, 2).toUpperCase()}</span><span><b>{member.name}</b><small>{member.jobRoles[0]?.name || member.jobTitle || member.area || "Membro"}</small></span></label>)}
                    </div>
                  </fieldset>

                  {explicitAccess === 0 && <div className="channel-access-warning"><EyeOff size={15} /><span>Você não selecionou nenhum grupo ou pessoa. O canal ficará visível somente para administradores e quem tiver permissão de gerenciar canais.</span></div>}
                </div>
              )}
            </section>

            <section className="channel-access-section compact">
              <div className="channel-access-section-title"><Users size={15} /><div><strong>Mensagens</strong><small>Controle simples sem misturar isso com a visibilidade.</small></div></div>
              <label className="channel-readonly-toggle"><input type="checkbox" checked={draft.readOnly} onChange={(event) => onDraft({ ...draft, readOnly: event.target.checked })} /><span><b>Somente leitura</b><small>Todos que têm acesso podem ler; apenas administradores e quem gerencia canais pode publicar.</small></span><i /></label>
            </section>
          </div>
        )}

        <footer>
          <div>
            {mode === "edit" && <button type="button" className={`danger ${deleteConfirm ? "confirm" : ""}`} disabled={saving} onClick={onDelete}><Trash2 size={14} /> {deleteConfirm ? "Confirmar exclusão do canal" : "Excluir canal"}</button>}
            {notice && <span role="status">{notice}</span>}
          </div>
          <div><button type="button" onClick={onClose} disabled={saving}>Cancelar</button><button type="button" className="primary" onClick={onSave} disabled={saving || loading || draft.name.trim().length < 2}>{saving ? <LoaderCircle className="spin" size={14} /> : <Save size={14} />} {saving ? "Salvando…" : mode === "create" ? "Criar canal" : "Salvar canal"}</button></div>
        </footer>
      </section>
    </div>
  );
}

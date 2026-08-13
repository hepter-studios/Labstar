import {
  Building2,
  Check,
  ChevronDown,
  Crown,
  LoaderCircle,
  Plus,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  Trash2,
  UserRoundCog,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { secureSignOut } from "../lib/access";
import { LottieAnimation } from "./LottieAnimation";
import {
  PRIMARY_ORGANIZATION_ID,
  clearActiveOrganization,
  createOrganization,
  deleteOrganization,
  listMyOrganizations,
  listOrganizationAccounts,
  loadActiveOrganizationId,
  normalizeGlobalHandle,
  setActiveOrganization,
  setOrganizationAccountRole,
  updateOrganizationProfile,
  type Organization,
  type OrganizationAccount,
  type OrganizationRole,
} from "../lib/organizations";

const MOBILE_QUERY = "(max-width: 760px)";

const ROLE_LABEL: Record<OrganizationRole, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  manager: "Gestor",
  member: "Membro",
  viewer: "Leitura",
};

function errorCode(error: unknown) {
  return String((error as { code?: string })?.code ?? (error as Error)?.message ?? "").toLowerCase();
}

function errorMessage(error: unknown) {
  const code = errorCode(error);
  if (code.includes("organization_migration_required")) return "As funções de organização ainda estão sendo publicadas. Tente novamente em instantes.";
  if (code.includes("organization_limit_reached")) return "Esta conta atingiu o limite de organizações.";
  if (code.includes("invalid_organization_name")) return "Use um nome entre 2 e 80 caracteres.";
  if (code.includes("invalid_organization_handle")) return "O @handle precisa ter de 3 a 48 caracteres, usando letras, números e hífens.";
  if (code.includes("organization_handle_taken")) return "Esse @handle já está sendo usado por outra organização.";
  if (code.includes("organization_requires_owner")) return "A organização precisa manter pelo menos um proprietário.";
  if (code.includes("owner_required")) return "Somente um proprietário pode fazer essa alteração.";
  if (code.includes("primary_organization_protected")) return "A organização principal do Labstar é protegida contra exclusão.";
  if (code.includes("organization_delete_confirmation_mismatch")) return "Digite o @handle exato para confirmar a exclusão.";
  if (code.includes("permission_denied")) return "Sua conta não tem permissão para fazer essa alteração.";
  if (code.includes("member_not_authorized")) return "Sua conta não está autorizada nesta organização.";
  return "Não foi possível concluir essa ação.";
}

export function OrganizationSwitcherPortal() {
  const [target, setTarget] = useState<Element | null>(null);
  const [mobile, setMobile] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selected, setSelected] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState("");
  const [createdNotice, setCreatedNotice] = useState<Organization | null>(null);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsName, setSettingsName] = useState("");
  const [settingsSlug, setSettingsSlug] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [accounts, setAccounts] = useState<OrganizationAccount[]>([]);
  const [roleSavingId, setRoleSavingId] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);

  const switcherRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    const find = () => {
      setMobile(media.matches);
      setTarget(document.querySelector(".header-actions") ?? document.querySelector(".header"));
    };
    find();
    const observer = new MutationObserver(find);
    observer.observe(document.body, { childList: true, subtree: true });
    media.addEventListener("change", find);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", find);
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await listMyOrganizations();
      setOrganizations(next);
      const preferred = loadActiveOrganizationId();
      const active = next.find((organization) => organization.id === preferred)
        ?? next.find((organization) => organization.id === PRIMARY_ORGANIZATION_ID)
        ?? next[0]
        ?? null;
      if (active) setActiveOrganization(active);
      setSelected(active);
      return { organizations: next, selected: active };
    } catch {
      setError("Não foi possível carregar suas organizações.");
      return { organizations: [] as Organization[], selected: null as Organization | null };
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = (event: PointerEvent) => {
      const node = event.target as Node;
      if (switcherRef.current?.contains(node)) return;
      setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", escape);
    };
  }, [menuOpen]);

  useEffect(() => {
    document.body.classList.toggle("labstar-secondary-organization-active", Boolean(selected && !selected.isPrimaryLegacy));
    return () => document.body.classList.remove("labstar-secondary-organization-active");
  }, [selected]);

  const primary = useMemo(
    () => organizations.find((organization) => organization.isPrimaryLegacy) ?? null,
    [organizations],
  );
  const canEditSelected = selected?.role === "owner" || selected?.role === "admin";
  const canOwnSelected = selected?.role === "owner";
  const normalizedDeleteConfirmation = normalizeGlobalHandle(deleteConfirmation.replace(/^@/, ""));
  const deleteConfirmed = Boolean(selected && normalizedDeleteConfirmation === selected.slug);

  function choose(organization: Organization) {
    setSelected(organization);
    setActiveOrganization(organization);
    setCreatedNotice(null);
    setMenuOpen(false);
  }

  async function submitCreate(event: React.FormEvent) {
    event.preventDefault();
    if (creating || name.trim().length < 2) return;
    setCreating(true);
    setError("");
    try {
      const created = await createOrganization(name, slug);
      setOrganizations((current) => [...current.filter((organization) => organization.id !== created.id), created]);
      // A criação não troca o contexto ativo silenciosamente. A troca anterior
      // abria a superfície isolada da nova organização sobre todo o aplicativo,
      // dando a impressão de travamento e podendo expor um contexto incoerente.
      if (!selected) {
        setSelected(created);
        setActiveOrganization(created);
      }
      setCreatedNotice(created);
      setName("");
      setSlug("");
      setCreateOpen(false);
      setMenuOpen(true);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setCreating(false);
    }
  }

  const loadAccounts = useCallback(async (organization: Organization) => {
    if (organization.role !== "owner" && organization.role !== "admin") {
      setAccounts([]);
      return;
    }
    setSettingsLoading(true);
    try {
      setAccounts(await listOrganizationAccounts(organization.id));
    } catch (cause) {
      setSettingsError(errorMessage(cause));
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  function openSettings() {
    if (!selected || (selected.role !== "owner" && selected.role !== "admin")) return;
    setSettingsName(selected.name);
    setSettingsSlug(selected.slug);
    setSettingsError("");
    setDeleteConfirmation("");
    setSettingsOpen(true);
    setMenuOpen(false);
    void loadAccounts(selected);
  }

  async function saveOrganizationSettings(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !canEditSelected || settingsSaving) return;
    setSettingsSaving(true);
    setSettingsError("");
    try {
      const updated = await updateOrganizationProfile(selected.id, settingsName, settingsSlug);
      setOrganizations((current) => current.map((organization) => organization.id === updated.id ? updated : organization));
      setSelected(updated);
      setActiveOrganization(updated);
      setSettingsName(updated.name);
      setSettingsSlug(updated.slug);
    } catch (cause) {
      setSettingsError(errorMessage(cause));
    } finally {
      setSettingsSaving(false);
    }
  }

  async function changeAccountRole(account: OrganizationAccount, role: OrganizationRole) {
    if (!selected || selected.role !== "owner" || roleSavingId) return;
    setRoleSavingId(account.authUserId);
    setSettingsError("");
    try {
      await setOrganizationAccountRole(selected.id, account.authUserId, role);
      const currentOrganizationId = selected.id;
      const result = await refresh();
      const updatedSelected = result.organizations.find((organization) => organization.id === currentOrganizationId) ?? null;
      if (!updatedSelected || (updatedSelected.role !== "owner" && updatedSelected.role !== "admin")) {
        setSettingsOpen(false);
        return;
      }
      await loadAccounts(updatedSelected);
    } catch (cause) {
      setSettingsError(errorMessage(cause));
    } finally {
      setRoleSavingId("");
    }
  }

  async function confirmDeleteOrganization() {
    if (!selected || selected.role !== "owner" || selected.isPrimaryLegacy || !deleteConfirmed || deleting) return;
    const deletedId = selected.id;
    setDeleting(true);
    setSettingsError("");
    try {
      await deleteOrganization(deletedId, deleteConfirmation.replace(/^@/, ""));
      const remaining = (await listMyOrganizations()).filter((organization) => organization.id !== deletedId);
      setOrganizations(remaining);
      setSettingsOpen(false);
      setDeleteConfirmation("");
      const next = remaining.find((organization) => organization.isPrimaryLegacy) ?? remaining[0] ?? null;
      if (next) {
        setSelected(next);
        setActiveOrganization(next);
      } else {
        setSelected(null);
        clearActiveOrganization();
        await secureSignOut();
      }
    } catch (cause) {
      setSettingsError(errorMessage(cause));
    } finally {
      setDeleting(false);
    }
  }

  if (!target) return null;

  const switcher = createPortal(
    <div className="organization-switcher" ref={switcherRef}>
      <button
        type="button"
        className={`organization-switcher-trigger ${menuOpen ? "active" : ""}`}
        aria-label="Escolher organização"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((value) => !value)}
      >
        <Building2 size={17} />
        {!mobile && <span>{selected?.name ?? "Organização"}</span>}
        {!mobile && <ChevronDown size={14} />}
      </button>

      {menuOpen && (
        <section className="organization-switcher-menu" aria-label="Organizações">
          <header>
            <div><small>ORGANIZAÇÃO</small><strong>{selected?.name ?? "Labstar"}</strong></div>
            <button type="button" onClick={() => setMenuOpen(false)} aria-label="Fechar"><X size={15} /></button>
          </header>

          <div className="organization-switcher-list">
            {loading && <div className="organization-switcher-status"><LoaderCircle className="spin" size={16} /> Carregando organizações</div>}
            {!loading && organizations.map((organization) => (
              <button
                type="button"
                key={organization.id}
                className={selected?.id === organization.id ? "active" : ""}
                onClick={() => choose(organization)}
              >
                <span className="organization-switcher-icon"><Building2 size={16} /></span>
                <span><strong>{organization.name}</strong><small>@{organization.slug} · {ROLE_LABEL[organization.role]}</small></span>
                {selected?.id === organization.id && <Check size={15} />}
              </button>
            ))}
          </div>

          {error && <div className="organization-switcher-error">{error}</div>}

          {createdNotice && (
            <div className="organization-created-notice" role="status">
              <LottieAnimation kind="free-consultation" textReplacement="ORGANIZAÇÃO" className="organization-created-lottie" preserveAspectRatio="xMidYMid meet" />
              <div><strong>{createdNotice.name} foi criada</strong><small>Ela já está disponível no seletor. Seu ambiente atual permaneceu aberto.</small></div>
              <button type="button" onClick={() => setCreatedNotice(null)} aria-label="Fechar confirmação"><X size={13} /></button>
            </div>
          )}

          <footer className="organization-switcher-footer">
            <button type="button" onClick={() => { setError(""); setCreateOpen(true); }}><Plus size={15} /> Criar organização</button>
            {canEditSelected && <button className="organization-manage-button" type="button" onClick={openSettings} aria-label="Configurações da organização"><Settings2 size={14} /></button>}
            <button type="button" onClick={() => void refresh()} aria-label="Atualizar organizações"><RotateCcw size={14} /></button>
          </footer>
        </section>
      )}
    </div>,
    target,
  );

  const createModal = createOpen ? createPortal(
    <div className="organization-modal-backdrop" onMouseDown={() => !creating && setCreateOpen(false)}>
      <section className="organization-modal" role="dialog" aria-modal="true" aria-label="Criar organização" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><span><Building2 size={18} /></span><div><strong>Criar organização</strong><small>Inicie um ambiente isolado no Labstar.</small></div></div>
          <button type="button" disabled={creating} onClick={() => setCreateOpen(false)} aria-label="Fechar"><X size={16} /></button>
        </header>
        <form onSubmit={submitCreate}>
          <div className="organization-create-illustration">
            <LottieAnimation kind="free-consultation" textReplacement="ORGANIZAÇÃO" preserveAspectRatio="xMidYMid meet" />
          </div>
          <label>Nome da organização<input autoFocus required minLength={2} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Acme Labs" /></label>
          <label>Handle <small>Opcional. Precisa ser único no Labstar.</small><input maxLength={48} value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="acme-labs" /></label>
          <div className="organization-modal-note">
            <strong>As outras organizações não serão alteradas.</strong>
            <span>Cada organização mantém vínculo e permissões próprios.</span>
          </div>
          {error && <div className="organization-switcher-error">{error}</div>}
          <button className="organization-create-submit" type="submit" disabled={creating || name.trim().length < 2}>
            {creating ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />} Criar organização
          </button>
        </form>
      </section>
    </div>,
    document.body,
  ) : null;

  const settingsModal = settingsOpen && selected ? createPortal(
    <div className="organization-modal-backdrop" onMouseDown={() => !settingsSaving && !deleting && setSettingsOpen(false)}>
      <section className="organization-modal organization-settings-modal" role="dialog" aria-modal="true" aria-label="Configurações da organização" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><span><Settings2 size={18} /></span><div><strong>Configurações da organização</strong><small>@{selected.slug}</small></div></div>
          <button type="button" disabled={settingsSaving || deleting} onClick={() => setSettingsOpen(false)} aria-label="Fechar"><X size={16} /></button>
        </header>

        <div className="organization-settings-scroll">
          <form className="organization-settings-section" onSubmit={saveOrganizationSettings}>
            <div className="organization-settings-heading"><Building2 size={15} /><div><strong>Identidade</strong><small>Nome e endereço público da organização.</small></div></div>
            <label>Nome<input required minLength={2} maxLength={80} value={settingsName} onChange={(event) => setSettingsName(event.target.value)} /></label>
            <label>@Handle <small>Único em todo o Labstar.</small><input required minLength={3} maxLength={48} value={settingsSlug} onChange={(event) => setSettingsSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} /></label>
            <button className="organization-settings-save" type="submit" disabled={settingsSaving || settingsName.trim().length < 2 || normalizeGlobalHandle(settingsSlug).length < 3}>
              {settingsSaving ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />}{settingsSaving ? "Salvando…" : "Salvar alterações"}
            </button>
          </form>

          <section className="organization-settings-section organization-owners-section">
            <div className="organization-settings-heading"><Crown size={15} /><div><strong>Proprietários e acesso</strong><small>Uma organização pode ter mais de um proprietário.</small></div></div>
            {settingsLoading ? (
              <div className="organization-switcher-status"><LoaderCircle className="spin" size={15} /> Carregando membros</div>
            ) : (
              <div className="organization-account-list">
                {accounts.map((account) => (
                  <div className="organization-account-row" key={account.authUserId}>
                    <span className="organization-account-avatar"><UserRoundCog size={15} /></span>
                    <span className="organization-account-copy"><strong>{account.name}{account.isCurrentUser ? " (você)" : ""}</strong><small>{account.email}</small></span>
                    {canOwnSelected ? (
                      <select
                        value={account.role}
                        disabled={Boolean(roleSavingId)}
                        aria-label={`Permissão de ${account.name}`}
                        onChange={(event) => void changeAccountRole(account, event.target.value as OrganizationRole)}
                      >
                        {(Object.keys(ROLE_LABEL) as OrganizationRole[]).map((role) => <option value={role} key={role}>{ROLE_LABEL[role]}</option>)}
                      </select>
                    ) : (
                      <span className={`organization-role-pill ${account.role}`}>{ROLE_LABEL[account.role]}</span>
                    )}
                    {roleSavingId === account.authUserId && <LoaderCircle className="spin organization-role-spinner" size={13} />}
                  </div>
                ))}
                {!accounts.length && !settingsLoading && <div className="organization-switcher-status">Nenhum vínculo de conta encontrado.</div>}
              </div>
            )}
            <div className="organization-owner-note"><ShieldCheck size={13} /><span>Somente um proprietário pode promover ou rebaixar outros membros. O banco impede a remoção do último proprietário.</span></div>
          </section>

          {canOwnSelected && (
            <section className="organization-settings-section organization-danger-zone" data-labstar-destructive-confirmation="true">
              <div className="organization-settings-heading"><Trash2 size={15} /><div><strong>Zona de perigo</strong><small>{selected.isPrimaryLegacy ? "A organização principal é protegida." : "Esta ação apaga a organização e não pode ser desfeita."}</small></div></div>
              {selected.isPrimaryLegacy ? (
                <div className="organization-protected-note"><ShieldCheck size={14} /> Hepter Studios não pode ser apagada por esta tela.</div>
              ) : (
                <>
                  <label>Digite <b>@{selected.slug}</b> para confirmar<input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} placeholder={`@${selected.slug}`} /></label>
                  <button className="organization-delete-button" type="button" disabled={!deleteConfirmed || deleting} onClick={() => void confirmDeleteOrganization()}>
                    {deleting ? <LoaderCircle className="spin" size={15} /> : <Trash2 size={15} />}{deleting ? "Apagando…" : "Apagar organização"}
                  </button>
                </>
              )}
            </section>
          )}

          {settingsError && <div className="organization-switcher-error organization-settings-error">{settingsError}</div>}
        </div>
      </section>
    </div>,
    document.body,
  ) : null;

  const secondarySurface = selected && !selected.isPrimaryLegacy ? createPortal(
    <main className="organization-empty-surface" aria-label={`${selected.name} organization`}>
      <section>
        <span className="organization-empty-icon"><Building2 size={24} /></span>
        <small>ORGANIZAÇÃO</small>
        <h1>{selected.name}</h1>
        <p>Esta organização é separada dos outros ambientes do Labstar. Os dados, membros e permissões pertencem somente a ela.</p>
        <div className="organization-empty-meta"><span>@{selected.slug}</span><span>{ROLE_LABEL[selected.role]}</span><span>Idioma: Português / English</span></div>
        <div className="organization-empty-actions">
          {canEditSelected && <button type="button" onClick={openSettings}><Settings2 size={14} /> Gerenciar organização</button>}
          {primary && <button type="button" onClick={() => choose(primary)}>Voltar para {primary.name}</button>}
        </div>
      </section>
    </main>,
    document.body,
  ) : null;

  return <>{switcher}{createModal}{settingsModal}{secondarySurface}</>;
}

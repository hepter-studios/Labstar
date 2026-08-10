import {
  Building2,
  Check,
  ChevronDown,
  LoaderCircle,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  PRIMARY_ORGANIZATION_ID,
  createOrganization,
  listMyOrganizations,
  loadActiveOrganizationId,
  setActiveOrganization,
  type Organization,
} from "../lib/organizations";

const MOBILE_QUERY = "(max-width: 760px)";

function errorMessage(error: unknown) {
  const code = String((error as { code?: string })?.code ?? (error as Error)?.message ?? "");
  if (code.includes("organization_migration_required")) return "Organization support is still being published. Try again in a moment.";
  if (code.includes("organization_limit_reached")) return "This account reached the organization creation limit.";
  if (code.includes("invalid_organization_name")) return "Use an organization name between 2 and 80 characters.";
  if (code.includes("member_not_authorized")) return "Your account is not authorized to create organizations.";
  return "The organization could not be created.";
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
    } catch {
      setError("Organizations could not be loaded.");
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

  function choose(organization: Organization) {
    setSelected(organization);
    setActiveOrganization(organization);
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
      setSelected(created);
      setActiveOrganization(created);
      setName("");
      setSlug("");
      setCreateOpen(false);
      setMenuOpen(false);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setCreating(false);
    }
  }

  if (!target) return null;

  const switcher = createPortal(
    <div className="organization-switcher" ref={switcherRef}>
      <button
        type="button"
        className={`organization-switcher-trigger ${menuOpen ? "active" : ""}`}
        aria-label="Choose organization"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((value) => !value)}
      >
        <Building2 size={17} />
        {!mobile && <span>{selected?.name ?? "Organization"}</span>}
        {!mobile && <ChevronDown size={14} />}
      </button>

      {menuOpen && (
        <section className="organization-switcher-menu" aria-label="Organizations">
          <header>
            <div><small>ORGANIZATION</small><strong>{selected?.name ?? "Labstar"}</strong></div>
            <button type="button" onClick={() => setMenuOpen(false)} aria-label="Close"><X size={15} /></button>
          </header>

          <div className="organization-switcher-list">
            {loading && <div className="organization-switcher-status"><LoaderCircle className="spin" size={16} /> Loading organizations</div>}
            {!loading && organizations.map((organization) => (
              <button
                type="button"
                key={organization.id}
                className={selected?.id === organization.id ? "active" : ""}
                onClick={() => choose(organization)}
              >
                <span className="organization-switcher-icon"><Building2 size={16} /></span>
                <span><strong>{organization.name}</strong><small>@{organization.slug} · {organization.role}</small></span>
                {selected?.id === organization.id && <Check size={15} />}
              </button>
            ))}
          </div>

          {error && <div className="organization-switcher-error">{error}</div>}

          <footer>
            <button type="button" onClick={() => { setError(""); setCreateOpen(true); }}><Plus size={15} /> Create organization</button>
            <button type="button" onClick={() => void refresh()} aria-label="Refresh organizations"><RotateCcw size={14} /></button>
          </footer>
        </section>
      )}
    </div>,
    target,
  );

  const createModal = createOpen ? createPortal(
    <div className="organization-modal-backdrop" onMouseDown={() => !creating && setCreateOpen(false)}>
      <section className="organization-modal" role="dialog" aria-modal="true" aria-label="Create organization" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><span><Building2 size={18} /></span><div><strong>Create organization</strong><small>Start an isolated Labstar organization.</small></div></div>
          <button type="button" disabled={creating} onClick={() => setCreateOpen(false)} aria-label="Close"><X size={16} /></button>
        </header>
        <form onSubmit={submitCreate}>
          <label>Organization name<input autoFocus required minLength={2} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Acme Labs" /></label>
          <label>Handle <small>Optional. Labstar can generate it from the name.</small><input maxLength={48} value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="acme-labs" /></label>
          <div className="organization-modal-note">
            <strong>Your existing Hepter Studios organization will not be changed.</strong>
            <span>New organizations start empty and never expose the original workspace while selected.</span>
          </div>
          {error && <div className="organization-switcher-error">{error}</div>}
          <button className="organization-create-submit" type="submit" disabled={creating || name.trim().length < 2}>
            {creating ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />} Create organization
          </button>
        </form>
      </section>
    </div>,
    document.body,
  ) : null;

  const secondarySurface = selected && !selected.isPrimaryLegacy ? createPortal(
    <main className="organization-empty-surface" aria-label={`${selected.name} organization`}>
      <section>
        <span className="organization-empty-icon"><Building2 size={24} /></span>
        <small>ORGANIZATION</small>
        <h1>{selected.name}</h1>
        <p>This organization is isolated from the original Hepter Studios workspace. The organization shell is ready; spaces, channels, repositories and project data will be provisioned here as the multi-tenant migration advances.</p>
        <div className="organization-empty-meta"><span>@{selected.slug}</span><span>{selected.role}</span><span>Default language: English</span></div>
        {primary && <button type="button" onClick={() => choose(primary)}>Return to {primary.name}</button>}
      </section>
    </main>,
    document.body,
  ) : null;

  return <>{switcher}{createModal}{secondarySurface}</>;
}

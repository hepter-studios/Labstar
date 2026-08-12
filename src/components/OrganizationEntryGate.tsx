import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  LoaderCircle,
  Plus,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  createOrganization,
  isOrganizationHandleAvailable,
  listMyOrganizations,
  loadActiveOrganizationId,
  normalizeGlobalHandle,
  setActiveOrganization,
  type Organization,
} from "../lib/organizations";
import { LabstarAccessLoader } from "./LottieExperience";

type EntryStage = "loading" | "choose" | "create" | "creating" | "entering" | "error";
type HandleState = "idle" | "checking" | "available" | "taken" | "error";

const ENTRY_TRANSITION_TIME_MS = 1050;
const PREVIEW_ORGANIZATIONS_KEY = "labstar-dev-preview-organizations-v1";
const PREVIEW_ACTIVE_ORGANIZATION_KEY = "labstar-dev-preview-active-organization-v1";
let previewResetConsumed = false;

type OrganizationEntryGateProps = {
  children: ReactNode;
  devPreview?: boolean;
  forceChooserInDevPreview?: boolean;
  resetDevPreview?: boolean;
};

function readPreviewOrganizations(reset: boolean) {
  try {
    if (reset && !previewResetConsumed) {
      previewResetConsumed = true;
      window.localStorage.removeItem(PREVIEW_ORGANIZATIONS_KEY);
      window.localStorage.removeItem(PREVIEW_ACTIVE_ORGANIZATION_KEY);
    }
    const stored = window.localStorage.getItem(PREVIEW_ORGANIZATIONS_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed as Organization[] : [];
  } catch {
    return [];
  }
}

function writePreviewOrganizations(organizations: Organization[]) {
  window.localStorage.setItem(PREVIEW_ORGANIZATIONS_KEY, JSON.stringify(organizations));
}

function previewActiveOrganizationId() {
  try {
    return window.localStorage.getItem(PREVIEW_ACTIVE_ORGANIZATION_KEY) || "";
  } catch {
    return "";
  }
}

function setPreviewActiveOrganization(organization: Organization) {
  try {
    window.localStorage.setItem(PREVIEW_ACTIVE_ORGANIZATION_KEY, organization.id);
  } catch {
    // O modo de demonstração continua em memória se o storage estiver indisponível.
  }
}

function previewHandleAvailable(handle: string, organizations: Organization[]) {
  const normalized = normalizeGlobalHandle(handle);
  return normalized.length >= 3
    && normalized.length <= 48
    && !organizations.some((organization) => organization.slug === normalized);
}

function createPreviewOrganization(name: string, requestedHandle: string, organizations: Organization[]) {
  const normalizedName = normalizeGlobalHandle(name) || "organizacao";
  const baseSlug = requestedHandle || (normalizedName.length >= 3 ? normalizedName : `${normalizedName}-lab`);
  if (requestedHandle && !previewHandleAvailable(requestedHandle, organizations)) {
    throw Object.assign(new Error("organization_handle_taken"), { code: "organization_handle_taken" });
  }

  let slug = baseSlug;
  let suffix = 2;
  while (organizations.some((organization) => organization.slug === slug)) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  const organization: Organization = {
    id: globalThis.crypto?.randomUUID?.() ?? `preview-${Date.now()}`,
    name: name.trim(),
    slug,
    role: "owner",
    isPrimaryLegacy: false,
    defaultLocale: "pt-BR",
    enabledLocales: ["pt-BR", "en"],
    createdAt: new Date().toISOString(),
  };
  writePreviewOrganizations([...organizations, organization]);
  return organization;
}

function creationError(cause: unknown) {
  const value = String((cause as { code?: string })?.code ?? (cause as Error)?.message ?? "");
  if (value.includes("organization_limit_reached")) return "Esta conta atingiu o limite de organizações.";
  if (value.includes("invalid_organization_name")) return "Use um nome entre 2 e 80 caracteres.";
  if (value.includes("invalid_organization_handle")) return "O handle precisa ter de 3 a 48 caracteres, usando letras, números e hífens.";
  if (value.includes("organization_handle_taken")) return "Esse @handle já está sendo usado por outra organização.";
  if (value.includes("member_not_authorized")) return "Sua conta ainda não tem permissão para criar uma organização.";
  if (value.includes("organization_migration_required")) return "A criação de organizações ainda está sendo publicada. Tente novamente em instantes.";
  return "Não foi possível criar a organização. Tente novamente.";
}

export function OrganizationEntryGate({
  children,
  devPreview = false,
  forceChooserInDevPreview = false,
  resetDevPreview = false,
}: OrganizationEntryGateProps) {
  const safeDevPreview = import.meta.env.DEV && devPreview;
  const [done, setDone] = useState(false);
  const [stage, setStage] = useState<EntryStage>("loading");
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selected, setSelected] = useState<Organization | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [handleState, setHandleState] = useState<HandleState>("idle");
  const [error, setError] = useState("");
  const finishTimerRef = useRef<number | null>(null);

  const getOrganizations = useCallback(async () => {
    if (safeDevPreview) return readPreviewOrganizations(resetDevPreview);
    return listMyOrganizations();
  }, [resetDevPreview, safeDevPreview]);

  const getActiveOrganizationId = useCallback(() => (
    safeDevPreview ? previewActiveOrganizationId() : loadActiveOrganizationId()
  ), [safeDevPreview]);

  const activateOrganization = useCallback((organization: Organization) => {
    if (safeDevPreview) {
      setPreviewActiveOrganization(organization);
      return;
    }
    setActiveOrganization(organization);
  }, [safeDevPreview]);

  const refresh = useCallback(async () => {
    setStage("loading");
    setError("");
    try {
      const next = await getOrganizations();
      const preferred = getActiveOrganizationId();
      const active = next.find((organization) => organization.id === preferred) ?? null;
      const suggested = active
        ?? next.find((organization) => organization.isPrimaryLegacy)
        ?? next[0]
        ?? null;
      setOrganizations(next);
      setSelected(suggested);

      // The stored id is only accepted after it has been found in the server-side
      // membership list. This restores the app without trusting stale browser state.
      if (active && !forceChooserInDevPreview) {
        activateOrganization(active);
        setDone(true);
        return;
      }
      setStage(next.length ? "choose" : "create");
    } catch {
      setStage("error");
      setError("Não foi possível carregar suas organizações.");
    }
  }, [activateOrganization, forceChooserInDevPreview, getActiveOrganizationId, getOrganizations]);

  useEffect(() => {
    void refresh();
    return () => {
      if (finishTimerRef.current !== null) window.clearTimeout(finishTimerRef.current);
    };
  }, [refresh]);

  useEffect(() => {
    if (stage !== "create") return undefined;
    const normalized = normalizeGlobalHandle(slug);
    if (!normalized) {
      setHandleState("idle");
      return undefined;
    }
    if (normalized.length < 3 || normalized.length > 48 || normalized.startsWith("-") || normalized.endsWith("-")) {
      setHandleState("taken");
      return undefined;
    }

    let cancelled = false;
    setHandleState("checking");
    const timer = window.setTimeout(() => {
      const availability = safeDevPreview
        ? Promise.resolve(previewHandleAvailable(normalized, organizations))
        : isOrganizationHandleAvailable(normalized);
      void availability
        .then((available) => {
          if (!cancelled) setHandleState(available ? "available" : "taken");
        })
        .catch(() => {
          if (!cancelled) setHandleState("error");
        });
    }, 320);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [organizations, safeDevPreview, slug, stage]);

  const finishEntry = useCallback((organization: Organization) => {
    setSelected(organization);
    activateOrganization(organization);
    setStage("entering");
    if (finishTimerRef.current !== null) window.clearTimeout(finishTimerRef.current);
    finishTimerRef.current = window.setTimeout(() => {
      finishTimerRef.current = null;
      setDone(true);
    }, ENTRY_TRANSITION_TIME_MS);
  }, [activateOrganization]);

  const enter = useCallback((organization: Organization) => {
    finishEntry(organization);
  }, [finishEntry]);

  const canDismiss = Boolean(selected) && stage !== "loading" && stage !== "creating" && stage !== "entering";

  useEffect(() => {
    if (!canDismiss || !selected) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      finishEntry(selected);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canDismiss, finishEntry, selected]);

  async function submitCreate(event: React.FormEvent) {
    event.preventDefault();
    if (name.trim().length < 2 || stage === "creating") return;

    const requestedHandle = normalizeGlobalHandle(slug);
    if (requestedHandle) {
      setHandleState("checking");
      try {
        const available = safeDevPreview
          ? previewHandleAvailable(requestedHandle, organizations)
          : await isOrganizationHandleAvailable(requestedHandle);
        if (!available) {
          setHandleState("taken");
          setError("Esse @handle já está sendo usado por outra organização.");
          return;
        }
        setHandleState("available");
      } catch {
        setHandleState("error");
        setError("Não foi possível confirmar a disponibilidade do @handle agora.");
        return;
      }
    }

    setError("");
    setStage("creating");

    try {
      const created = safeDevPreview
        ? createPreviewOrganization(name, requestedHandle, organizations)
        : await createOrganization(name, requestedHandle);
      setOrganizations((current) => [...current.filter((organization) => organization.id !== created.id), created]);
      finishEntry(created);
    } catch (cause) {
      setError(creationError(cause));
      if (String((cause as Error)?.message ?? "").includes("organization_handle_taken")) setHandleState("taken");
      setStage("create");
    }
  }

  const firstOrganization = organizations.length === 0;
  const primaryAction = selected ? `Entrar em ${selected.name}` : "Entrar";
  const explicitHandleInvalid = Boolean(slug.trim()) && handleState === "taken";

  if (done) return <>{children}</>;
  if (stage === "entering") return <LabstarAccessLoader />;

  return (
    <main className={`organization-entry-screen stage-${stage}`} aria-label="Escolher organização">
      <div className="organization-entry-space" aria-hidden="true" />
      <div className="organization-entry-vignette" aria-hidden="true" />
      <div className="organization-entry-curtain" aria-hidden="true" />

      {canDismiss && selected && (
        <button
          type="button"
          className="organization-entry-dismiss"
          aria-label={`Fechar e entrar em ${selected.name}`}
          title={`Entrar em ${selected.name}`}
          onClick={() => finishEntry(selected)}
        >
          <X size={17} aria-hidden="true" />
        </button>
      )}

      <section className="organization-entry-glass">
          <strong className="organization-entry-brand" aria-label="Labstar">L<span>★</span>BSTAR</strong>

          {stage === "loading" && (
            <div className="organization-entry-loading">
              <LoaderCircle className="spin" size={21} aria-hidden="true" />
              <span>Preparando suas organizações</span>
            </div>
          )}

          {stage === "choose" && (
            <>
              <header className="organization-entry-copy">
                <h1>Escolha como continuar</h1>
                <p>Entre em uma organização ou crie uma nova.</p>
              </header>

              <div className="organization-entry-list" role="listbox" aria-label="Suas organizações">
                {organizations.map((organization) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected?.id === organization.id}
                    key={organization.id}
                    className={selected?.id === organization.id ? "active" : ""}
                    onClick={() => setSelected(organization)}
                  >
                    <span className="organization-entry-org-icon"><Building2 size={17} /></span>
                    <span className="organization-entry-org-copy">
                      <strong>{organization.name}</strong>
                      <small>@{organization.slug} · {organization.role}</small>
                    </span>
                    {selected?.id === organization.id && <Check size={16} />}
                  </button>
                ))}
              </div>

              <div className="organization-entry-actions">
                <button className="primary" type="button" disabled={!selected} onClick={() => selected && enter(selected)}>
                  {primaryAction}<ArrowRight size={16} />
                </button>
                <button className="secondary" type="button" onClick={() => { setError(""); setName(""); setSlug(""); setHandleState("idle"); setStage("create"); }}>
                  <Plus size={16} /> Criar nova organização
                </button>
              </div>
            </>
          )}

          {stage === "create" && (
            <>
              <header className="organization-entry-copy">
                <h1>{firstOrganization ? "Crie sua organização" : "Nova organização"}</h1>
                <p>{firstOrganization ? "Só precisamos de um nome para começar." : "Crie um novo ambiente separado no Labstar."}</p>
              </header>

              <form className="organization-entry-form" onSubmit={submitCreate}>
                <label>
                  <span>Nome</span>
                  <input autoFocus required minLength={2} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome da organização" />
                </label>
                <label>
                  <span>Handle <small>opcional · único no Labstar</small></span>
                  <div className={`organization-entry-handle handle-${handleState}`}>
                    <b>@</b>
                    <input
                      maxLength={48}
                      value={slug}
                      onChange={(event) => {
                        setError("");
                        setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                      }}
                      placeholder="minha-organizacao"
                      aria-invalid={explicitHandleInvalid}
                    />
                    <span className="organization-entry-handle-status" aria-live="polite">
                      {handleState === "checking" && <LoaderCircle className="spin" size={13} />}
                      {handleState === "available" && <><Check size={13} /> disponível</>}
                      {handleState === "taken" && "indisponível"}
                    </span>
                  </div>
                  {handleState === "taken" && <small className="organization-entry-handle-help error">Escolha outro @handle. Dois iguais nunca são permitidos.</small>}
                  {handleState === "error" && <small className="organization-entry-handle-help">Não foi possível verificar agora; a criação continuará protegida pelo banco.</small>}
                </label>

                {error && <div className="organization-entry-error">{error}</div>}

                <div className="organization-entry-actions form-actions">
                  {!firstOrganization && (
                    <button className="secondary icon-back" type="button" onClick={() => setStage("choose")}>
                      <ArrowLeft size={16} /> Voltar
                    </button>
                  )}
                  <button className="primary" type="submit" disabled={name.trim().length < 2 || explicitHandleInvalid || handleState === "checking"}>
                    Criar organização <ArrowRight size={16} />
                  </button>
                </div>
              </form>
            </>
          )}

          {stage === "creating" && (
            <div className="organization-entry-loading" aria-live="polite" aria-busy="true">
              <LoaderCircle className="spin" size={23} aria-hidden="true" />
              <span>Criando sua organização…</span>
            </div>
          )}

          {stage === "error" && (
            <div className="organization-entry-error-state">
              <h1>Não conseguimos carregar suas organizações.</h1>
              <p>{error}</p>
              <button className="primary" type="button" onClick={() => void refresh()}>
                Tentar novamente
              </button>
            </div>
          )}
      </section>
    </main>
  );
}

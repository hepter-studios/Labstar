import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  LoaderCircle,
  Plus,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  createOrganization,
  isOrganizationHandleAvailable,
  listMyOrganizations,
  loadActiveOrganizationId,
  normalizeGlobalHandle,
  setActiveOrganization,
  type Organization,
} from "../lib/organizations";
import { supabaseClient } from "../lib/supabase";
import { LottieAnimation } from "./LottieAnimation";

type EntryStage = "loading" | "choose" | "create" | "creating" | "entering" | "error" | "leaving";
type HandleState = "idle" | "checking" | "available" | "taken" | "error";

type OrganizationRow = {
  id?: unknown;
  name?: unknown;
  slug?: unknown;
  role?: unknown;
  is_primary_legacy?: unknown;
  default_locale?: unknown;
  enabled_locales?: unknown;
  created_at?: unknown;
};

const SESSION_PREFIX = "labstar-organization-entry-v2";
const ENTRY_ROCKET_TIME_MS = 1850;

function delay(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function organizationFromRow(row: OrganizationRow): Organization | null {
  const id = String(row.id ?? "");
  if (!id) return null;
  const role = String(row.role ?? "member") as Organization["role"];
  return {
    id,
    name: String(row.name ?? "Organization"),
    slug: String(row.slug ?? "organization"),
    role,
    isPrimaryLegacy: Boolean(row.is_primary_legacy),
    defaultLocale: row.default_locale === "pt-BR" ? "pt-BR" : "en",
    enabledLocales: Array.isArray(row.enabled_locales) ? row.enabled_locales.map(String) : ["en", "pt-BR"],
    createdAt: String(row.created_at ?? ""),
  };
}

async function listOrganizationsForEntry() {
  // Use the RPC directly here so a genuinely empty membership list stays empty.
  if (supabaseClient) {
    const { data, error } = await supabaseClient.rpc("list_my_organizations");
    if (!error) {
      return (Array.isArray(data) ? data : [])
        .map((row) => organizationFromRow(row as OrganizationRow))
        .filter((organization): organization is Organization => Boolean(organization));
    }
  }
  return listMyOrganizations();
}

function hashToken(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

async function resolveSessionKey() {
  if (!supabaseClient) return `${SESSION_PREFIX}:browser`;
  const { data } = await supabaseClient.auth.getSession();
  const session = data.session;
  if (!session) return `${SESSION_PREFIX}:browser`;
  return `${SESSION_PREFIX}:${session.user.id}:${hashToken(session.access_token)}`;
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

export function OrganizationEntryGate({ children }: { children: ReactNode }) {
  const [done, setDone] = useState(false);
  const [stage, setStage] = useState<EntryStage>("loading");
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selected, setSelected] = useState<Organization | null>(null);
  const [sessionKey, setSessionKey] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [handleState, setHandleState] = useState<HandleState>("idle");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setStage("loading");
    setError("");
    try {
      const next = await listOrganizationsForEntry();
      const preferred = loadActiveOrganizationId();
      const active = next.find((organization) => organization.id === preferred)
        ?? next.find((organization) => organization.isPrimaryLegacy)
        ?? next[0]
        ?? null;
      setOrganizations(next);
      setSelected(active);
      setStage(next.length ? "choose" : "create");
    } catch {
      setStage("error");
      setError("Não foi possível carregar suas organizações.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void resolveSessionKey().then((key) => {
      if (cancelled) return;
      setSessionKey(key);
      try {
        if (window.sessionStorage.getItem(key) === "done") {
          setDone(true);
          return;
        }
      } catch {
        // Falha de storage não bloqueia o fluxo visual.
      }
      void refresh();
    });
    return () => {
      cancelled = true;
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
      void isOrganizationHandleAvailable(normalized)
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
  }, [slug, stage]);

  const markSeen = useCallback(() => {
    if (!sessionKey) return;
    try {
      window.sessionStorage.setItem(sessionKey, "done");
    } catch {
      // O onboarding continua mesmo quando storage está bloqueado.
    }
  }, [sessionKey]);

  const finishEntry = useCallback(async (organization: Organization) => {
    setSelected(organization);
    setActiveOrganization(organization);
    markSeen();
    setStage("entering");
    await delay(ENTRY_ROCKET_TIME_MS);
    setStage("leaving");
    window.setTimeout(() => setDone(true), 440);
  }, [markSeen]);

  const enter = useCallback((organization: Organization) => {
    void finishEntry(organization);
  }, [finishEntry]);

  async function submitCreate(event: React.FormEvent) {
    event.preventDefault();
    if (name.trim().length < 2 || stage === "creating") return;

    const requestedHandle = normalizeGlobalHandle(slug);
    if (requestedHandle) {
      setHandleState("checking");
      try {
        const available = await isOrganizationHandleAvailable(requestedHandle);
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
      const created = await createOrganization(name, requestedHandle);
      setOrganizations((current) => [...current.filter((organization) => organization.id !== created.id), created]);
      await finishEntry(created);
    } catch (cause) {
      setError(creationError(cause));
      if (String((cause as Error)?.message ?? "").includes("organization_handle_taken")) setHandleState("taken");
      setStage("create");
    }
  }

  const firstOrganization = organizations.length === 0;
  const primaryAction = useMemo(() => selected ? `Entrar em ${selected.name}` : "Entrar", [selected]);
  const explicitHandleInvalid = Boolean(slug.trim()) && handleState === "taken";

  if (done) return <>{children}</>;

  return (
    <main className={`organization-entry-screen stage-${stage}`} aria-label="Escolher organização">
      <div className="organization-entry-space" aria-hidden="true">
        <LottieAnimation kind="stars" className="organization-entry-stars" />
      </div>
      <div className="organization-entry-vignette" aria-hidden="true" />
      <div className="organization-entry-curtain" aria-hidden="true" />

      <section className="organization-entry-glass">
        <strong className="organization-entry-brand" aria-label="Labstar">L<span>★</span>BSTAR</strong>

        {stage === "loading" && (
          <div className="organization-entry-loading">
            <LoaderCircle className="spin" size={19} />
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
            <LoaderCircle className="spin" size={21} />
            <span>Criando sua organização…</span>
          </div>
        )}

        {stage === "entering" && (
          <div className="organization-entry-creating organization-entry-entering" aria-live="polite" aria-busy="true">
            <LottieAnimation kind="rocket" className="organization-entry-rocket" preserveAspectRatio="xMidYMid meet" />
            <h1>Entrando no Labstar</h1>
            <p>{selected ? `Abrindo ${selected.name}…` : "Preparando seu espaço de trabalho…"}</p>
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

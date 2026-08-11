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
  listMyOrganizations,
  loadActiveOrganizationId,
  setActiveOrganization,
  type Organization,
} from "../lib/organizations";
import { supabaseClient } from "../lib/supabase";
import { LottieAnimation } from "./LottieAnimation";

type EntryStage = "loading" | "choose" | "create" | "creating" | "error" | "leaving";

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
const MIN_ROCKET_TIME_MS = 1450;

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
  // The regular switcher keeps its legacy fallback for backwards compatibility.
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

  const markSeen = useCallback(() => {
    if (!sessionKey) return;
    try {
      window.sessionStorage.setItem(sessionKey, "done");
    } catch {
      // O onboarding continua mesmo quando storage está bloqueado.
    }
  }, [sessionKey]);

  const enter = useCallback((organization: Organization) => {
    setActiveOrganization(organization);
    markSeen();
    setStage("leaving");
    window.setTimeout(() => setDone(true), 440);
  }, [markSeen]);

  async function submitCreate(event: React.FormEvent) {
    event.preventDefault();
    if (name.trim().length < 2 || stage === "creating") return;
    setError("");
    setStage("creating");

    try {
      const [created] = await Promise.all([
        createOrganization(name, slug),
        delay(MIN_ROCKET_TIME_MS),
      ]);
      setOrganizations((current) => [...current.filter((organization) => organization.id !== created.id), created]);
      setSelected(created);
      setActiveOrganization(created);
      markSeen();
      setStage("leaving");
      window.setTimeout(() => setDone(true), 480);
    } catch (cause) {
      setError(creationError(cause));
      setStage("create");
    }
  }

  const firstOrganization = organizations.length === 0;
  const primaryAction = useMemo(() => selected ? `Entrar em ${selected.name}` : "Entrar", [selected]);

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
              <button className="secondary" type="button" onClick={() => { setError(""); setName(""); setSlug(""); setStage("create"); }}>
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
                <span>Handle <small>opcional</small></span>
                <div className="organization-entry-handle">
                  <b>@</b>
                  <input maxLength={48} value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="minha-organizacao" />
                </div>
              </label>

              {error && <div className="organization-entry-error">{error}</div>}

              <div className="organization-entry-actions form-actions">
                {!firstOrganization && (
                  <button className="secondary icon-back" type="button" onClick={() => setStage("choose")}>
                    <ArrowLeft size={16} /> Voltar
                  </button>
                )}
                <button className="primary" type="submit" disabled={name.trim().length < 2}>
                  Criar organização <ArrowRight size={16} />
                </button>
              </div>
            </form>
          </>
        )}

        {stage === "creating" && (
          <div className="organization-entry-creating" aria-live="polite" aria-busy="true">
            <LottieAnimation kind="rocket" className="organization-entry-rocket" preserveAspectRatio="xMidYMid meet" />
            <h1>Criando sua organização</h1>
            <p>Preparando seu novo espaço de trabalho…</p>
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

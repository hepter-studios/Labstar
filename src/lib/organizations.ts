import { supabaseClient } from "./supabase";

export const PRIMARY_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";
export const ACTIVE_ORGANIZATION_KEY = "labstar-active-organization-v1";
export const ORGANIZATION_CHANGED_EVENT = "labstar:organization-changed";

export type OrganizationRole = "owner" | "admin" | "manager" | "member" | "viewer";

export type Organization = {
  id: string;
  name: string;
  slug: string;
  role: OrganizationRole;
  isPrimaryLegacy: boolean;
  defaultLocale: "en" | "pt-BR";
  enabledLocales: string[];
  createdAt: string;
};

type OrganizationRow = {
  id?: string;
  name?: string;
  slug?: string;
  role?: OrganizationRole;
  is_primary_legacy?: boolean;
  default_locale?: "en" | "pt-BR";
  enabled_locales?: string[] | null;
  created_at?: string;
};

export const PRIMARY_ORGANIZATION: Organization = {
  id: PRIMARY_ORGANIZATION_ID,
  name: "Hepter Studios",
  slug: "hepter-studios",
  role: "owner",
  isPrimaryLegacy: true,
  defaultLocale: "en",
  enabledLocales: ["en", "pt-BR"],
  createdAt: "",
};

function requireClient() {
  if (!supabaseClient) throw new Error("supabase_not_configured");
  return supabaseClient;
}

function mapOrganization(row: OrganizationRow): Organization {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? "Organization"),
    slug: String(row.slug ?? "organization"),
    role: row.role ?? "member",
    isPrimaryLegacy: Boolean(row.is_primary_legacy),
    defaultLocale: row.default_locale === "pt-BR" ? "pt-BR" : "en",
    enabledLocales: Array.isArray(row.enabled_locales) && row.enabled_locales.length
      ? row.enabled_locales.map(String)
      : ["en", "pt-BR"],
    createdAt: String(row.created_at ?? ""),
  };
}

function migrationMissing(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message?.toLocaleLowerCase() ?? "";
  return error?.code === "PGRST202"
    || error?.code === "42P01"
    || message.includes("schema cache")
    || message.includes("could not find the function")
    || message.includes("relation") && message.includes("does not exist");
}

function migrationRequiredError() {
  return Object.assign(new Error("organization_migration_required"), { code: "organization_migration_required" });
}

export function normalizeGlobalHandle(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function listMyOrganizations(): Promise<Organization[]> {
  // Nunca invente Hepter Studios como fallback para uma identidade autenticada.
  // Uma organização só aparece quando o banco confirma a associação da conta.
  if (!supabaseClient) return import.meta.env.DEV ? [PRIMARY_ORGANIZATION] : [];

  const { data, error } = await requireClient().rpc("list_my_organizations");
  if (error) {
    if (migrationMissing(error)) throw migrationRequiredError();
    throw error;
  }

  return (Array.isArray(data) ? data : [])
    .map((row) => mapOrganization(row as OrganizationRow))
    .filter((organization) => organization.id);
}

export async function isOrganizationHandleAvailable(handle: string): Promise<boolean> {
  const normalized = normalizeGlobalHandle(handle);
  if (normalized.length < 3 || normalized.length > 48) return false;
  const { data, error } = await requireClient().rpc("organization_handle_available", { candidate: normalized });
  if (error) {
    if (migrationMissing(error)) throw migrationRequiredError();
    throw error;
  }
  return data === true;
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  const normalized = normalizeGlobalHandle(username);
  if (normalized.length < 3 || normalized.length > 39) return false;
  const { data, error } = await requireClient().rpc("username_available", { candidate: normalized });
  if (error) {
    if (migrationMissing(error)) throw migrationRequiredError();
    throw error;
  }
  return data === true;
}

export async function claimUsername(username: string): Promise<string> {
  const normalized = normalizeGlobalHandle(username);
  const { data, error } = await requireClient().rpc("claim_username", { desired_username: normalized });
  if (error) {
    if (migrationMissing(error)) throw migrationRequiredError();
    throw error;
  }
  return String(data ?? normalized);
}

export async function createOrganization(name: string, slug = ""): Promise<Organization> {
  const { data, error } = await requireClient().rpc("create_organization", {
    organization_name: name.trim(),
    desired_slug: slug.trim() ? normalizeGlobalHandle(slug) : null,
  });
  if (error) {
    if (migrationMissing(error)) throw migrationRequiredError();
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("organization_create_empty_response");
  return mapOrganization(row as OrganizationRow);
}

export function loadActiveOrganizationId() {
  try {
    return window.localStorage.getItem(ACTIVE_ORGANIZATION_KEY) || "";
  } catch {
    return "";
  }
}

export function setActiveOrganization(organization: Organization) {
  try {
    window.localStorage.setItem(ACTIVE_ORGANIZATION_KEY, organization.id);
  } catch {
    // A seleção continua válida em memória quando o storage está indisponível.
  }
  window.dispatchEvent(new CustomEvent<Organization>(ORGANIZATION_CHANGED_EVENT, { detail: organization }));
}

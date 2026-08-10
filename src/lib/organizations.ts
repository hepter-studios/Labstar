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

export async function listMyOrganizations(): Promise<Organization[]> {
  if (!supabaseClient) return [PRIMARY_ORGANIZATION];
  const { data, error } = await requireClient().rpc("list_my_organizations");
  if (error) {
    if (migrationMissing(error)) return [PRIMARY_ORGANIZATION];
    throw error;
  }

  const organizations = (Array.isArray(data) ? data : [])
    .map((row) => mapOrganization(row as OrganizationRow))
    .filter((organization) => organization.id);

  return organizations.length ? organizations : [PRIMARY_ORGANIZATION];
}

export async function createOrganization(name: string, slug = ""): Promise<Organization> {
  const { data, error } = await requireClient().rpc("create_organization", {
    organization_name: name.trim(),
    desired_slug: slug.trim() || null,
  });
  if (error) {
    if (migrationMissing(error)) {
      throw Object.assign(new Error("organization_migration_required"), { code: "organization_migration_required" });
    }
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("organization_create_empty_response");
  return mapOrganization(row as OrganizationRow);
}

export function loadActiveOrganizationId() {
  try {
    return window.localStorage.getItem(ACTIVE_ORGANIZATION_KEY) || PRIMARY_ORGANIZATION_ID;
  } catch {
    return PRIMARY_ORGANIZATION_ID;
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

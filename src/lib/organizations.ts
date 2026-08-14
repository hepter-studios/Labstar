import { supabaseClient } from "./supabase";
import { isDevPreviewMode } from "./devPreviewMode";

export const PRIMARY_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";
export const ACTIVE_ORGANIZATION_KEY = "labstar-active-organization-v1";
export const ORGANIZATION_CHANGED_EVENT = "labstar:organization-changed";
const PREVIEW_ORGANIZATIONS_KEY = "labstar-dev-preview-organizations-v1";

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

export type OrganizationAccount = {
  authUserId: string;
  email: string;
  name: string;
  role: OrganizationRole;
  joinedAt: string;
  isCurrentUser: boolean;
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

type OrganizationAccountRow = {
  auth_user_id?: string;
  email?: string;
  display_name?: string;
  role?: OrganizationRole;
  joined_at?: string;
  is_current_user?: boolean;
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

function mapOrganizationAccount(row: OrganizationAccountRow): OrganizationAccount {
  return {
    authUserId: String(row.auth_user_id ?? ""),
    email: String(row.email ?? ""),
    name: String(row.display_name ?? row.email ?? "Membro Labstar"),
    role: row.role ?? "member",
    joinedAt: String(row.joined_at ?? ""),
    isCurrentUser: Boolean(row.is_current_user),
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

function organizationRuleError(code: string) {
  return Object.assign(new Error(code), { code });
}

function readPreviewOrganizations() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PREVIEW_ORGANIZATIONS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed as Organization[] : [];
  } catch {
    return [];
  }
}

function writePreviewOrganizations(organizations: Organization[]) {
  window.localStorage.setItem(PREVIEW_ORGANIZATIONS_KEY, JSON.stringify(organizations));
}

function throwRpcError(error: { code?: string; message?: string } | null | undefined): never {
  if (migrationMissing(error)) throw migrationRequiredError();
  throw error;
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
  if (isDevPreviewMode()) {
    return [PRIMARY_ORGANIZATION, ...readPreviewOrganizations().filter((organization) => organization.id !== PRIMARY_ORGANIZATION_ID)];
  }
  if (!supabaseClient) return import.meta.env.DEV ? [PRIMARY_ORGANIZATION] : [];

  const { data, error } = await requireClient().rpc("list_my_organizations");
  if (error) throwRpcError(error);

  return (Array.isArray(data) ? data : [])
    .map((row) => mapOrganization(row as OrganizationRow))
    .filter((organization) => organization.id);
}

export async function isOrganizationHandleAvailable(handle: string): Promise<boolean> {
  const normalized = normalizeGlobalHandle(handle);
  if (normalized.length < 3 || normalized.length > 48) return false;
  if (isDevPreviewMode()) {
    return ![PRIMARY_ORGANIZATION, ...readPreviewOrganizations()].some((organization) => organization.slug === normalized);
  }
  const { data, error } = await requireClient().rpc("organization_handle_available", { candidate: normalized });
  if (error) throwRpcError(error);
  return data === true;
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  const normalized = normalizeGlobalHandle(username);
  if (normalized.length < 3 || normalized.length > 39) return false;
  const { data, error } = await requireClient().rpc("username_available", { candidate: normalized });
  if (error) throwRpcError(error);
  return data === true;
}

export async function claimUsername(username: string): Promise<string> {
  const normalized = normalizeGlobalHandle(username);
  const { data, error } = await requireClient().rpc("claim_username", { desired_username: normalized });
  if (error) throwRpcError(error);
  return String(data ?? normalized);
}

export async function createOrganization(name: string, slug = ""): Promise<Organization> {
  if (isDevPreviewMode()) {
    const organizations = [PRIMARY_ORGANIZATION, ...readPreviewOrganizations()];
    const organizationName = name.trim();
    if (organizationName.length < 2 || organizationName.length > 80) throw organizationRuleError("invalid_organization_name");
    const baseSlug = normalizeGlobalHandle(slug || organizationName);
    if (baseSlug.length < 3 || baseSlug.length > 48) throw organizationRuleError("invalid_organization_handle");
    let nextSlug = baseSlug;
    let suffix = 2;
    while (organizations.some((organization) => organization.slug === nextSlug)) {
      if (slug.trim()) throw organizationRuleError("organization_handle_taken");
      nextSlug = `${baseSlug.slice(0, 44)}-${suffix}`;
      suffix += 1;
    }
    const created: Organization = {
      id: globalThis.crypto?.randomUUID?.() ?? `preview-${Date.now()}`,
      name: organizationName,
      slug: nextSlug,
      role: "owner",
      isPrimaryLegacy: false,
      defaultLocale: "pt-BR",
      enabledLocales: ["pt-BR", "en"],
      createdAt: new Date().toISOString(),
    };
    writePreviewOrganizations([...readPreviewOrganizations(), created]);
    return created;
  }
  const { data, error } = await requireClient().rpc("create_organization", {
    organization_name: name.trim(),
    desired_slug: slug.trim() ? normalizeGlobalHandle(slug) : null,
  });
  if (error) throwRpcError(error);

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("organization_create_empty_response");
  return mapOrganization(row as OrganizationRow);
}

export async function updateOrganizationProfile(organizationId: string, name: string, slug: string): Promise<Organization> {
  const normalized = normalizeGlobalHandle(slug);
  if (normalized.length < 3 || normalized.length > 48 || !/^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/.test(normalized)) {
    throw organizationRuleError("invalid_organization_handle");
  }

  const current = (await listMyOrganizations()).find((organization) => organization.id === organizationId);
  if (!current) throw organizationRuleError("organization_not_found");

  if (normalized !== current.slug) {
    const available = await isOrganizationHandleAvailable(normalized);
    if (!available) throw organizationRuleError("organization_handle_taken");
  }

  if (isDevPreviewMode()) {
    const updated = { ...current, name: name.trim(), slug: normalized };
    writePreviewOrganizations(readPreviewOrganizations().map((organization) => organization.id === organizationId ? updated : organization));
    return updated;
  }

  const { data, error } = await requireClient().rpc("update_organization_profile", {
    target_organization_id: organizationId,
    organization_name: name.trim(),
    desired_slug: normalized,
  });
  if (error) throwRpcError(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("organization_update_empty_response");
  return mapOrganization(row as OrganizationRow);
}

export async function listOrganizationAccounts(organizationId: string): Promise<OrganizationAccount[]> {
  if (isDevPreviewMode()) return [];
  const { data, error } = await requireClient().rpc("list_organization_accounts", {
    target_organization_id: organizationId,
  });
  if (error) throwRpcError(error);
  return (Array.isArray(data) ? data : [])
    .map((row) => mapOrganizationAccount(row as OrganizationAccountRow))
    .filter((account) => account.authUserId);
}

export async function setOrganizationAccountRole(
  organizationId: string,
  authUserId: string,
  role: OrganizationRole,
) {
  if (isDevPreviewMode()) return;
  const { error } = await requireClient().rpc("set_organization_account_role", {
    target_organization_id: organizationId,
    target_auth_user_id: authUserId,
    new_role: role,
  });
  if (error) throwRpcError(error);
}

export async function deleteOrganization(organizationId: string, confirmationSlug: string) {
  if (isDevPreviewMode()) {
    const current = readPreviewOrganizations().find((organization) => organization.id === organizationId);
    if (!current) throw organizationRuleError("organization_not_found");
    if (current.slug !== normalizeGlobalHandle(confirmationSlug)) throw organizationRuleError("organization_delete_confirmation_mismatch");
    writePreviewOrganizations(readPreviewOrganizations().filter((organization) => organization.id !== organizationId));
    return;
  }
  const { error } = await requireClient().rpc("delete_organization", {
    target_organization_id: organizationId,
    confirmation_slug: normalizeGlobalHandle(confirmationSlug),
  });
  if (error) throwRpcError(error);
}

export function loadActiveOrganizationId() {
  try {
    return window.localStorage.getItem(ACTIVE_ORGANIZATION_KEY) || "";
  } catch {
    return "";
  }
}

export function clearActiveOrganization() {
  try {
    window.localStorage.removeItem(ACTIVE_ORGANIZATION_KEY);
  } catch {
    // A próxima seleção corrige o estado quando storage estiver disponível.
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

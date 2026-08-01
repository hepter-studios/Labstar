import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import {
  listRolesForMember,
  supabaseClient,
  type Member,
  type MemberRole,
} from "./supabase";

export type AccessProvider = "google" | "github";
export type InviteMode = "quick" | "personal";

export type InviteInspection = {
  valid: boolean;
  status: string;
  kind: InviteMode | null;
  emailHint: string;
  expiresAt: string;
  approvalRequired: boolean;
};

export type CreatedInvite = {
  id: string;
  token: string;
  url: string;
  mode: InviteMode;
  email: string;
  expiresAt: string;
  approvalRequired: boolean;
};

export type AccessIdentity = {
  user: User;
  member: Member | null;
  acceptedInvite: boolean;
};

type MemberRow = {
  id: string;
  email: string;
  name: string;
  status: Member["status"];
  role: MemberRole;
  job_title?: string | null;
  area?: string | null;
  assignments?: string[] | null;
  created_at: string;
  last_seen_at: string;
  avatar_path?: string | null;
};

type RpcError = Error & {
  code?: string;
  details?: string;
  hint?: string;
};

const INVITE_STORAGE_KEY = "labstar-pending-invite";

function requireClient() {
  if (!supabaseClient) throw new Error("supabase_not_configured");
  return supabaseClient;
}

function firstRow<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

async function signedAvatarUrl(path: string) {
  if (!path) return "";
  const { data, error } = await requireClient()
    .storage
    .from("labstar-files")
    .createSignedUrl(path, 60 * 60 * 8);
  return error ? "" : data.signedUrl;
}

async function memberFromRow(row: MemberRow): Promise<Member> {
  const avatarPath = row.avatar_path ?? "";
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    status: row.status,
    role: row.role,
    jobTitle: row.job_title ?? "",
    area: row.area ?? "",
    assignments: Array.isArray(row.assignments) ? row.assignments : [],
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    avatarPath,
    avatarUrl: await signedAvatarUrl(avatarPath),
    jobRoles: await listRolesForMember(row.id),
  };
}

function isMissingRpc(error: RpcError | null) {
  if (!error) return false;
  return error.code === "42883"
    || error.code === "PGRST202"
    || error.message.includes("Could not find the function")
    || error.message.includes("does not exist");
}

function isMissingColumn(error: RpcError | null, column: string) {
  if (!error) return false;
  const message = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return error.code === "42703"
    || error.code === "PGRST204"
    || (message.includes(column.toLowerCase()) && (message.includes("schema cache") || message.includes("does not exist")));
}

function normalizeInviteToken(value: string | null | undefined) {
  const token = value?.trim().toLowerCase() ?? "";
  return /^[0-9a-f]{64}$/.test(token) ? token : "";
}

export function getPendingInviteToken() {
  const url = new URL(window.location.href);
  const fromUrl = normalizeInviteToken(url.searchParams.get("invite"));
  if (fromUrl) {
    window.sessionStorage.setItem(INVITE_STORAGE_KEY, fromUrl);
    return fromUrl;
  }
  return normalizeInviteToken(window.sessionStorage.getItem(INVITE_STORAGE_KEY));
}

export function clearPendingInviteToken() {
  window.sessionStorage.removeItem(INVITE_STORAGE_KEY);
  const url = new URL(window.location.href);
  if (!url.searchParams.has("invite")) return;
  url.searchParams.delete("invite");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function oauthReturnUrl() {
  const url = new URL("/", window.location.origin);
  const token = getPendingInviteToken();
  if (token) url.searchParams.set("invite", token);
  return url.toString();
}

export async function signInWithProvider(provider: AccessProvider) {
  const { error } = await requireClient().auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: oauthReturnUrl(),
    },
  });
  if (error) throw error;
}

export async function requestAccessLink(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const { error } = await requireClient().auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: oauthReturnUrl(),
    },
  });
  if (error) throw error;
}

async function claimLegacyMembership() {
  const { data, error } = await requireClient().rpc("claim_my_membership");
  if (error) {
    if (isMissingRpc(error as RpcError)) return null;
    throw error;
  }
  return firstRow(data as MemberRow[] | MemberRow | null);
}

async function loadCurrentMember(user: User) {
  const client = requireClient();

  const byId = await client
    .from("members")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!byId.error && byId.data) return byId.data as MemberRow;
  if (byId.error && !isMissingColumn(byId.error as RpcError, "auth_user_id")) throw byId.error;

  if (!user.email) return null;
  const byEmail = await client
    .from("members")
    .select("*")
    .eq("email", user.email.trim().toLowerCase())
    .maybeSingle();

  if (byEmail.error) throw byEmail.error;
  return byEmail.data as MemberRow | null;
}

export async function getCurrentAccessIdentity(): Promise<AccessIdentity | null> {
  const client = requireClient();
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData.session) return null;

  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) return null;

  const user = userData.user;
  let acceptedInvite = false;
  let memberRow: MemberRow | null = null;
  const token = getPendingInviteToken();

  if (token) {
    const { data, error } = await client.rpc("accept_member_invite", {
      invite_token: token,
    });
    if (error) throw error;
    memberRow = firstRow(data as MemberRow[] | MemberRow | null);
    acceptedInvite = Boolean(memberRow);
    if (acceptedInvite) clearPendingInviteToken();
  }

  if (!memberRow) memberRow = await claimLegacyMembership();
  if (!memberRow) memberRow = await loadCurrentMember(user);

  return {
    user,
    member: memberRow ? await memberFromRow(memberRow) : null,
    acceptedInvite,
  };
}

export async function inspectInvite(token = getPendingInviteToken()): Promise<InviteInspection | null> {
  if (!token) return null;
  const { data, error } = await requireClient().rpc("inspect_member_invite", {
    invite_token: token,
  });
  if (error) {
    if (isMissingRpc(error as RpcError)) throw new Error("invite_system_not_installed");
    throw error;
  }

  const row = firstRow(data as Record<string, unknown>[] | Record<string, unknown> | null);
  if (!row) return null;
  return {
    valid: Boolean(row.valid),
    status: String(row.status ?? "invalid"),
    kind: row.kind === "quick" || row.kind === "personal" ? row.kind : null,
    emailHint: String(row.email_hint ?? ""),
    expiresAt: String(row.expires_at ?? ""),
    approvalRequired: Boolean(row.approval_required),
  };
}

export async function createInviteLink(input: {
  mode: InviteMode;
  email?: string;
  name?: string;
  role: Exclude<MemberRole, "owner">;
  jobTitle?: string;
  area?: string;
  validForHours: number;
}): Promise<CreatedInvite> {
  const { data, error } = await requireClient().rpc("create_member_invite_link", {
    invitation_kind: input.mode,
    invited_email: input.mode === "personal" ? input.email?.trim().toLowerCase() || null : null,
    invited_name: input.name?.trim() ?? "",
    invited_role: input.role,
    invited_job_title: input.jobTitle?.trim() ?? "",
    invited_area: input.area?.trim() ?? "",
    valid_for_hours: input.validForHours,
  });

  if (error) {
    if (isMissingRpc(error as RpcError)) throw new Error("invite_system_not_installed");
    throw error;
  }

  const row = firstRow(data as Record<string, unknown>[] | Record<string, unknown> | null);
  if (!row) throw new Error("invite_creation_failed");

  const path = String(row.invite_path ?? "");
  return {
    id: String(row.invite_id),
    token: String(row.invite_token),
    url: new URL(path, window.location.origin).toString(),
    mode: row.kind === "personal" ? "personal" : "quick",
    email: String(row.email ?? ""),
    expiresAt: String(row.expires_at ?? ""),
    approvalRequired: Boolean(row.approval_required),
  };
}

export function subscribeToAccessChanges(callback: (event: AuthChangeEvent, session: Session | null) => void) {
  const { data } = requireClient().auth.onAuthStateChange(callback);
  return () => data.subscription.unsubscribe();
}

export async function secureSignOut() {
  const { error } = await requireClient().auth.signOut();
  if (error) throw error;
  clearPendingInviteToken();
  window.location.assign("/");
}

export function accessErrorMessage(error: unknown) {
  const value = error as RpcError;
  const message = `${value?.message ?? ""} ${value?.details ?? ""}`.toLowerCase();
  const code = value?.code ?? "";

  if (message.includes("invite_invalid_or_expired")) return "Este convite é inválido, já foi usado ou expirou.";
  if (message.includes("invite_email_mismatch")) return "Este convite pertence a outro e-mail. Entre com a conta correta.";
  if (message.includes("member_suspended")) return "Esta conta está suspensa pela administração.";
  if (message.includes("member_already_linked")) return "Este membro já está vinculado a outra identidade.";
  if (message.includes("verified_email_required")) return "O provedor não confirmou um e-mail válido para esta conta.";
  if (message.includes("personal_invite_requires_email")) return "Informe o e-mail no convite pessoal.";
  if (message.includes("permission_denied") || code === "42501") return "Sua conta não possui permissão para realizar esta ação.";
  if (message.includes("invite_system_not_installed") || code === "42883" || code === "PGRST202") return "A atualização de convites ainda não foi instalada no Supabase.";
  if (message.includes("rate limit") || message.includes("email rate")) return "O limite temporário de envio de e-mails foi atingido. Use Google ou GitHub.";
  if (message.includes("signups not allowed") || message.includes("user not found")) return "Este e-mail ainda não possui uma identidade. Use Google ou GitHub para aceitar o convite.";
  if (message.includes("provider") && message.includes("disabled")) return "Este provedor ainda não foi habilitado no Supabase.";
  if (message.includes("auth session missing")) return "Sua sessão expirou. Entre novamente.";
  if (message.includes("failed to fetch") || message.includes("network")) return "Não foi possível conectar ao serviço de acesso.";
  return "Não foi possível concluir a verificação de acesso.";
}

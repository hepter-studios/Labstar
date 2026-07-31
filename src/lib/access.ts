import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import {
  acceptBackendInvite,
  BackendApiError,
  createBackendInvite,
  getBackendIdentity,
  inspectBackendInvite,
  type BackendMember,
} from "./backend";
import { requireAuthClient } from "./auth-client";
import {
  isTauriApp,
  nativeAccessChangedEvent,
  nativeOAuthReturnUrl,
  openNativeAuthUrl,
} from "./native";
import type { Member, MemberRole } from "./supabase";

export type AccessProvider = "google" | "github";
export type InviteMode = "quick" | "personal";
export type AuthorizationState = "active" | "pending" | "suspended" | "unauthorized";

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
  authorization: AuthorizationState;
  acceptedInvite: boolean;
};

type AccessError = Error & {
  code?: string;
  details?: string;
  hint?: string;
};

const INVITE_STORAGE_KEY = "labstar-pending-invite";

function normalizeInviteToken(value: string | null | undefined) {
  const token = value?.trim().toLowerCase() ?? "";
  return /^[0-9a-f]{64}$/.test(token) ? token : "";
}

function memberFromBackend(member: BackendMember): Member {
  return {
    id: member.id,
    email: member.email,
    name: member.name,
    status: member.status,
    role: member.role,
    jobTitle: member.jobTitle ?? "",
    area: member.area ?? "",
    assignments: [],
    createdAt: "",
    lastSeenAt: new Date().toISOString(),
    avatarPath: "",
    avatarUrl: "",
    jobRoles: [],
  };
}

function authorizationFromMember(member: BackendMember): AuthorizationState {
  if (member.status === "pending") return "pending";
  if (member.status === "suspended") return "suspended";
  return "active";
}

function authorizationFromBackendError(error: unknown): AuthorizationState | null {
  if (!(error instanceof BackendApiError)) return null;
  if (error.code === "member_pending") return "pending";
  if (error.code === "member_suspended") return "suspended";
  if (error.code === "member_not_authorized") return "unauthorized";
  return null;
}

async function currentSession() {
  const { data, error } = await requireAuthClient().auth.getSession();
  if (error) throw error;
  return data.session;
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
  if (isTauriApp()) return nativeOAuthReturnUrl();

  const url = new URL("/", window.location.origin);
  const token = getPendingInviteToken();
  if (token) url.searchParams.set("invite", token);
  return url.toString();
}

export async function signInWithProvider(provider: AccessProvider) {
  const native = isTauriApp();
  const { data, error } = await requireAuthClient().auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: oauthReturnUrl(),
      skipBrowserRedirect: native,
      queryParams: provider === "google"
        ? { prompt: "select_account" }
        : undefined,
    },
  });
  if (error) throw error;

  if (native) {
    if (!data.url) throw new Error("oauth_authorization_url_missing");
    await openNativeAuthUrl(data.url);
  }
}

export async function requestAccessLink(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const { error } = await requireAuthClient().auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: oauthReturnUrl(),
    },
  });
  if (error) throw error;
}

export async function getCurrentAccessIdentity(): Promise<AccessIdentity | null> {
  const client = requireAuthClient();
  const session = await currentSession();
  if (!session) return null;

  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) return null;

  const token = getPendingInviteToken();
  if (token) {
    const accepted = await acceptBackendInvite(token, session.access_token);
    clearPendingInviteToken();
    return {
      user: userData.user,
      member: memberFromBackend(accepted.member),
      authorization: authorizationFromMember(accepted.member),
      acceptedInvite: true,
    };
  }

  try {
    const identity = await getBackendIdentity(session.access_token);
    const member = memberFromBackend({
      ...identity.member,
      email: identity.email,
    });
    return {
      user: userData.user,
      member,
      authorization: authorizationFromMember({
        ...identity.member,
        email: identity.email,
      }),
      acceptedInvite: false,
    };
  } catch (error) {
    const authorization = authorizationFromBackendError(error);
    if (!authorization) throw error;
    return {
      user: userData.user,
      member: null,
      authorization,
      acceptedInvite: false,
    };
  }
}

export async function inspectInvite(token = getPendingInviteToken()): Promise<InviteInspection | null> {
  if (!token) return null;
  const invitation = await inspectBackendInvite(token);
  return {
    valid: invitation.valid,
    status: invitation.status,
    kind: invitation.mode,
    emailHint: invitation.emailHint ?? "",
    expiresAt: invitation.expiresAt ?? "",
    approvalRequired: Boolean(invitation.approvalRequired),
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
  const session = await currentSession();
  if (!session) throw new BackendApiError("authentication_failed", "Sua sessão expirou.", 401);

  const invitation = await createBackendInvite({
    mode: input.mode,
    email: input.mode === "personal" ? input.email?.trim().toLowerCase() : undefined,
    name: input.name?.trim(),
    role: input.role,
    jobTitle: input.jobTitle?.trim(),
    area: input.area?.trim(),
    validForHours: input.validForHours,
  }, session.access_token);

  return {
    id: invitation.id,
    token: invitation.token,
    url: new URL(invitation.urlPath, "https://labstar.pages.dev").toString(),
    mode: invitation.mode,
    email: invitation.email ?? "",
    expiresAt: invitation.expiresAt,
    approvalRequired: invitation.approvalRequired,
  };
}

export function subscribeToAccessChanges(callback: (event: AuthChangeEvent, session: Session | null) => void) {
  const { data } = requireAuthClient().auth.onAuthStateChange(callback);
  return () => data.subscription.unsubscribe();
}

export function subscribeToNativeAccessChanges(callback: () => void) {
  window.addEventListener(nativeAccessChangedEvent, callback);
  return () => window.removeEventListener(nativeAccessChangedEvent, callback);
}

function clearPersistedAuthSession() {
  const keys = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
    .filter((key): key is string => Boolean(key))
    .filter((key) => key.startsWith("sb-") && key.includes("-auth-token"));

  for (const key of keys) window.localStorage.removeItem(key);
}

export async function secureSignOut() {
  const pendingInvite = getPendingInviteToken();

  try {
    await requireAuthClient().auth.signOut({ scope: "local" });
  } catch {
    // A troca de conta não pode depender da rede ou do backend estar disponível.
  } finally {
    clearPersistedAuthSession();
    if (pendingInvite) window.sessionStorage.setItem(INVITE_STORAGE_KEY, pendingInvite);
    window.location.replace("/");
  }
}

export function accessErrorMessage(error: unknown) {
  const value = error as AccessError;
  const message = `${value?.message ?? ""} ${value?.details ?? ""}`.toLowerCase();
  const code = value instanceof BackendApiError ? value.code : value?.code ?? "";

  if (code === "invite_invalid_or_expired" || message.includes("invite_invalid_or_expired")) {
    return "Este convite é inválido, já foi usado ou expirou.";
  }
  if (code === "invite_email_mismatch" || message.includes("invite_email_mismatch")) {
    return "Este convite pertence a outro e-mail. Entre com a conta correta.";
  }
  if (code === "member_suspended" || message.includes("member_suspended")) {
    return "Esta conta está suspensa pela administração.";
  }
  if (code === "member_pending" || message.includes("member_pending")) {
    return "Seu convite foi aceito e agora aguarda aprovação da equipe.";
  }
  if (code === "member_not_authorized") {
    return "Esta identidade ainda não pertence à equipe Labstar.";
  }
  if (code === "member_already_linked" || message.includes("member_already_linked")) {
    return "Este membro já está vinculado a outra identidade.";
  }
  if (code === "permission_denied" || code === "42501") {
    return "Sua conta não possui permissão para realizar esta ação.";
  }
  if (code === "rust_backend_not_configured") {
    return "O endereço do backend Rust ainda não foi configurado.";
  }
  if (code === "backend_timeout") {
    return "O backend Rust demorou para responder. O Labstar já tentou novamente automaticamente.";
  }
  if (code === "backend_unreachable" || code === "backend_connect_failed" || code === "backend_transport_failed") {
    return "A conexão segura com o backend Rust foi interrompida. O Labstar tentou uma rota alternativa de leitura, mas a API ainda não respondeu.";
  }
  if (code === "authentication_service_unavailable") {
    return "O backend Rust está online, mas o serviço de identidade está temporariamente indisponível. O Labstar já repetiu a verificação automaticamente.";
  }
  if (code === "authentication_invalid_response") {
    return "O serviço de identidade respondeu de forma inesperada. Sua sessão não foi apagada.";
  }
  if (code === "database_unavailable") {
    return "O backend Rust está online, mas o banco de dados não respondeu. Sua sessão continua preservada.";
  }
  if (message.includes("oauth_provider_error")) {
    return "O provedor cancelou ou recusou a autenticação.";
  }
  if (message.includes("rate limit") || message.includes("email rate")) {
    return "O limite temporário de envio de e-mails foi atingido. Use Google ou GitHub.";
  }
  if (message.includes("signups not allowed") || message.includes("user not found")) {
    return "Este e-mail ainda não possui uma identidade. Use Google ou GitHub para aceitar o convite.";
  }
  if (message.includes("provider") && message.includes("disabled")) {
    return "Este provedor ainda não foi habilitado no Supabase.";
  }
  if (message.includes("auth session missing") || code === "authentication_failed") {
    return "Sua sessão expirou. Entre novamente.";
  }
  if (message.includes("failed to fetch") || message.includes("network")) {
    return "Não foi possível conectar ao serviço de acesso.";
  }
  return "Não foi possível concluir a verificação de acesso.";
}

import {
  isTauriApp,
  requestNativeBackend,
  type NativeBackendFailure,
} from "./native";
import { requireAuthClient } from "./auth-client";

export type BackendMember = {
  id: string;
  email: string;
  name: string;
  status: "pending" | "active" | "suspended";
  role: "owner" | "admin" | "manager" | "member" | "viewer";
  jobTitle: string;
  area: string;
};

export type BackendMeResponse = {
  userId: string;
  email: string;
  member: Omit<BackendMember, "email">;
};

export type BackendInviteInspection = {
  valid: boolean;
  status: string;
  mode: "quick" | "personal" | null;
  emailHint: string | null;
  expiresAt: string | null;
  approvalRequired: boolean | null;
};

export type BackendCreatedInvite = {
  id: string;
  token: string;
  urlPath: string;
  mode: "quick" | "personal";
  email: string | null;
  expiresAt: string;
  approvalRequired: boolean;
};

export type BackendAcceptedInvite = {
  member: BackendMember;
  approvalRequired: boolean;
};

type BackendErrorBody = {
  error?: {
    code?: string;
    message?: string;
  };
};

type IdentityFallbackRow = {
  id: string;
  auth_user_id?: string | null;
  email: string;
  name: string;
  status: "pending" | "active" | "suspended";
  role: "owner" | "admin" | "manager" | "member" | "viewer";
  job_title?: string | null;
  area?: string | null;
};

const DEFAULT_RUST_BACKEND_URL = "https://labstar-api-mackson.fly.dev";
const REQUEST_TIMEOUT_MS = 30_000;
const IDENTITY_BACKEND_BUDGET_MS = 6_000;
const READ_RETRY_DELAY_MS = 900;
const configuredUrl = (import.meta.env.VITE_LABSTAR_API_URL ?? DEFAULT_RUST_BACKEND_URL)
  .trim()
  .replace(/\/+$/, "");

export const isRustBackendConfigured = /^https:\/\//.test(configuredUrl)
  || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(configuredUrl);

export class BackendApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "BackendApiError";
    this.code = code;
    this.status = status;
  }
}

function requireBackendUrl() {
  if (!isRustBackendConfigured) throw new BackendApiError(
    "rust_backend_not_configured",
    "O endereço seguro do backend Rust ainda não foi configurado.",
    503,
  );
  return configuredUrl;
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

function isRetryableReadError(error: unknown) {
  if (!(error instanceof BackendApiError)) return false;
  return [
    "backend_timeout",
    "backend_unreachable",
    "backend_connect_failed",
    "backend_transport_failed",
    "authentication_service_unavailable",
    "database_unavailable",
    "backend_http_429",
    "backend_http_502",
    "backend_http_503",
    "backend_http_504",
  ].includes(error.code);
}

function isNativeTransportFailure(error: unknown) {
  if (!(error instanceof BackendApiError)) return false;
  return [
    "backend_timeout",
    "backend_connect_failed",
    "backend_transport_failed",
  ].includes(error.code);
}

function asBackendErrorBody(value: unknown): BackendErrorBody {
  if (!value || typeof value !== "object") return {};
  return value as BackendErrorBody;
}

function decodeResponse<T>(status: number, payload: unknown): T {
  if (status >= 200 && status < 300) {
    if (status === 204) return undefined as T;
    return payload as T;
  }

  const errorPayload = asBackendErrorBody(payload);
  throw new BackendApiError(
    errorPayload.error?.code || `backend_http_${status}`,
    errorPayload.error?.message || "O backend Rust recusou a solicitação.",
    status,
  );
}

function requestJsonBody(body: BodyInit | null | undefined) {
  if (body == null) return undefined;
  if (typeof body !== "string") {
    throw new BackendApiError(
      "backend_unsupported_body",
      "O núcleo do Labstar recebeu um corpo de requisição não suportado.",
      400,
    );
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new BackendApiError(
      "backend_invalid_json_body",
      "O núcleo do Labstar recebeu JSON inválido.",
      400,
    );
  }
}

function normalizeNativeFailure(error: unknown) {
  const failure = (error && typeof error === "object" ? error : {}) as NativeBackendFailure;
  const code = typeof failure.code === "string" && failure.code
    ? failure.code
    : "backend_transport_failed";
  const message = typeof failure.message === "string" && failure.message
    ? failure.message
    : "A comunicação nativa com o backend Rust foi interrompida.";
  const status = code === "backend_timeout" ? 408 : 503;
  return new BackendApiError(code, message, status);
}

async function requestOnceNative<T>(
  path: string,
  options: RequestInit,
  accessToken?: string,
): Promise<T> {
  try {
    const response = await requestNativeBackend({
      path,
      method: (options.method ?? "GET").toUpperCase(),
      accessToken,
      body: requestJsonBody(options.body),
    });
    return decodeResponse<T>(response.status, response.body);
  } catch (error) {
    if (error instanceof BackendApiError) throw error;
    throw normalizeNativeFailure(error);
  }
}

async function requestOnceWeb<T>(
  path: string,
  options: RequestInit,
  accessToken?: string,
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const headers = new Headers(options.headers);
    headers.set("Accept", "application/json");
    if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

    const response = await fetch(`${requireBackendUrl()}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
      credentials: "omit",
      cache: "no-store",
    });

    if (response.status === 204) return undefined as T;

    let payload: unknown = null;
    try {
      payload = await response.json() as unknown;
    } catch {
      payload = null;
    }

    return decodeResponse<T>(response.status, payload);
  } catch (error) {
    if (error instanceof BackendApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new BackendApiError("backend_timeout", "O backend Rust demorou para responder.", 408);
    }
    throw new BackendApiError("backend_unreachable", "Não foi possível conectar ao backend Rust.", 503);
  } finally {
    window.clearTimeout(timeout);
  }
}

async function requestOnce<T>(path: string, options: RequestInit, accessToken?: string): Promise<T> {
  if (!isTauriApp()) return requestOnceWeb<T>(path, options, accessToken);

  const method = (options.method ?? "GET").toUpperCase();
  try {
    // No desktop, o caminho primário é Rust nativo -> Rust/Fly.io.
    return await requestOnceNative<T>(path, options, accessToken);
  } catch (error) {
    // GET é idempotente: se o transporte nativo falhar por rede/TLS, ainda há
    // uma rota independente pelo WebView. Escritas nunca usam fallback para
    // evitar duplicação de convite, aceite ou revogação.
    if (method === "GET" && isNativeTransportFailure(error)) {
      return requestOnceWeb<T>(path, options, accessToken);
    }
    throw error;
  }
}

async function request<T>(path: string, options: RequestInit = {}, accessToken?: string): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const attempts = method === "GET" ? 2 : 1;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await requestOnce<T>(path, options, accessToken);
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !isRetryableReadError(error)) throw error;
      await wait(READ_RETRY_DELAY_MS);
    }
  }

  throw lastError;
}

function memberAuthorizationError(status: IdentityFallbackRow["status"]) {
  if (status === "pending") {
    return new BackendApiError("member_pending", "O membro ainda aguarda aprovação.", 403);
  }
  if (status === "suspended") {
    return new BackendApiError("member_suspended", "O acesso deste membro está suspenso.", 403);
  }
  return null;
}

async function getBackendIdentityFromSupabase(
  originalError: unknown,
): Promise<BackendMeResponse> {
  const client = requireAuthClient();
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  const session = sessionData.session;

  // O Supabase pode renovar o JWT enquanto a API Rust está em timeout. A
  // autorização do fallback depende da sessão atual e das políticas RLS, não
  // da igualdade textual com o token que iniciou a tentativa anterior.
  if (sessionError || !session?.user) {
    throw originalError;
  }

  const user = session.user;
  const email = user.email?.trim().toLowerCase() ?? "";
  let row: IdentityFallbackRow | null = null;

  const byIdentity = await client
    .from("members")
    .select("id,auth_user_id,email,name,status,role,job_title,area")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (byIdentity.error) throw originalError;
  row = byIdentity.data as IdentityFallbackRow | null;

  if (!row && email) {
    const byEmail = await client
      .from("members")
      .select("id,auth_user_id,email,name,status,role,job_title,area")
      .eq("email", email)
      .maybeSingle();
    if (byEmail.error) throw originalError;
    row = byEmail.data as IdentityFallbackRow | null;
  }

  if (!row) {
    throw new BackendApiError(
      "member_not_authorized",
      "Esta identidade não possui vínculo ativo com a equipe.",
      403,
    );
  }

  const authorizationError = memberAuthorizationError(row.status);
  if (authorizationError) throw authorizationError;

  window.sessionStorage.setItem("labstar-backend-mode", "degraded-supabase-identity");

  return {
    userId: user.id,
    email: row.email,
    member: {
      id: row.id,
      name: row.name,
      status: row.status,
      role: row.role,
      jobTitle: row.job_title ?? "",
      area: row.area ?? "",
    },
  };
}

export async function getBackendIdentity(accessToken: string) {
  let budgetTimer = 0;
  const apiRequest = request<BackendMeResponse>("/v1/me", { method: "GET" }, accessToken);
  const budget = new Promise<BackendMeResponse>((_, reject) => {
    budgetTimer = window.setTimeout(() => {
      reject(new BackendApiError(
        "backend_timeout",
        "A verificação central excedeu o orçamento de inicialização.",
        408,
      ));
    }, IDENTITY_BACKEND_BUDGET_MS);
  });

  try {
    const identity = await Promise.race([apiRequest, budget]);
    window.sessionStorage.setItem("labstar-backend-mode", "rust-api");
    return identity;
  } catch (error) {
    if (!isRetryableReadError(error)) throw error;
    return getBackendIdentityFromSupabase(error);
  } finally {
    window.clearTimeout(budgetTimer);
  }
}

export async function inspectBackendInvite(token: string) {
  return request<BackendInviteInspection>(`/v1/invites/${encodeURIComponent(token)}`, { method: "GET" });
}

export async function acceptBackendInvite(token: string, accessToken: string) {
  return request<BackendAcceptedInvite>(
    `/v1/invites/${encodeURIComponent(token)}/accept`,
    { method: "POST" },
    accessToken,
  );
}

export async function createBackendInvite(input: {
  mode: "quick" | "personal";
  email?: string;
  name?: string;
  role: "admin" | "manager" | "member" | "viewer";
  jobTitle?: string;
  area?: string;
  validForHours: number;
}, accessToken: string) {
  return request<BackendCreatedInvite>(
    "/v1/invites",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    accessToken,
  );
}

export async function revokeBackendInvite(inviteId: string, accessToken: string) {
  await request<void>(
    `/v1/invites/${encodeURIComponent(inviteId)}`,
    { method: "DELETE" },
    accessToken,
  );
}

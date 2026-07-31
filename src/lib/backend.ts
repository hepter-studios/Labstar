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

const DEFAULT_RUST_BACKEND_URL = "https://labstar-api-mackson.fly.dev";
const REQUEST_TIMEOUT_MS = 30_000;
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
    "database_unavailable",
    "backend_http_502",
    "backend_http_503",
    "backend_http_504",
  ].includes(error.code);
}

async function requestOnce<T>(path: string, options: RequestInit, accessToken?: string): Promise<T> {
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

    if (response.ok) {
      if (response.status === 204) return undefined as T;
      return await response.json() as T;
    }

    let payload: BackendErrorBody = {};
    try {
      payload = await response.json() as BackendErrorBody;
    } catch {
      // A resposta sem JSON ainda será convertida em erro tipado abaixo.
    }

    throw new BackendApiError(
      payload.error?.code || `backend_http_${response.status}`,
      payload.error?.message || "O backend Rust recusou a solicitação.",
      response.status,
    );
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

export async function getBackendIdentity(accessToken: string) {
  return request<BackendMeResponse>("/v1/me", { method: "GET" }, accessToken);
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

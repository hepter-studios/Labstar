import { requireAuthClient } from "./auth-client";

const INVITE_STORAGE_KEY = "labstar-pending-invite";
const ACCESS_CHANGED_EVENT = "labstar:access-changed";
const NATIVE_ERROR_KEY = "labstar-native-auth-error";

type ValidatedDeepLink = {
  kind: "invite" | "auth_callback" | "web_invite";
  inviteToken: string | null;
  tokenHint: string | null;
  authorizationCode: string | null;
  hasAuthorizationCode: boolean;
  hasProviderError: boolean;
  normalizedTarget: string;
};

type Unlisten = () => void;

type TauriGlobal = {
  core: {
    invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  };
  event: {
    listen<T>(event: string, handler: (event: { payload: T }) => void): Promise<Unlisten>;
  };
};

export type NativeBackendRequest = {
  path: string;
  method: string;
  accessToken?: string;
  body?: unknown;
};

export type NativeBackendResponse = {
  status: number;
  body: unknown;
};

export type NativeBackendFailure = {
  code?: string;
  message?: string;
  retryable?: boolean;
};

declare global {
  interface Window {
    __TAURI__?: TauriGlobal;
  }
}

export function isTauriApp() {
  return Boolean(window.__TAURI__?.core?.invoke);
}

export async function requestNativeBackend(input: NativeBackendRequest) {
  const tauri = window.__TAURI__;
  if (!tauri?.core?.invoke) throw new Error("tauri_bridge_unavailable");
  return tauri.core.invoke<NativeBackendResponse>("native_backend_request", { input });
}

export function nativeOAuthReturnUrl() {
  const token = window.sessionStorage.getItem(INVITE_STORAGE_KEY)?.trim().toLowerCase() ?? "";
  const url = new URL("labstar://auth/callback");
  if (/^[0-9a-f]{64}$/.test(token)) url.searchParams.set("invite", token);
  return url.toString();
}

export async function openNativeAuthUrl(url: string) {
  if (!window.__TAURI__) throw new Error("tauri_bridge_unavailable");
  await window.__TAURI__.core.invoke("open_auth_url", { url });
}

export function takeNativeAuthError() {
  const error = window.sessionStorage.getItem(NATIVE_ERROR_KEY) ?? "";
  window.sessionStorage.removeItem(NATIVE_ERROR_KEY);
  return error;
}

function rememberInvite(token: string | null) {
  if (token && /^[0-9a-f]{64}$/.test(token)) {
    window.sessionStorage.setItem(INVITE_STORAGE_KEY, token);
  }
}

async function processDeepLink(link: ValidatedDeepLink) {
  rememberInvite(link.inviteToken);

  if (link.kind === "auth_callback") {
    if (link.hasProviderError) {
      window.sessionStorage.setItem(NATIVE_ERROR_KEY, "oauth_provider_error");
      return;
    }

    if (!link.authorizationCode) throw new Error("oauth_code_missing");
    const { error } = await requireAuthClient().auth.exchangeCodeForSession(link.authorizationCode);
    if (error) throw error;
  }

  window.dispatchEvent(new CustomEvent(ACCESS_CHANGED_EVENT));
}

export async function initializeNativeBridge(): Promise<Unlisten> {
  const tauri = window.__TAURI__;
  if (!tauri) return () => undefined;

  const pending = await tauri.core.invoke<ValidatedDeepLink[]>("take_pending_deep_links");
  for (const link of pending) await processDeepLink(link);

  return tauri.event.listen<ValidatedDeepLink>("labstar://deep-link", (event) => {
    void processDeepLink(event.payload)
      .then(() => window.location.reload())
      .catch(() => {
        window.sessionStorage.setItem(NATIVE_ERROR_KEY, "native_deep_link_failed");
        window.location.reload();
      });
  });
}

export const nativeAccessChangedEvent = ACCESS_CHANGED_EVENT;

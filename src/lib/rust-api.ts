import { requireAuthClient } from "./auth-client";

const configuredBaseUrl = String(import.meta.env.VITE_LABSTAR_API_URL ?? "").trim();

export const rustApiBaseUrl = (
  configuredBaseUrl || "https://labstar-api-mackson.fly.dev"
).replace(/\/+$/, "");

export class RustApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = "RustApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

type ApiFailurePayload = {
  code?: string;
  message?: string;
  details?: unknown;
};

type ApiFailure = ApiFailurePayload & {
  error?: string | ApiFailurePayload;
};

async function accessToken() {
  const { data, error } = await requireAuthClient().auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new RustApiError("authentication_required", "Sua sessão expirou.", 401);
  return token;
}

async function decodeFailure(response: Response) {
  let payload: ApiFailure | null = null;
  try {
    payload = await response.json() as ApiFailure;
  } catch {
    // A API pode responder sem corpo em falhas de infraestrutura.
  }
  const nested = payload?.error && typeof payload.error === "object" ? payload.error : null;
  const flatError = typeof payload?.error === "string" ? payload.error : undefined;
  const code = nested?.code || payload?.code || flatError || `http_${response.status}`;
  const message = nested?.message || payload?.message || readableMessage(code, response.status);
  return new RustApiError(code, message, response.status, nested?.details ?? payload?.details);
}

function readableMessage(code: string, status: number) {
  const messages: Record<string, string> = {
    authentication_required: "Entre novamente no Labstar.",
    invalid_session: "Sua sessão não é mais válida.",
    member_not_authorized: "Esta conta não possui acesso ao Labstar.",
    member_pending: "Seu acesso ainda aguarda aprovação.",
    member_suspended: "Seu acesso está suspenso.",
    permission_denied: "Você não possui permissão para realizar esta ação.",
    payload_too_large: "O conteúdo enviado ultrapassa o limite permitido.",
    upstream_unavailable: "Um serviço necessário está temporariamente indisponível.",
    database_unavailable: "O banco de dados está temporariamente indisponível.",
  };
  return messages[code] || (status >= 500
    ? "O backend Rust do Labstar não respondeu corretamente."
    : "A solicitação não pôde ser concluída.");
}

async function decodeSuccess<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export async function rustPublicApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${rustApiBaseUrl}${path}`, {
    ...init,
    headers: new Headers({ Accept: "application/json", ...Object.fromEntries(new Headers(init.headers)) }),
    credentials: "omit",
  });
  if (!response.ok) throw await decodeFailure(response);
  return decodeSuccess<T>(response);
}

export async function rustApi<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await accessToken();
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${rustApiBaseUrl}${path}`, {
    ...init,
    headers,
    credentials: "omit",
  });
  if (!response.ok) throw await decodeFailure(response);
  return decodeSuccess<T>(response);
}

export function jsonBody(value: unknown) {
  return JSON.stringify(value);
}

export async function rustApiUpload<T>(path: string, formData: FormData): Promise<T> {
  return rustApi<T>(path, { method: "POST", body: formData });
}

export type RustRealtimeEvent =
  | { type: "presenceSnapshot"; payload: { memberIds: string[] } }
  | { type: "directMessageCreated"; payload: { threadId: string; messageId: string; authorId: string } }
  | { type: "directMessageUpdated"; payload: { threadId: string; messageId: string } }
  | { type: "directMessageDeleted"; payload: { threadId: string; messageId: string } }
  | { type: "channelMessageChanged"; payload: { channelId: string; messageId: string } }
  | { type: "notificationChanged"; payload: { memberId: string } }
  | { type: "callCreated"; payload: { callId: string; recipientId: string } }
  | { type: "callUpdated"; payload: { callId: string; status: string } }
  | { type: "callSignal"; payload: { callId: string; signalId: number; recipientId: string } }
  | { type: "workItemsChanged"; payload?: Record<string, never> };

type RealtimeTicket = {
  ticket: string;
  expiresInSeconds: number;
};

export type RustRealtimeSubscription = {
  socket: WebSocket;
  close: () => void;
};

export async function subscribeRustRealtime(
  onEvent: (event: RustRealtimeEvent) => void,
  onStatus?: (status: "connecting" | "connected" | "disconnected" | "error") => void,
): Promise<RustRealtimeSubscription> {
  onStatus?.("connecting");
  const { ticket } = await rustApi<RealtimeTicket>("/v1/realtime/ticket", { method: "POST" });
  const websocketBase = rustApiBaseUrl.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
  const socket = new WebSocket(`${websocketBase}/v1/realtime?ticket=${encodeURIComponent(ticket)}`);
  let closed = false;
  let heartbeat = 0;

  socket.addEventListener("open", () => {
    onStatus?.("connected");
    heartbeat = window.setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) socket.send('{"type":"heartbeat"}');
    }, 18_000);
  });
  socket.addEventListener("message", (message) => {
    try {
      onEvent(JSON.parse(String(message.data)) as RustRealtimeEvent);
    } catch {
      // Eventos inválidos são ignorados sem derrubar a conexão.
    }
  });
  socket.addEventListener("error", () => onStatus?.("error"));
  socket.addEventListener("close", () => {
    window.clearInterval(heartbeat);
    if (!closed) onStatus?.("disconnected");
  });

  return {
    socket,
    close: () => {
      closed = true;
      window.clearInterval(heartbeat);
      socket.close(1000, "labstar_client_closed");
    },
  };
}

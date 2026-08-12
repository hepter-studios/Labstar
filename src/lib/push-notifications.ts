import { isTauriApp } from "./native";
import { isNativeMobileRuntime } from "./native-secure-storage";
import { supabaseClient } from "./supabase";

const DEVICE_ID_KEY = "labstar-push-device-id-v1";
const NATIVE_PERMISSION_KEY = "labstar-native-notification-permission-v1";
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");
const PUSH_FUNCTION_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/labstar-push` : "";

export type DeviceNotificationState =
  | "active"
  | "native-ready"
  | "blocked"
  | "available"
  | "install-required"
  | "unsupported";

type NativeNotificationApi = {
  isPermissionGranted(): Promise<boolean>;
  requestPermission(): Promise<"granted" | "denied" | "default">;
};

function nativeNotificationApi() {
  return (window as typeof window & { __TAURI__?: { notification?: NativeNotificationApi } }).__TAURI__?.notification;
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function deviceId() {
  const existing = window.localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(DEVICE_ID_KEY, created);
  return created;
}

function decodeVapidKey(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const decoded = window.atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

async function publicVapidKey() {
  if (!PUSH_FUNCTION_URL) throw new Error("push_not_configured");
  const response = await fetch(PUSH_FUNCTION_URL, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error("push_key_unavailable");
  const payload = await response.json() as { publicKey?: string };
  if (!payload.publicKey) throw new Error("push_key_unavailable");
  return payload.publicKey;
}

async function saveSubscription(subscription: PushSubscription) {
  if (!supabaseClient) throw new Error("supabase_not_configured");
  const json = subscription.toJSON();
  const { error } = await supabaseClient.rpc("upsert_push_subscription", {
    p_device_id: deviceId(),
    p_endpoint: subscription.endpoint,
    p_p256dh: json.keys?.p256dh ?? "",
    p_auth: json.keys?.auth ?? "",
    p_platform: isTauriApp() ? "tauri" : isIos() ? "ios-pwa" : "web-pwa",
    p_user_agent: navigator.userAgent.slice(0, 500),
  });
  if (error) throw error;
}

function cachedNativePermission(): DeviceNotificationState {
  const cached = window.localStorage.getItem(NATIVE_PERMISSION_KEY);
  if (cached === "native-ready" || cached === "blocked") return cached;
  return "available";
}

function rememberNativePermission(state: DeviceNotificationState) {
  if (state === "native-ready" || state === "blocked" || state === "available") {
    window.localStorage.setItem(NATIVE_PERMISSION_KEY, state);
  }
}

export function getDeviceNotificationState(): DeviceNotificationState {
  if (isNativeMobileRuntime()) return cachedNativePermission();
  if (isTauriApp()) return "active";
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
  if (isIos() && !isStandalone()) return "install-required";
  if (Notification.permission === "denied") return "blocked";
  return Notification.permission === "granted" ? "active" : "available";
}

export async function refreshDeviceNotificationState(): Promise<DeviceNotificationState> {
  if (!isNativeMobileRuntime()) return getDeviceNotificationState();
  const api = nativeNotificationApi();
  if (!api) return "unsupported";
  try {
    if (await api.isPermissionGranted()) {
      rememberNativePermission("native-ready");
      return "native-ready";
    }
    return cachedNativePermission();
  } catch {
    return "unsupported";
  }
}

export async function enableDeviceNotifications(): Promise<DeviceNotificationState> {
  if (isNativeMobileRuntime()) {
    const api = nativeNotificationApi();
    if (!api) return "unsupported";
    try {
      if (await api.isPermissionGranted()) {
        rememberNativePermission("native-ready");
        return "native-ready";
      }
      const permission = await api.requestPermission();
      const state: DeviceNotificationState = permission === "granted"
        ? "native-ready"
        : permission === "denied"
        ? "blocked"
        : "available";
      rememberNativePermission(state);
      return state;
    } catch {
      return "unsupported";
    }
  }

  if (isTauriApp()) {
    await window.__TAURI__?.core.invoke("show_native_notification", {
      title: "★ Labstar conectado",
      body: "Alertas locais estão disponíveis neste computador.",
    });
    return "active";
  }

  const current = getDeviceNotificationState();
  if (current === "unsupported" || current === "install-required" || current === "blocked") return current;
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "blocked" : "available";

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeVapidKey(await publicVapidKey()),
    });
  }
  await saveSubscription(subscription);
  return "active";
}

export async function syncDeviceNotificationSubscription() {
  if (isTauriApp() || Notification.permission !== "granted" || !("serviceWorker" in navigator)) return false;
  try {
    const subscription = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    if (!subscription) return false;
    await saveSubscription(subscription);
    return true;
  } catch {
    return false;
  }
}

export async function hasActivePushSubscription() {
  if (isTauriApp() || Notification.permission !== "granted" || !("serviceWorker" in navigator)) return false;
  try {
    return Boolean(await (await navigator.serviceWorker.ready).pushManager.getSubscription());
  } catch {
    return false;
  }
}

export async function disableDeviceNotifications() {
  if (isNativeMobileRuntime()) {
    rememberNativePermission(await refreshDeviceNotificationState());
    return;
  }
  if (isTauriApp() || !("serviceWorker" in navigator)) return;
  const subscription = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
  if (!subscription) return;
  if (supabaseClient) {
    await supabaseClient.rpc("remove_push_subscription", { p_endpoint: subscription.endpoint });
  }
  await subscription.unsubscribe();
}

export async function updateAppBadge(count: number) {
  const badge = navigator as Navigator & { setAppBadge?: (value?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  try {
    if (count > 0) await badge.setAppBadge?.(count);
    else await badge.clearAppBadge?.();
  } catch {
    // O contador interno continua sendo a fonte visual quando o SO não oferece App Badge.
  }
}

export function deviceNotificationStateMessage(state: DeviceNotificationState) {
  if (state === "active") return "Alertas externos ativos neste dispositivo.";
  if (state === "native-ready") return "Permissão nativa concedida. Alertas locais funcionam enquanto o Labstar está executando; push remoto em segundo plano aguarda FCM/APNs.";
  if (state === "blocked") return "As notificações estão bloqueadas nas configurações do sistema ou navegador.";
  if (state === "install-required") return "No iPhone/iPad, adicione o Labstar à Tela de Início e abra o app instalado para ativar.";
  if (state === "unsupported") return "Este dispositivo não oferece notificações externas compatíveis.";
  return "Pronto para solicitar a permissão de alertas deste dispositivo.";
}

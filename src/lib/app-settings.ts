import { applyLightSurfaceEffects } from "../light-surface-effects";
import { isTauriApp } from "./native";

export type AppSettings = {
  version: number;
  startView: "mapa" | "visao" | "colaboracao" | "equipe";
  themeMode: "dark" | "light";
  density: "comfortable" | "compact";
  nebulaIntensity: "off" | "subtle" | "visible";
  reducedMotion: boolean;
  desktopNotifications: boolean;
  mentionNotifications: boolean;
  interfaceSounds: boolean;
  messageSounds: boolean;
  preferredMicrophone: string;
  preferredCamera: string;
  confirmDestructiveActions: boolean;
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  version: 1,
  startView: "colaboracao",
  themeMode: "dark",
  density: "comfortable",
  nebulaIntensity: "subtle",
  reducedMotion: false,
  desktopNotifications: true,
  mentionNotifications: true,
  interfaceSounds: true,
  messageSounds: true,
  preferredMicrophone: "",
  preferredCamera: "",
  confirmDestructiveActions: true,
};

const WEB_STORAGE_KEY = "labstar-app-settings-v1";
const SETTINGS_CHANGED_EVENT = "labstar:settings-changed";

function normalize(value: Partial<AppSettings> | null | undefined): AppSettings {
  return {
    ...DEFAULT_APP_SETTINGS,
    ...value,
    version: 1,
    startView: ["mapa", "visao", "colaboracao", "equipe"].includes(value?.startView ?? "")
      ? value!.startView as AppSettings["startView"]
      : DEFAULT_APP_SETTINGS.startView,
    themeMode: ["dark", "light"].includes(value?.themeMode ?? "")
      ? value!.themeMode as AppSettings["themeMode"]
      : DEFAULT_APP_SETTINGS.themeMode,
    density: ["comfortable", "compact"].includes(value?.density ?? "")
      ? value!.density as AppSettings["density"]
      : DEFAULT_APP_SETTINGS.density,
    nebulaIntensity: ["off", "subtle", "visible"].includes(value?.nebulaIntensity ?? "")
      ? value!.nebulaIntensity as AppSettings["nebulaIntensity"]
      : DEFAULT_APP_SETTINGS.nebulaIntensity,
    preferredMicrophone: (value?.preferredMicrophone ?? "").slice(0, 512),
    preferredCamera: (value?.preferredCamera ?? "").slice(0, 512),
  };
}

async function invoke<T>(command: string, args?: Record<string, unknown>) {
  const tauri = window.__TAURI__;
  if (!tauri?.core?.invoke) throw new Error("tauri_bridge_unavailable");
  return tauri.core.invoke<T>(command, args);
}

export async function loadAppSettings(): Promise<AppSettings> {
  if (isTauriApp()) {
    try {
      const settings = await invoke<AppSettings>("load_app_settings");
      return normalize(settings);
    } catch {
      return DEFAULT_APP_SETTINGS;
    }
  }

  try {
    const raw = window.localStorage.getItem(WEB_STORAGE_KEY);
    return normalize(raw ? JSON.parse(raw) as Partial<AppSettings> : null);
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

export async function saveAppSettings(settings: AppSettings): Promise<AppSettings> {
  const normalized = normalize(settings);
  let saved = normalized;

  if (isTauriApp()) {
    saved = normalize(await invoke<AppSettings>("save_app_settings", { settings: normalized }));
  } else {
    window.localStorage.setItem(WEB_STORAGE_KEY, JSON.stringify(normalized));
  }

  applyAppSettings(saved);
  window.dispatchEvent(new CustomEvent<AppSettings>(SETTINGS_CHANGED_EVENT, { detail: saved }));
  return saved;
}

export async function resetAppSettings(): Promise<AppSettings> {
  let settings = DEFAULT_APP_SETTINGS;
  if (isTauriApp()) {
    settings = normalize(await invoke<AppSettings>("reset_app_settings"));
  } else {
    window.localStorage.removeItem(WEB_STORAGE_KEY);
  }
  applyAppSettings(settings);
  window.dispatchEvent(new CustomEvent<AppSettings>(SETTINGS_CHANGED_EVENT, { detail: settings }));
  return settings;
}

export function applyAppSettings(settings: AppSettings) {
  const root = document.documentElement;
  root.dataset.labstarTheme = settings.themeMode;
  root.style.colorScheme = settings.themeMode;
  root.dataset.labstarDensity = settings.density;
  root.dataset.labstarNebula = settings.nebulaIntensity;
  root.dataset.labstarMotion = settings.reducedMotion ? "reduced" : "full";
  root.dataset.labstarMessageSounds = settings.messageSounds ? "on" : "off";
  applyLightSurfaceEffects();
}

export function subscribeToAppSettings(callback: (settings: AppSettings) => void) {
  const listener = (event: Event) => {
    callback((event as CustomEvent<AppSettings>).detail);
  };
  window.addEventListener(SETTINGS_CHANGED_EVENT, listener);
  return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, listener);
}

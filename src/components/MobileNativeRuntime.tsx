import { useEffect } from "react";
import { isTauriApp } from "../lib/native";

type PluginListener = { unregister(): Promise<void> };
type NativeAppApi = {
  onBackButtonPress(handler: (payload: { canGoBack: boolean }) => void): Promise<PluginListener>;
};
type NativeCoreApi = {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
};

type MobileTauriGlobal = {
  app?: NativeAppApi;
  core?: NativeCoreApi;
};

const MODAL_SELECTORS = [
  '[role="dialog"][aria-modal="true"]',
  ".notifications-panel",
  ".command-palette-panel",
  ".quick-panel",
  ".global-settings-panel",
  ".workspace-settings-panel",
  ".organization-switcher-menu",
  ".member-quick-menu",
];

const EXPLICIT_BACK_SELECTORS = [
  ".dm-mobile-back",
  ".mobile-workspace-back",
  ".mobile-settings-back",
  '[data-mobile-back="true"]',
];

function mobileTauri() {
  return (window as typeof window & { __TAURI__?: MobileTauriGlobal }).__TAURI__;
}

function isAndroid() {
  return /android/i.test(navigator.userAgent);
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function visible(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== "none"
    && style.visibility !== "hidden"
    && Number(style.opacity || 1) > 0
    && rect.width > 0
    && rect.height > 0;
}

function dismissTopSurface() {
  const candidates = MODAL_SELECTORS.flatMap((selector) => Array.from(document.querySelectorAll(selector)))
    .filter(visible);
  const top = candidates.at(-1);
  if (!top) return false;

  const close = Array.from(top.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => {
      const label = `${button.getAttribute("aria-label") ?? ""} ${button.title ?? ""}`.toLocaleLowerCase();
      return /fechar|voltar|cancelar|close|back|cancel/.test(label) && !button.disabled;
    });
  if (close) close.click();
  else window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  return true;
}

function clickExplicitBack() {
  for (const selector of EXPLICIT_BACK_SELECTORS) {
    const button = Array.from(document.querySelectorAll<HTMLElement>(selector)).find(visible);
    if (!button) continue;
    button.click();
    return true;
  }
  return false;
}

function stepWorkspaceBack() {
  const shell = document.querySelector<HTMLElement>(".collaboration-shell[data-mobile-pane]");
  if (!visible(shell)) return false;

  const pane = shell.dataset.mobilePane;
  const target = pane === "members" || pane === "content" ? "channels" : pane === "channels" ? "spaces" : "";
  if (!target) return false;
  const button = document.querySelector<HTMLButtonElement>(`#labstar-mobile-workspace-nav button[data-pane="${target}"]`);
  if (!visible(button)) return false;
  button.click();
  return true;
}

function updateViewportMetrics() {
  const viewport = window.visualViewport;
  const height = viewport?.height ?? window.innerHeight;
  const keyboardHeight = Math.max(0, window.innerHeight - height - (viewport?.offsetTop ?? 0));
  const root = document.documentElement;
  root.style.setProperty("--labstar-visual-height", `${Math.round(height)}px`);
  root.style.setProperty("--labstar-keyboard-height", `${Math.round(keyboardHeight)}px`);
  root.classList.toggle("labstar-keyboard-open", keyboardHeight > 120);
}

export function MobileNativeRuntime() {
  useEffect(() => {
    if (!isTauriApp() || (!isAndroid() && !isIos())) return undefined;

    const root = document.documentElement;
    root.classList.add("labstar-native-mobile");
    root.classList.toggle("labstar-android", isAndroid());
    root.classList.toggle("labstar-ios", isIos());

    updateViewportMetrics();
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", updateViewportMetrics);
    viewport?.addEventListener("scroll", updateViewportMetrics);
    window.addEventListener("resize", updateViewportMetrics);
    window.addEventListener("orientationchange", updateViewportMetrics);

    const onVisibilityChange = () => {
      root.classList.toggle("labstar-app-backgrounded", document.visibilityState !== "visible");
      window.dispatchEvent(new CustomEvent("labstar:native-lifecycle", {
        detail: { state: document.visibilityState },
      }));
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    let disposed = false;
    let backListener: PluginListener | null = null;
    if (isAndroid()) {
      const tauri = mobileTauri();
      void tauri?.app?.onBackButtonPress((payload) => {
        if (dismissTopSurface() || clickExplicitBack() || stepWorkspaceBack()) return;
        if (payload.canGoBack && window.history.length > 1) {
          window.history.back();
          return;
        }
        void tauri.core?.invoke("exit_mobile_app");
      }).then((listener) => {
        if (disposed) void listener.unregister();
        else backListener = listener;
      }).catch((error) => {
        window.dispatchEvent(new CustomEvent("labstar:native-boot-warning", {
          detail: `android_back_listener_failed:${String((error as Error)?.message ?? error)}`,
        }));
      });
    }

    return () => {
      disposed = true;
      void backListener?.unregister();
      viewport?.removeEventListener("resize", updateViewportMetrics);
      viewport?.removeEventListener("scroll", updateViewportMetrics);
      window.removeEventListener("resize", updateViewportMetrics);
      window.removeEventListener("orientationchange", updateViewportMetrics);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      root.classList.remove("labstar-native-mobile", "labstar-android", "labstar-ios", "labstar-keyboard-open", "labstar-app-backgrounded");
      root.style.removeProperty("--labstar-visual-height");
      root.style.removeProperty("--labstar-keyboard-height");
    };
  }, []);

  return null;
}

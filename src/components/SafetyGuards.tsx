import { useEffect, useRef } from "react";
import {
  DEFAULT_APP_SETTINGS,
  loadAppSettings,
  subscribeToAppSettings,
  type AppSettings,
} from "../lib/app-settings";

const destructiveWords = /\b(excluir|remover|revogar|apagar|suspender|encerrar|desconectar)\b/i;

export function SafetyGuards() {
  const settings = useRef<AppSettings>(DEFAULT_APP_SETTINGS);

  useEffect(() => {
    let cancelled = false;
    void loadAppSettings().then((value) => {
      if (!cancelled) settings.current = value;
    });
    const unsubscribe = subscribeToAppSettings((value) => {
      settings.current = value;
    });

    const guard = (event: MouseEvent) => {
      if (!settings.current.confirmDestructiveActions) return;
      const target = event.target as HTMLElement | null;
      const button = target?.closest<HTMLButtonElement>("button");
      if (!button || button.disabled || button.dataset.skipDestructiveGuard === "true") return;

      const label = [
        button.getAttribute("aria-label"),
        button.getAttribute("title"),
        button.textContent,
      ].filter(Boolean).join(" ").trim();

      const explicit = button.dataset.destructive === "true"
        || button.classList.contains("danger")
        || button.classList.contains("delete-node")
        || button.classList.contains("settings-danger")
        || destructiveWords.test(label);

      if (!explicit) return;

      const readable = label.replace(/\s+/g, " ").trim() || "esta ação";
      if (window.confirm(`Confirmar ${readable.toLocaleLowerCase()}?`)) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    document.addEventListener("click", guard, true);
    return () => {
      cancelled = true;
      unsubscribe();
      document.removeEventListener("click", guard, true);
    };
  }, []);

  return null;
}

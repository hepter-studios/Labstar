import { useEffect, useRef } from "react";
import { getCurrentAccessIdentity } from "../lib/access";

const RECOVERY_KEY = "labstar-app-session-recovery-v1";
const RECOVERY_WINDOW_MS = 2 * 60 * 1000;

export function AppSessionRecovery() {
  const checking = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let observer: MutationObserver | null = null;

    const clearIfHealthy = () => {
      if (document.querySelector("main.app")) window.sessionStorage.removeItem(RECOVERY_KEY);
    };

    const check = async () => {
      clearIfHealthy();
      if (checking.current || !document.body.textContent?.includes("Não foi possível abrir o Labstar")) return;
      checking.current = true;
      try {
        const identity = await getCurrentAccessIdentity();
        if (cancelled || !identity?.member || identity.authorization !== "active") return;

        const previous = Number(window.sessionStorage.getItem(RECOVERY_KEY) ?? 0);
        const now = Date.now();
        if (previous && now - previous < RECOVERY_WINDOW_MS) return;

        window.sessionStorage.setItem(RECOVERY_KEY, String(now));
        window.location.reload();
      } catch {
        // O AccessControl permanece responsável por mostrar a causa real do Rust.
      } finally {
        checking.current = false;
      }
    };

    observer = new MutationObserver(() => void check());
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    void check();

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, []);

  return null;
}

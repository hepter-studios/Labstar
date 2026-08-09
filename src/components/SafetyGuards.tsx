import { AlertTriangle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  DEFAULT_APP_SETTINGS,
  loadAppSettings,
  subscribeToAppSettings,
  type AppSettings,
} from "../lib/app-settings";

const destructiveWords = /\b(excluir|remover|revogar|apagar|suspender|encerrar|desconectar)\b/i;

type PendingAction = {
  button: HTMLButtonElement;
  label: string;
};

export function SafetyGuards() {
  const settings = useRef<AppSettings>(DEFAULT_APP_SETTINGS);
  const [pending, setPending] = useState<PendingAction | null>(null);

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

      // Fluxos que já possuem uma confirmação própria não podem abrir uma
      // segunda confirmação global. Em menus/portais isso desmontava o botão
      // original antes de `button.click()` ser reenviado, fazendo a ação parecer
      // completamente quebrada.
      if (button.closest('[data-labstar-destructive-confirmation="true"]')) return;

      const label = [
        button.getAttribute("aria-label"),
        button.getAttribute("title"),
        button.textContent,
      ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

      const explicit = button.dataset.destructive === "true"
        || button.classList.contains("danger")
        || button.classList.contains("delete-node")
        || button.classList.contains("settings-danger")
        || destructiveWords.test(label);

      if (!explicit) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setPending({ button, label: label || "esta ação" });
    };

    document.addEventListener("click", guard, true);
    return () => {
      cancelled = true;
      unsubscribe();
      document.removeEventListener("click", guard, true);
    };
  }, []);

  useEffect(() => {
    if (!pending) return undefined;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPending(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [pending]);

  function confirmAction() {
    if (!pending) return;
    const { button } = pending;
    setPending(null);
    button.dataset.skipDestructiveGuard = "true";
    window.requestAnimationFrame(() => {
      // Só reenvia o clique se o botão ainda estiver realmente montado. Isso
      // evita cliques em referências DOM órfãs de portais já desmontados.
      if (button.isConnected) button.click();
      window.setTimeout(() => delete button.dataset.skipDestructiveGuard, 0);
    });
  }

  if (!pending) return null;

  return createPortal(
    <div className="safety-confirm-backdrop" onMouseDown={() => setPending(null)}>
      <section
        className="safety-confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="safety-confirm-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span><AlertTriangle size={20} /></span>
        <h2 id="safety-confirm-title">Confirmar ação</h2>
        <p>Você está prestes a {pending.label.toLocaleLowerCase()}. Essa alteração pode afetar dados compartilhados da equipe.</p>
        <div className="safety-confirm-actions">
          <button type="button" onClick={() => setPending(null)}>Cancelar</button>
          <button className="confirm" type="button" onClick={confirmAction}>Confirmar</button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

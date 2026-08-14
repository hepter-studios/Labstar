import { useEffect } from "react";
import { secureSignOut } from "../lib/access";

export function LegacyActionBridge() {
  useEffect(() => {
    const capture = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest<HTMLButtonElement>("button");
      if (!button) return;

      const label = button.textContent?.replace(/\s+/g, " ").trim().toLocaleLowerCase() ?? "";
      const legacySignOut = button.classList.contains("sign-out")
        || (button.classList.contains("secondary-link") && (label.includes("desconectar") || label.includes("outra conta")));

      if (!legacySignOut) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      void secureSignOut();
    };

    document.addEventListener("click", capture, true);
    return () => document.removeEventListener("click", capture, true);
  }, []);

  return null;
}

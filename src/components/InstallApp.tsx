import { Download, Share, X } from "lucide-react";
import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem("labstar-install-dismissed") === "1");
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const installed = () => {
      setPrompt(null);
      setShowIosHelp(false);
    };
    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  if (isStandalone() || dismissed || (!prompt && !ios)) return null;

  async function install() {
    if (!prompt) {
      setShowIosHelp(true);
      return;
    }
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") setPrompt(null);
  }

  function dismiss() {
    localStorage.setItem("labstar-install-dismissed", "1");
    setDismissed(true);
  }

  return (
    <aside className="install-app" aria-label="Instalar Labstar">
      <button className="install-app-close" type="button" onClick={dismiss} aria-label="Fechar"><X size={14} /></button>
      <div className="install-app-icon"><Download size={18} /></div>
      <div>
        <strong>Instale a Labstar</strong>
        <span>{showIosHelp ? <>No Safari, toque em <Share size={13} /> e depois em <b>Adicionar à Tela de Início</b>.</> : "Abra como aplicativo no seu dispositivo."}</span>
      </div>
      {!showIosHelp && <button className="install-app-action" type="button" onClick={install}>Instalar</button>}
    </aside>
  );
}

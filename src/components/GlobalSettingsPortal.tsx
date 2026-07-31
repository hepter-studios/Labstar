import { Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  DEFAULT_APP_SETTINGS,
  loadAppSettings,
  type AppSettings,
} from "../lib/app-settings";
import { getCurrentAccessIdentity } from "../lib/access";
import { getCurrentIdentity, type Member } from "../lib/supabase";
import { GlobalSettings } from "./GlobalSettings";

export function GlobalSettingsPortal() {
  const [target, setTarget] = useState<Element | null>(null);
  const [open, setOpen] = useState(false);
  const [member, setMember] = useState<Member | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);

  useEffect(() => {
    const find = () => setTarget(document.querySelector(".rail-bottom"));
    find();
    const observer = new MutationObserver(find);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [preferences, access] = await Promise.all([
          loadAppSettings(),
          getCurrentAccessIdentity(),
        ]);
        if (cancelled) return;
        setSettings(preferences);
        if (!access?.member || access.authorization !== "active") return;

        try {
          const identity = await getCurrentIdentity();
          if (!cancelled) setMember(identity?.member ?? access.member);
        } catch {
          if (!cancelled) setMember(access.member);
        }
      } catch {
        // O portal não interfere com a tela de acesso quando ainda não há sessão válida.
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [open]);

  if (!target || !member) return null;

  const launcher = createPortal(
    <button
      type="button"
      data-tooltip="Configurações"
      aria-label="Configurações do Labstar"
      className={open ? "active" : ""}
      onClick={() => setOpen((value) => !value)}
    >
      <Settings size={17} />
    </button>,
    target,
  );

  function navigate(view: "mapa" | "visao" | "colaboracao" | "equipe") {
    const labels: Record<typeof view, string> = {
      mapa: "Mapa da organização",
      visao: "Visão geral",
      colaboracao: "Central de trabalho",
      equipe: "Equipe",
    };
    document.querySelector<HTMLButtonElement>(`button[aria-label="${labels[view]}"]`)?.click();
  }

  function syncSound(enabled: boolean) {
    const button = document.querySelector<HTMLButtonElement>('button[aria-label="Ativar ou desativar som"]');
    if (!button) return;
    const currentlyEnabled = button.dataset.tooltip === "Desativar som";
    if (currentlyEnabled !== enabled) button.click();
  }

  return (
    <>
      {launcher}
      {open && createPortal(
        <GlobalSettings
          member={member}
          settings={settings}
          onClose={() => setOpen(false)}
          onSettingsChanged={setSettings}
          onMemberUpdated={setMember}
          onSoundChanged={syncSound}
          onNavigate={navigate}
        />,
        document.body,
      )}
    </>
  );
}

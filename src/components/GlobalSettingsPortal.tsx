import { Moon, Settings, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  DEFAULT_APP_SETTINGS,
  loadAppSettings,
  saveAppSettings,
  type AppSettings,
} from "../lib/app-settings";
import { OPEN_ACHIEVEMENT_EVENT, type AchievementKey } from "../lib/achievements";
import { getCurrentAccessIdentity } from "../lib/access";
import { devPreviewCurrentMember } from "../lib/devPreview";
import { isDevPreviewMode } from "../lib/devPreviewMode";
import { getCurrentIdentity, MEMBER_PROFILE_UPDATED_EVENT, type Member } from "../lib/supabase";
import { GlobalSettings } from "./GlobalSettings";

const MOBILE_SETTINGS_QUERY = "(max-width: 760px)";
export function GlobalSettingsPortal() {
  const [target, setTarget] = useState<Element | null>(null);
  const [mobileLauncher, setMobileLauncher] = useState(false);
  const [open, setOpen] = useState(false);
  const [member, setMember] = useState<Member | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [focusedAchievement, setFocusedAchievement] = useState<AchievementKey | null>(null);
  const [themeSaving, setThemeSaving] = useState(false);
  const startupApplied = useRef(false);

  useEffect(() => {
    const inspectAchievement = (event: Event) => {
      const key = (event as CustomEvent<{ key?: AchievementKey }>).detail?.key;
      if (!key) return;
      setFocusedAchievement(key);
      setOpen(true);
    };
    window.addEventListener(OPEN_ACHIEVEMENT_EVENT, inspectAchievement);
    return () => window.removeEventListener(OPEN_ACHIEVEMENT_EVENT, inspectAchievement);
  }, []);

  useEffect(() => {
    const updateMember = (event: Event) => {
      const updated = (event as CustomEvent<Member>).detail;
      if (updated) setMember((current) => current?.id === updated.id ? updated : current);
    };
    window.addEventListener(MEMBER_PROFILE_UPDATED_EVENT, updateMember);
    return () => window.removeEventListener(MEMBER_PROFILE_UPDATED_EVENT, updateMember);
  }, []);

  useEffect(() => {
    const media = window.matchMedia(MOBILE_SETTINGS_QUERY);
    const find = () => {
      const mobile = media.matches;
      setMobileLauncher(mobile);
      setTarget(document.querySelector(mobile ? ".header-actions" : ".rail-bottom"));
    };
    find();
    const observer = new MutationObserver(find);
    observer.observe(document.body, { childList: true, subtree: true });
    media.addEventListener("change", find);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", find);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (isDevPreviewMode()) {
        const preferences = await loadAppSettings().catch(() => DEFAULT_APP_SETTINGS);
        if (!cancelled) {
          setSettings(preferences);
          setMember(devPreviewCurrentMember());
          setSettingsLoaded(true);
        }
        return;
      }
      try {
        const [preferences, access] = await Promise.all([
          loadAppSettings(),
          getCurrentAccessIdentity(),
        ]);
        if (cancelled) return;
        setSettings(preferences);
        setSettingsLoaded(true);
        if (!access?.member || access.authorization !== "active") return;

        try {
          const identity = await getCurrentIdentity();
          if (!cancelled) setMember(identity?.member ?? access.member);
        } catch {
          if (!cancelled) setMember(access.member);
        }
      } catch {
        if (!cancelled) setSettingsLoaded(true);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!target || !member || !settingsLoaded || startupApplied.current) return;
    startupApplied.current = true;
    window.requestAnimationFrame(() => {
      navigate(settings.startView);
      syncSound(settings.interfaceSounds);
    });
  }, [target, member, settingsLoaded, settings.startView, settings.interfaceSounds]);

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

  async function toggleTheme() {
    if (themeSaving) return;
    const previous = settings;
    const next: AppSettings = {
      ...settings,
      themeMode: settings.themeMode === "light" ? "dark" : "light",
    };
    setThemeSaving(true);
    setSettings(next);
    try {
      setSettings(await saveAppSettings(next));
    } catch {
      setSettings(previous);
      await saveAppSettings(previous).catch(() => undefined);
    } finally {
      setThemeSaving(false);
    }
  }

  if (!target || !member) return null;

  const lightMode = settings.themeMode === "light";
  const launcher = createPortal(
    <>
      <button
        type="button"
        data-tooltip={lightMode ? "Usar modo escuro" : "Usar modo claro neomórfico"}
        aria-label={lightMode ? "Ativar modo escuro do Labstar" : "Ativar modo claro do Labstar"}
        className={`${mobileLauncher ? "mobile-settings-button" : ""} labstar-theme-toggle ${lightMode ? "active" : ""}`.trim()}
        onClick={() => void toggleTheme()}
        disabled={themeSaving}
      >
        {lightMode ? <Moon size={17} /> : <Sun size={17} />}
      </button>
      <button
        type="button"
        data-tooltip="Configurações"
        aria-label="Configurações do Labstar"
        className={`${mobileLauncher ? "mobile-settings-button" : ""} ${open ? "active" : ""}`.trim()}
        onClick={() => { setFocusedAchievement(null); setOpen((value) => !value); }}
      >
        <Settings size={17} />
      </button>
    </>,
    target,
  );

  return (
    <>
      {launcher}
      {open && createPortal(
        <GlobalSettings
          member={member}
          settings={settings}
          initialTab={focusedAchievement ? "achievements" : undefined}
          initialAchievementKey={focusedAchievement}
          onClose={() => { setOpen(false); setFocusedAchievement(null); }}
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

import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AccessControl } from "./components/AccessControl";
import { AppSessionRecovery } from "./components/AppSessionRecovery";
import { CommandPalette } from "./components/CommandPalette";
import { GlobalSettingsPortal } from "./components/GlobalSettingsPortal";
import { InstallApp } from "./components/InstallApp";
import { LegacyActionBridge } from "./components/LegacyActionBridge";
import { MediaPreferenceBridge } from "./components/MediaPreferenceBridge";
import { MemberPanelTools } from "./components/MemberPanelTools";
import { MemberQuickActions } from "./components/MemberQuickActions";
import { RuntimeReliability } from "./components/RuntimeReliability";
import { SafetyGuards } from "./components/SafetyGuards";
import { SystemDiagnosticsAddon } from "./components/SystemDiagnostics";
import { WorkspaceQuickMenus } from "./components/WorkspaceQuickMenus";
import { WorkspaceSettingsPortal } from "./components/WorkspaceSettingsPortal";
import { applyAppSettings, loadAppSettings } from "./lib/app-settings";
import { prewarmRustBackend } from "./lib/backend-prewarm";
import { initializeNativeBridge } from "./lib/native";
import "./styles.css";
import "./access-control.css";
import "./workspace-polish.css";
import "./direct-messages.css";
import "./direct-messages-v4.css";
import "./direct-messages-v5.css";
import "./workspace-layout-fix.css";
import "./workspace-brand.css";
import "./experience-polish.css";
import "./global-settings.css";
import "./workspace-settings.css";
import "./workspace-permissions.css";
import "./runtime-reliability.css";
import "./member-quick-actions.css";
import "./member-panel-tools.css";
import "./system-diagnostics.css";
import "./workspace-quick-menus.css";
import "./identity-assets-fix.css";
import "./command-palette.css";

const BRAND_INTRO_DURATION_MS = 2350;
const NATIVE_BRIDGE_TIMEOUT_MS = 4000;

function RootSurfaces() {
  const [introFinished, setIntroFinished] = useState(false);

  useEffect(() => {
    void prewarmRustBackend();
    const timer = window.setTimeout(() => setIntroFinished(true), BRAND_INTRO_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      <App />
      <SafetyGuards />
      <LegacyActionBridge />
      <RuntimeReliability />
      <MediaPreferenceBridge />
      <AppSessionRecovery />
      {introFinished && <AccessControl />}
      {introFinished && <GlobalSettingsPortal />}
      {introFinished && <SystemDiagnosticsAddon />}
      {introFinished && <WorkspaceSettingsPortal />}
      {introFinished && <MemberQuickActions />}
      {introFinished && <MemberPanelTools />}
      {introFinished && <WorkspaceQuickMenus />}
      {introFinished && <CommandPalette />}
      {introFinished && <InstallApp />}
    </>
  );
}

function mountReact() {
  const rootElement = document.getElementById("root");
  if (!rootElement) {
    document.body.innerHTML = "<main style='min-height:100vh;display:grid;place-items:center;background:#030407;color:#fff;font:16px system-ui'>Falha ao localizar a raiz da interface do Labstar.</main>";
    return;
  }

  createRoot(rootElement).render(
    <StrictMode>
      <RootSurfaces />
    </StrictMode>,
  );
}

async function initializeRuntime() {
  const nativeTimeout = new Promise<never>((_, reject) => {
    window.setTimeout(() => reject(new Error("native_bridge_timeout")), NATIVE_BRIDGE_TIMEOUT_MS);
  });

  try {
    await Promise.race([initializeNativeBridge(), nativeTimeout]);
    window.sessionStorage.removeItem("labstar-native-boot-warning");
  } catch (error) {
    const message = error instanceof Error ? error.message : "native_bridge_failed";
    window.sessionStorage.setItem("labstar-native-boot-warning", message);
    window.dispatchEvent(new CustomEvent("labstar:native-boot-warning", { detail: message }));
  }

  try {
    applyAppSettings(await loadAppSettings());
  } catch {
    // Preferências inválidas nunca impedem a inicialização do Labstar.
  }
}

// A interface é montada primeiro. Nenhuma chamada Rust, deep link ou leitura de
// preferências pode segurar a primeira pintura do aplicativo desktop.
mountReact();
void initializeRuntime();

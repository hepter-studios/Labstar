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
import { PresenceBridge } from "./components/PresenceBridge";
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
      {introFinished && <PresenceBridge />}
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

async function bootstrap() {
  try {
    await initializeNativeBridge();
  } catch {
    // A tela de acesso exibirá o estado correto caso o callback nativo falhe.
  }

  try {
    applyAppSettings(await loadAppSettings());
  } catch {
    // Preferências inválidas nunca impedem a inicialização do Labstar.
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <RootSurfaces />
    </StrictMode>,
  );
}

void bootstrap();

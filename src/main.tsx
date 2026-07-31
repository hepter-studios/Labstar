import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AccessControl } from "./components/AccessControl";
import { AppSessionRecovery } from "./components/AppSessionRecovery";
import { GlobalSettingsPortal } from "./components/GlobalSettingsPortal";
import { InstallApp } from "./components/InstallApp";
import { MediaPreferenceBridge } from "./components/MediaPreferenceBridge";
import { MemberQuickActions } from "./components/MemberQuickActions";
import { RuntimeReliability } from "./components/RuntimeReliability";
import { SafetyGuards } from "./components/SafetyGuards";
import { WorkspaceSettingsPortal } from "./components/WorkspaceSettingsPortal";
import { applyAppSettings, loadAppSettings } from "./lib/app-settings";
import { prewarmRustBackend } from "./lib/backend-prewarm";
import { initializeNativeBridge } from "./lib/native";
import "./styles.css";
import "./access-control.css";
import "./workspace-polish.css";
import "./direct-messages.css";
import "./direct-messages-v4.css";
import "./workspace-layout-fix.css";
import "./workspace-brand.css";
import "./experience-polish.css";
import "./global-settings.css";
import "./workspace-settings.css";
import "./runtime-reliability.css";
import "./member-quick-actions.css";

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
      <RuntimeReliability />
      <MediaPreferenceBridge />
      <AppSessionRecovery />
      {introFinished && <AccessControl />}
      {introFinished && <GlobalSettingsPortal />}
      {introFinished && <WorkspaceSettingsPortal />}
      {introFinished && <MemberQuickActions />}
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

import {
  Component,
  StrictMode,
  useEffect,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AccessControl } from "./components/AccessControl";
import { AppSessionRecovery } from "./components/AppSessionRecovery";
import { CommandPalette } from "./components/CommandPalette";
import { DashboardWorkSurface } from "./components/DashboardWorkSurface";
import { GlobalSearchBridge } from "./components/GlobalSearchBridge";
import { GlobalSettingsPortal } from "./components/GlobalSettingsPortal";
import { InstallApp } from "./components/InstallApp";
import { LegacyActionBridge } from "./components/LegacyActionBridge";
import { MediaPreferenceBridge } from "./components/MediaPreferenceBridge";
import { MemberPanelTools } from "./components/MemberPanelTools";
import { MemberQuickActions } from "./components/MemberQuickActions";
import { MessageWorkItemBridge } from "./components/MessageWorkItemBridge";
import { RuntimeReliability } from "./components/RuntimeReliability";
import { SafetyGuards } from "./components/SafetyGuards";
import { SystemDiagnosticsAddon } from "./components/SystemDiagnostics";
import { WorkItemsCenter } from "./components/WorkItemsCenter";
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
import "./workspace-intelligence.css";
import "./global-search-v2.css";
import "./work-home.css";
import "./work-surface-nav.css";
import "./work-items-center.css";
import "./dashboard-work-surface.css";
import "./message-work-item.css";

const BRAND_INTRO_DURATION_MS = 2350;
const NATIVE_BRIDGE_TIMEOUT_MS = 4000;

declare global {
  interface Window {
    __LABSTAR_BOOT_GUARD__?: {
      ready(): void;
      fail(title: string, details: string): void;
    };
  }
}

type SurfaceBoundaryProps = {
  name: string;
  critical?: boolean;
  children: ReactNode;
};

type SurfaceBoundaryState = {
  error: Error | null;
};

class SurfaceBoundary extends Component<SurfaceBoundaryProps, SurfaceBoundaryState> {
  state: SurfaceBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): SurfaceBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[Labstar] Falha em ${this.props.name}`, error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (!this.props.critical) return null;

    const details = `${error.message}\n\n${error.stack ?? "Stack indisponível"}`;
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 28, background: "#030407", color: "#f5f7ff", fontFamily: "Inter, system-ui, sans-serif" }}>
        <section style={{ width: "min(680px, 100%)", padding: 28, border: "1px solid rgba(255,255,255,.12)", borderRadius: 18, background: "#090c13", boxShadow: "0 30px 100px #000c" }}>
          <strong style={{ display: "block", marginBottom: 18, fontSize: 20, letterSpacing: ".18em" }}>L★BSTAR</strong>
          <small style={{ color: "#ffb16f", fontWeight: 750, letterSpacing: ".12em" }}>ERRO NA INTERFACE PRINCIPAL</small>
          <h1 style={{ margin: "10px 0 8px", fontSize: 24 }}>O Labstar encontrou um erro ao montar a interface.</h1>
          <p style={{ margin: "0 0 16px", color: "#9da7bd", lineHeight: 1.6 }}>A janela não ficará mais preta. Copie ou fotografe a mensagem abaixo para corrigirmos o ponto exato.</p>
          <pre style={{ maxHeight: 320, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word", padding: 14, borderRadius: 12, background: "#03050a", color: "#d9e1f5", font: "12px/1.55 Consolas, monospace" }}>{details}</pre>
          <button type="button" onClick={() => window.location.reload()} style={{ height: 40, padding: "0 16px", border: 0, borderRadius: 10, background: "#edf2ff", color: "#080b12", fontWeight: 750, cursor: "pointer" }}>Tentar novamente</button>
        </section>
      </main>
    );
  }
}

function BootReadySignal() {
  useEffect(() => {
    window.__LABSTAR_BOOT_GUARD__?.ready();
  }, []);
  return null;
}

function OptionalSurface({ name, children }: { name: string; children: ReactNode }) {
  return <SurfaceBoundary name={name}>{children}</SurfaceBoundary>;
}

function RootSurfaces() {
  const [introFinished, setIntroFinished] = useState(false);

  useEffect(() => {
    void prewarmRustBackend();
    const timer = window.setTimeout(() => setIntroFinished(true), BRAND_INTRO_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      <BootReadySignal />
      <SurfaceBoundary name="interface principal" critical><App /></SurfaceBoundary>
      <OptionalSurface name="proteções de segurança"><SafetyGuards /></OptionalSurface>
      <OptionalSurface name="ponte de ações legadas"><LegacyActionBridge /></OptionalSurface>
      <OptionalSurface name="confiabilidade de runtime"><RuntimeReliability /></OptionalSurface>
      <OptionalSurface name="preferências de mídia"><MediaPreferenceBridge /></OptionalSurface>
      <OptionalSurface name="recuperação de sessão"><AppSessionRecovery /></OptionalSurface>
      {introFinished && <OptionalSurface name="controle de acesso"><AccessControl /></OptionalSurface>}
      {introFinished && <OptionalSurface name="configurações globais"><GlobalSettingsPortal /></OptionalSurface>}
      {introFinished && <OptionalSurface name="diagnóstico do sistema"><SystemDiagnosticsAddon /></OptionalSurface>}
      {introFinished && <OptionalSurface name="configurações do espaço"><WorkspaceSettingsPortal /></OptionalSurface>}
      {introFinished && <OptionalSurface name="ações rápidas de membro"><MemberQuickActions /></OptionalSurface>}
      {introFinished && <OptionalSurface name="ferramentas do painel de membros"><MemberPanelTools /></OptionalSurface>}
      {introFinished && <OptionalSurface name="menus rápidos do espaço"><WorkspaceQuickMenus /></OptionalSurface>}
      {introFinished && <OptionalSurface name="central de comandos"><CommandPalette /></OptionalSurface>}
      {introFinished && <OptionalSurface name="dashboard operacional"><DashboardWorkSurface /></OptionalSurface>}
      {introFinished && <OptionalSurface name="tarefas e decisões"><WorkItemsCenter /></OptionalSurface>}
      {introFinished && <OptionalSurface name="mensagens para trabalho"><MessageWorkItemBridge /></OptionalSurface>}
      {introFinished && <OptionalSurface name="busca global"><GlobalSearchBridge /></OptionalSurface>}
      {introFinished && <OptionalSurface name="instalação web"><InstallApp /></OptionalSurface>}
    </>
  );
}

function mountReact() {
  const rootElement = document.getElementById("root");
  if (!rootElement) {
    document.body.innerHTML = "<main style='min-height:100vh;display:grid;place-items:center;background:#030407;color:#fff;font:16px system-ui'>Falha ao localizar a raiz da interface do Labstar.</main>";
    return;
  }

  try {
    createRoot(rootElement).render(
      <StrictMode>
        <SurfaceBoundary name="raiz React" critical>
          <RootSurfaces />
        </SurfaceBoundary>
      </StrictMode>,
    );
  } catch (error) {
    const details = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
    window.__LABSTAR_BOOT_GUARD__?.fail("Falha ao iniciar o React", details);
  }
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
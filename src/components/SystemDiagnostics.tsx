import { AlertTriangle, CheckCircle2, Copy, LoaderCircle, Play, ShieldCheck, Wifi } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { requireAuthClient } from "../lib/auth-client";
import { isTauriApp, requestNativeBackend } from "../lib/native";

type CheckState = "idle" | "running" | "ok" | "error";
type DiagnosticCheck = { id: string; label: string; state: CheckState; detail: string };
type NativeHealth = {
  status: string;
  appVersion: string;
  platform: string;
  architecture: string;
  buildProfile: string;
  appDataDirectory: string;
  deepLinkScheme: string;
  backendTransport: string;
};

const API_URL = (import.meta.env.VITE_LABSTAR_API_URL ?? "https://labstar-api-mackson.fly.dev").replace(/\/+$/, "");

async function webHealth(path: string) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${API_URL}${path}`, { method: "GET", cache: "no-store", credentials: "omit", signal: controller.signal, headers: { Accept: "application/json" } });
    return { status: response.status, body: await response.json().catch(() => null) as unknown };
  } finally {
    window.clearTimeout(timeout);
  }
}

async function backendHealth(path: string) {
  if (isTauriApp()) return requestNativeBackend({ path, method: "GET" });
  return webHealth(path);
}

async function nativeRuntimeHealth() {
  const tauri = window.__TAURI__;
  if (!tauri?.core?.invoke) return null;
  return tauri.core.invoke<NativeHealth>("native_health");
}

export function SystemDiagnosticsAddon() {
  const [target, setTarget] = useState<Element | null>(null);

  useEffect(() => {
    const find = () => {
      const title = document.querySelector<HTMLElement>(".global-settings-head h2")?.textContent?.trim();
      setTarget(title === "Segurança" ? document.querySelector(".global-settings-content .settings-sections") : null);
    };
    find();
    const observer = new MutationObserver(find);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  if (!target) return null;
  return createPortal(<SystemDiagnostics />, target);
}

function SystemDiagnostics() {
  const [checks, setChecks] = useState<DiagnosticCheck[]>(() => baseChecks());
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);

  const summary = useMemo(() => checks.map((check) => `${check.label}: ${check.state === "ok" ? "OK" : check.state === "error" ? "ERRO" : check.state.toUpperCase()}${check.detail ? ` — ${check.detail}` : ""}`).join("\n"), [checks]);

  function patch(id: string, patchValue: Partial<DiagnosticCheck>) {
    setChecks((current) => current.map((check) => check.id === id ? { ...check, ...patchValue } : check));
  }

  async function run() {
    setRunning(true);
    setChecks(baseChecks().map((check) => ({ ...check, state: "running", detail: "Verificando…" })));

    patch("network", navigator.onLine ? { state: "ok", detail: "Dispositivo reporta conexão disponível" } : { state: "error", detail: "Dispositivo está offline" });

    if (isTauriApp()) {
      try {
        const native = await nativeRuntimeHealth();
        patch("runtime", native?.status === "ok"
          ? {
              state: "ok",
              detail: `Labstar ${native.appVersion} · ${native.platform}-${native.architecture} · ${native.buildProfile} · ${native.backendTransport}`,
            }
          : { state: "error", detail: "O núcleo Tauri não retornou o estado esperado" });
      } catch {
        patch("runtime", { state: "error", detail: "A interface abriu, mas o núcleo Tauri não respondeu ao diagnóstico" });
      }
    } else {
      patch("runtime", { state: "ok", detail: "Web · Cloudflare Pages Preview/produção · backend HTTPS remoto" });
    }

    try {
      const live = await backendHealth("/health/live");
      patch("api", live.status >= 200 && live.status < 300 ? { state: "ok", detail: `API respondeu HTTP ${live.status}` } : { state: "error", detail: `API respondeu HTTP ${live.status}` });
    } catch {
      patch("api", { state: "error", detail: "Não foi possível alcançar a API Rust" });
    }

    try {
      const ready = await backendHealth("/health/ready");
      patch("database", ready.status >= 200 && ready.status < 300 ? { state: "ok", detail: `Banco pronto · HTTP ${ready.status}` } : { state: "error", detail: `Banco/API respondeu HTTP ${ready.status}` });
    } catch {
      patch("database", { state: "error", detail: "A verificação de prontidão não respondeu" });
    }

    try {
      const { data, error } = await requireAuthClient().auth.getSession();
      if (error) patch("session", { state: "error", detail: "Supabase Auth retornou erro de sessão" });
      else if (data.session) patch("session", { state: "ok", detail: "Sessão local presente e gerenciada pelo Auth" });
      else patch("session", { state: "error", detail: "Nenhuma sessão autenticada neste dispositivo" });
    } catch {
      patch("session", { state: "error", detail: "Cliente de autenticação indisponível" });
    }

    setRunning(false);
  }

  async function copy() {
    const header = [`Labstar diagnostics`, `runtime=${isTauriApp() ? "tauri" : "web"}`, `online=${navigator.onLine}`, `time=${new Date().toISOString()}`].join("\n");
    try {
      await navigator.clipboard.writeText(`${header}\n${summary}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="settings-section diagnostics-section">
      <header><strong>Diagnóstico do sistema</strong><p>Testa as camadas essenciais e identifica a versão instalada sem expor tokens, senhas ou chaves.</p></header>
      <div className="settings-section-body">
        <div className="diagnostic-list">{checks.map((check) => <article key={check.id} className={check.state}><span>{check.state === "running" ? <LoaderCircle className="spin" size={15}/> : check.state === "ok" ? <CheckCircle2 size={15}/> : check.state === "error" ? <AlertTriangle size={15}/> : check.id === "network" ? <Wifi size={15}/> : <ShieldCheck size={15}/>}</span><div><strong>{check.label}</strong><small>{check.detail || "Ainda não verificado"}</small></div></article>)}</div>
        <div className="settings-inline-actions"><button type="button" onClick={() => void run()} disabled={running}>{running ? <LoaderCircle className="spin" size={14}/> : <Play size={14}/>} {running ? "Executando diagnóstico" : "Executar diagnóstico"}</button><button type="button" onClick={() => void copy()}><Copy size={14}/> {copied ? "Resumo copiado" : "Copiar resumo seguro"}</button></div>
        {checks.some((check) => check.state === "error") && <p className="diagnostic-warning"><AlertTriangle size={13}/> Um item em erro não significa perda de dados; o resumo ajuda a identificar exatamente qual camada falhou.</p>}
      </div>
    </section>
  );
}

function baseChecks(): DiagnosticCheck[] {
  return [
    { id: "runtime", label: "Versão e núcleo do aplicativo", state: "idle", detail: "" },
    { id: "network", label: "Rede do dispositivo", state: "idle", detail: "" },
    { id: "api", label: "API Rust", state: "idle", detail: "" },
    { id: "database", label: "Banco / prontidão", state: "idle", detail: "" },
    { id: "session", label: "Sessão de identidade", state: "idle", detail: "" },
  ];
}

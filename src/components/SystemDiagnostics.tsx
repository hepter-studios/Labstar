import { AlertTriangle, CheckCircle2, Copy, LoaderCircle, Play, ShieldCheck, Wifi } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { requireAuthClient } from "../lib/auth-client";
import { isTauriApp } from "../lib/native";
import { rustApi, rustPublicApi } from "../lib/rust-api";

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
type RustHealth = {
  status: string;
  service: string;
  runtime: string;
  version: string;
  database: string;
  realtime: string;
};

type RustIdentity = {
  memberId: string;
  status: string;
  role: string;
};

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

  const summary = useMemo(
    () => checks
      .map((check) => `${check.label}: ${check.state === "ok" ? "OK" : check.state === "error" ? "ERRO" : check.state.toUpperCase()}${check.detail ? ` — ${check.detail}` : ""}`)
      .join("\n"),
    [checks],
  );

  function patch(id: string, patchValue: Partial<DiagnosticCheck>) {
    setChecks((current) => current.map((check) => check.id === id ? { ...check, ...patchValue } : check));
  }

  async function run() {
    setRunning(true);
    setChecks(baseChecks().map((check) => ({ ...check, state: "running", detail: "Verificando…" })));

    patch(
      "network",
      navigator.onLine
        ? { state: "ok", detail: "Dispositivo reporta conexão disponível" }
        : { state: "error", detail: "Dispositivo está offline" },
    );

    if (isTauriApp()) {
      try {
        const native = await nativeRuntimeHealth();
        patch(
          "runtime",
          native?.status === "ok"
            ? {
                state: "ok",
                detail: `Labstar ${native.appVersion} · ${native.platform}-${native.architecture} · ${native.buildProfile} · ${native.backendTransport}`,
              }
            : { state: "error", detail: "O núcleo Tauri não retornou o estado esperado" },
        );
      } catch {
        patch("runtime", { state: "error", detail: "A interface abriu, mas o núcleo Tauri não respondeu" });
      }
    } else {
      patch("runtime", { state: "ok", detail: "Web · Cloudflare Pages · backend Rust" });
    }

    try {
      const { data, error } = await requireAuthClient().auth.getSession();
      if (error) {
        patch("session", { state: "error", detail: "Supabase Auth retornou erro de sessão" });
      } else if (data.session) {
        patch("session", { state: "ok", detail: "Sessão OAuth local presente e renovável" });
      } else {
        patch("session", { state: "error", detail: "Nenhuma sessão autenticada neste dispositivo" });
      }
    } catch {
      patch("session", { state: "error", detail: "Cliente de autenticação indisponível" });
    }

    try {
      const health = await rustPublicApi<RustHealth>("/health/ready");
      patch(
        "backend",
        health.status === "ready" && health.runtime === "rust"
          ? { state: "ok", detail: `Rust ${health.version} · PostgreSQL · WebSocket Rust` }
          : { state: "error", detail: "A API respondeu, mas não declarou prontidão" },
      );
    } catch {
      patch("backend", { state: "error", detail: "O backend Rust publicado não respondeu" });
    }

    try {
      const identity = await rustApi<RustIdentity>("/v1/me");
      patch("database", {
        state: "ok",
        detail: `Vínculo validado pelo Rust · ${identity.status} · ${identity.role}`,
      });
    } catch {
      patch("database", { state: "error", detail: "O Rust não confirmou o vínculo com o banco" });
    }

    setRunning(false);
  }

  async function copy() {
    const header = [
      "Labstar diagnostics",
      `runtime=${isTauriApp() ? "tauri" : "web"}`,
      "backend=rust-api",
      `online=${navigator.onLine}`,
      `time=${new Date().toISOString()}`,
    ].join("\n");
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
      <header>
        <strong>Diagnóstico do sistema</strong>
        <p>Testa as camadas essenciais sem expor tokens, senhas ou chaves.</p>
      </header>
      <div className="settings-section-body">
        <div className="diagnostic-list">
          {checks.map((check) => (
            <article key={check.id} className={check.state}>
              <span>
                {check.state === "running"
                  ? <LoaderCircle className="spin" size={15}/>
                  : check.state === "ok"
                    ? <CheckCircle2 size={15}/>
                    : check.state === "error"
                      ? <AlertTriangle size={15}/>
                      : check.id === "network"
                        ? <Wifi size={15}/>
                        : <ShieldCheck size={15}/>}
              </span>
              <div><strong>{check.label}</strong><small>{check.detail || "Ainda não verificado"}</small></div>
            </article>
          ))}
        </div>
        <div className="settings-inline-actions">
          <button type="button" onClick={() => void run()} disabled={running}>
            {running ? <LoaderCircle className="spin" size={14}/> : <Play size={14}/>} {running ? "Executando diagnóstico" : "Executar diagnóstico"}
          </button>
          <button type="button" onClick={() => void copy()}>
            <Copy size={14}/> {copied ? "Resumo copiado" : "Copiar resumo seguro"}
          </button>
        </div>
        {checks.some((check) => check.state === "error") && (
          <p className="diagnostic-warning"><AlertTriangle size={13}/> Um item em erro não significa perda de dados; o resumo identifica a camada afetada.</p>
        )}
      </div>
    </section>
  );
}

function baseChecks(): DiagnosticCheck[] {
  return [
    { id: "runtime", label: "Versão e núcleo do aplicativo", state: "idle", detail: "" },
    { id: "network", label: "Rede do dispositivo", state: "idle", detail: "" },
    { id: "backend", label: "Backend central em Rust", state: "idle", detail: "" },
    { id: "database", label: "PostgreSQL e vínculo do membro", state: "idle", detail: "" },
    { id: "session", label: "Sessão OAuth", state: "idle", detail: "" },
  ];
}

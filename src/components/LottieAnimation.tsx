import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { loadOnboardingLottie, type OnboardingLottieKind } from "../lib/onboarding-lotties";

type LottieEventName = "DOMLoaded" | "data_ready" | "data_failed" | "error";

type LottieInstance = {
  destroy(): void;
  goToAndStop(value: number, isFrame: boolean): void;
  addEventListener?(name: LottieEventName, callback: (event?: unknown) => void): void;
};

type LottieRuntime = {
  loadAnimation(options: {
    container: Element;
    renderer: "svg";
    loop: boolean;
    autoplay: boolean;
    animationData: Record<string, unknown>;
    rendererSettings?: { preserveAspectRatio?: string };
  }): LottieInstance;
};

declare global {
  interface Window {
    lottie?: LottieRuntime;
  }
}

const RUNTIME_URLS = [
  "/api/runtime/lottie?v=5.12.2-labstar-3",
  "https://cdnjs.cloudflare.com/ajax/libs/bodymovin/5.12.2/lottie.min.js",
  "https://cdn.jsdelivr.net/npm/lottie-web@5.12.2/build/player/lottie.min.js",
  "https://unpkg.com/lottie-web@5.12.2/build/player/lottie.min.js",
] as const;

let runtimePromise: Promise<LottieRuntime> | null = null;

function loadScript(url: string) {
  return new Promise<LottieRuntime>((resolve, reject) => {
    if (window.lottie) {
      resolve(window.lottie);
      return;
    }

    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.dataset.labstarLottie = "true";
    script.dataset.source = url;

    const cleanup = () => {
      script.removeEventListener("load", loaded);
      script.removeEventListener("error", failed);
    };

    const loaded = () => {
      cleanup();
      if (window.lottie) {
        resolve(window.lottie);
        return;
      }
      script.remove();
      reject(new Error(`lottie_runtime_missing:${url}`));
    };

    const failed = () => {
      cleanup();
      script.remove();
      reject(new Error(`lottie_runtime_failed:${url}`));
    };

    script.addEventListener("load", loaded, { once: true });
    script.addEventListener("error", failed, { once: true });
    document.head.appendChild(script);
  });
}

async function loadRuntime() {
  if (window.lottie) return window.lottie;
  if (runtimePromise) return runtimePromise;

  runtimePromise = (async () => {
    let lastError: unknown = new Error("lottie_runtime_unavailable");

    for (const url of RUNTIME_URLS) {
      try {
        return await loadScript(url);
      } catch (cause) {
        lastError = cause;
        console.warn(`[Labstar] Player Lottie indisponível em ${url}; tentando próxima origem.`, cause);
      }
    }

    throw lastError;
  })().catch((error) => {
    runtimePromise = null;
    throw error;
  });

  return runtimePromise;
}

type DiagnosticState = "loading" | "player-created" | "playing" | "failed";

type DiagnosticInfo = {
  width?: number;
  height?: number;
  fps?: number;
  firstFrame?: number;
  lastFrame?: number;
  runtimeSource?: string;
  error?: string;
};

function numeric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function LottieAnimation({
  kind,
  className = "",
  loop = true,
  preserveAspectRatio = "xMidYMid slice",
}: {
  kind: OnboardingLottieKind;
  className?: string;
  loop?: boolean;
  preserveAspectRatio?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [diagnosticState, setDiagnosticState] = useState<DiagnosticState>("loading");
  const [diagnosticInfo, setDiagnosticInfo] = useState<DiagnosticInfo>({});
  const diagnosticMode = kind === "stars" && new URLSearchParams(window.location.search).has("lottie-test");

  useEffect(() => {
    const container = ref.current;
    if (!container) return undefined;

    let disposed = false;
    let instance: LottieInstance | null = null;
    setFailed(false);
    if (diagnosticMode) {
      setDiagnosticState("loading");
      setDiagnosticInfo({});
    }

    void Promise.all([loadRuntime(), loadOnboardingLottie(kind)])
      .then(([runtime, animationData]) => {
        if (disposed || !ref.current) return;

        const runtimeSource = document.querySelector<HTMLScriptElement>("script[data-labstar-lottie]")?.dataset.source
          ?? (window.lottie ? "window.lottie" : "unknown");

        if (diagnosticMode) {
          setDiagnosticInfo({
            width: numeric(animationData.w),
            height: numeric(animationData.h),
            fps: numeric(animationData.fr),
            firstFrame: numeric(animationData.ip),
            lastFrame: numeric(animationData.op),
            runtimeSource,
          });
        }

        ref.current.replaceChildren();
        instance = runtime.loadAnimation({
          container: ref.current,
          renderer: "svg",
          loop,
          autoplay: true,
          animationData,
          rendererSettings: { preserveAspectRatio },
        });

        if (diagnosticMode) {
          setDiagnosticState("player-created");
          const markPlaying = () => {
            if (!disposed) setDiagnosticState("playing");
          };
          const markAnimationFailure = (event?: unknown) => {
            if (disposed) return;
            const details = event instanceof Error ? event.message : String(event ?? "lottie_animation_error");
            setFailed(true);
            setDiagnosticState("failed");
            setDiagnosticInfo((current) => ({ ...current, error: details }));
          };
          instance.addEventListener?.("DOMLoaded", markPlaying);
          instance.addEventListener?.("data_ready", markPlaying);
          instance.addEventListener?.("data_failed", markAnimationFailure);
          instance.addEventListener?.("error", markAnimationFailure);
          window.setTimeout(() => {
            if (!disposed && ref.current?.querySelector("svg")) setDiagnosticState("playing");
          }, 700);
        }

        if (!diagnosticMode && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          instance.goToAndStop(0, true);
        }
      })
      .catch((cause) => {
        console.error(`[Labstar] Falha ao renderizar Lottie ${kind}`, cause);
        if (!disposed) {
          setFailed(true);
          if (diagnosticMode) {
            const details = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
            setDiagnosticState("failed");
            setDiagnosticInfo((current) => ({ ...current, error: details }));
          }
        }
      });

    return () => {
      disposed = true;
      instance?.destroy();
      container.replaceChildren();
    };
  }, [diagnosticMode, kind, loop, preserveAspectRatio]);

  if (diagnosticMode) {
    const statusLabel = diagnosticState === "loading"
      ? "CARREGANDO JSON + PLAYER"
      : diagnosticState === "player-created"
        ? "PLAYER CRIADO"
        : diagnosticState === "playing"
          ? "RODANDO"
          : "FALHOU";

    const duration = diagnosticInfo.fps && diagnosticInfo.lastFrame !== undefined && diagnosticInfo.firstFrame !== undefined
      ? ((diagnosticInfo.lastFrame - diagnosticInfo.firstFrame) / diagnosticInfo.fps).toFixed(1)
      : null;

    return createPortal(
      <main style={{ position: "fixed", inset: 0, zIndex: 2147483647, overflow: "hidden", background: "#000" }}>
        <style>{`.lottie-diagnostic-animation>svg,.lottie-diagnostic-animation>canvas{display:block;width:100%!important;height:100%!important}`}</style>
        <div
          ref={ref}
          className={`labstar-lottie lottie-diagnostic-animation ${failed ? "failed" : ""}`.trim()}
          aria-label="Teste isolado do Stars.json"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: failed ? 0.18 : 1 }}
        />
        <aside style={{ position: "fixed", top: 18, left: 18, zIndex: 2, width: "min(430px, calc(100vw - 36px))", padding: "14px 16px", border: "1px solid rgba(255,255,255,.18)", borderRadius: 12, background: "rgba(3,6,12,.86)", color: "#f4f7ff", boxShadow: "0 18px 60px rgba(0,0,0,.55)", backdropFilter: "blur(14px)", font: "12px/1.5 Inter,system-ui,sans-serif" }}>
          <strong style={{ display: "block", marginBottom: 7, letterSpacing: ".12em" }}>TESTE ISOLADO · STARS.JSON</strong>
          <div style={{ marginBottom: 8, color: diagnosticState === "failed" ? "#ff9b9b" : diagnosticState === "playing" ? "#9fffc1" : "#ffd98a", fontWeight: 800 }}>{statusLabel}</div>
          <div style={{ color: "#aab5c8" }}>
            {diagnosticInfo.width && diagnosticInfo.height ? `${diagnosticInfo.width}×${diagnosticInfo.height}` : "dimensões: aguardando"}
            {diagnosticInfo.fps ? ` · ${diagnosticInfo.fps} fps` : ""}
            {duration ? ` · ${duration}s` : ""}
          </div>
          {diagnosticInfo.runtimeSource && <div style={{ marginTop: 4, color: "#76849d", wordBreak: "break-all" }}>player: {diagnosticInfo.runtimeSource}</div>}
          {diagnosticInfo.error && <pre style={{ margin: "9px 0 0", padding: 9, maxHeight: 150, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word", borderRadius: 8, background: "#19080a", color: "#ffb5b5", font: "11px/1.45 Consolas,monospace" }}>{diagnosticInfo.error}</pre>}
          <small style={{ display: "block", marginTop: 9, color: "#617087" }}>Este modo não usa o céu CSS, o card de organização nem o foguete. É somente o payload Stars + lottie-web.</small>
        </aside>
      </main>,
      document.body,
    );
  }

  return <div ref={ref} className={`labstar-lottie ${failed ? "failed" : ""} ${className}`.trim()} aria-hidden="true" />;
}

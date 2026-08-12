import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import lottie, { type AnimationItem } from "lottie-web";
import { loadOnboardingLottie, type OnboardingLottieKind } from "../lib/onboarding-lotties";
import "../lottie-runtime.css";

type DiagnosticState = "loading" | "player-created" | "playing" | "failed";

type DiagnosticInfo = {
  width?: number;
  height?: number;
  fps?: number;
  firstFrame?: number;
  lastFrame?: number;
  error?: string;
};

function numeric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function LottieAnimation({
  kind,
  className = "",
  loop = true,
  speed = 1,
  preserveAspectRatio = "xMidYMid slice",
  posterFrame,
  playbackSegment,
}: {
  kind: OnboardingLottieKind;
  className?: string;
  loop?: boolean;
  speed?: number;
  preserveAspectRatio?: string;
  posterFrame?: number;
  playbackSegment?: readonly [startFrame: number, endFrame: number];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [diagnosticState, setDiagnosticState] = useState<DiagnosticState>("loading");
  const [diagnosticInfo, setDiagnosticInfo] = useState<DiagnosticInfo>({});
  const diagnosticMode = kind === "stars" && new URLSearchParams(window.location.search).has("lottie-test");
  const playbackStartFrame = playbackSegment?.[0];
  const playbackEndFrame = playbackSegment?.[1];

  useEffect(() => {
    const container = ref.current;
    if (!container) return undefined;

    let disposed = false;
    let instance: AnimationItem | null = null;
    let readyTimer = 0;
    let posterSettled = false;
    const posterTimers: number[] = [];

    setFailed(false);
    setReady(false);
    if (diagnosticMode) {
      setDiagnosticState("loading");
      setDiagnosticInfo({});
    }

    void loadOnboardingLottie(kind)
      .then((sourceData) => {
        if (disposed || !ref.current) return;
        const animationData = structuredClone(sourceData);
        const expectedLayerCount = Array.isArray(animationData.layers) ? animationData.layers.length : 0;

        if (diagnosticMode) {
          setDiagnosticInfo({
            width: numeric(animationData.w),
            height: numeric(animationData.h),
            fps: numeric(animationData.fr),
            firstFrame: numeric(animationData.ip),
            lastFrame: numeric(animationData.op),
          });
        }

        ref.current.replaceChildren();
        instance = lottie.loadAnimation({
          container: ref.current,
          renderer: "svg",
          loop: posterFrame === undefined ? loop : false,
          autoplay: posterFrame === undefined,
          animationData: animationData as never,
          rendererSettings: {
            preserveAspectRatio,
            progressiveLoad: false,
            hideOnTransparent: true,
          },
        });
        instance.setSpeed(speed);

        if (diagnosticMode) setDiagnosticState("player-created");

        const pinPosterFrame = () => {
          if (disposed || posterFrame === undefined) return;
          instance?.goToAndStop(posterFrame, true);
        };

        const playConfiguredSegment = () => {
          if (
            disposed
            || posterFrame !== undefined
            || playbackStartFrame === undefined
            || playbackEndFrame === undefined
          ) return;
          instance?.playSegments([playbackStartFrame, playbackEndFrame], true);
        };

        const markReady = () => {
          if (disposed) return;
          setReady(true);
          if (diagnosticMode) setDiagnosticState("playing");
        };

        const settlePosterFrame = () => {
          pinPosterFrame();
          markReady();
          if (posterFrame === undefined || posterSettled) return;
          posterSettled = true;
          for (const delay of [120, 400, 900, 1800]) {
            posterTimers.push(window.setTimeout(pinPosterFrame, delay));
          }
        };

        const markFailure = (event?: unknown) => {
          if (disposed) return;
          const details = event instanceof Error ? event.message : String(event ?? "lottie_animation_error");
          console.error(`[Labstar] Falha interna no Lottie ${kind}`, event);
          setFailed(true);
          setReady(false);
          if (diagnosticMode) {
            setDiagnosticState("failed");
            setDiagnosticInfo((current) => ({ ...current, error: details }));
          }
        };

        instance.addEventListener("DOMLoaded", () => {
          playConfiguredSegment();
          settlePosterFrame();
        });
        instance.addEventListener("loaded_images", settlePosterFrame);
        instance.addEventListener("data_ready", () => {
          if (posterFrame === undefined) {
            playConfiguredSegment();
            markReady();
          }
        });
        instance.addEventListener("data_failed", markFailure);
        instance.addEventListener("error", markFailure);

        readyTimer = window.setTimeout(() => {
          if (disposed) return;
          const svgRoot = ref.current?.querySelector("svg > g");
          if (!svgRoot) return;
          if (posterFrame === undefined) {
            markReady();
            return;
          }
          if (expectedLayerCount === 0 || svgRoot.children.length >= expectedLayerCount) settlePosterFrame();
        }, 700);
      })
      .catch((cause) => {
        console.error(`[Labstar] Falha ao preparar Lottie ${kind}`, cause);
        if (disposed) return;
        setFailed(true);
        setReady(false);
        if (diagnosticMode) {
          const details = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
          setDiagnosticState("failed");
          setDiagnosticInfo((current) => ({ ...current, error: details }));
        }
      });

    return () => {
      disposed = true;
      window.clearTimeout(readyTimer);
      for (const timer of posterTimers) window.clearTimeout(timer);
      instance?.destroy();
      container.replaceChildren();
    };
  }, [diagnosticMode, kind, loop, playbackEndFrame, playbackStartFrame, posterFrame, preserveAspectRatio, speed]);

  if (diagnosticMode) {
    const statusLabel = diagnosticState === "loading"
      ? "CARREGANDO JSON"
      : diagnosticState === "player-created"
        ? "PLAYER LOCAL CRIADO"
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
          className={`labstar-lottie lottie-diagnostic-animation ${failed ? "failed" : ""} ${ready ? "ready" : ""}`.trim()}
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
          <div style={{ marginTop: 4, color: "#76849d" }}>player: lottie-web 5.12.2 · bundle local</div>
          {diagnosticInfo.error && <pre style={{ margin: "9px 0 0", padding: 9, maxHeight: 150, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word", borderRadius: 8, background: "#19080a", color: "#ffb5b5", font: "11px/1.45 Consolas,monospace" }}>{diagnosticInfo.error}</pre>}
        </aside>
      </main>,
      document.body,
    );
  }

  return <div ref={ref} className={`labstar-lottie ${failed ? "failed" : ""} ${ready ? "ready" : ""} ${className}`.trim()} aria-hidden="true" />;
}

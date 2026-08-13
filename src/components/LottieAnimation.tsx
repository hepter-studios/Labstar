import { useEffect, useRef, useState } from "react";
import lottie, { type AnimationItem } from "lottie-web";
import { loadOnboardingLottie, type OnboardingLottieKind } from "../lib/onboarding-lotties";
import "../lottie-runtime.css";

export function LottieAnimation({
  kind,
  className = "",
  loop = true,
  speed = 1,
  preserveAspectRatio = "xMidYMid slice",
  posterFrame,
  textReplacement,
}: {
  kind: OnboardingLottieKind;
  className?: string;
  loop?: boolean;
  speed?: number;
  preserveAspectRatio?: string;
  posterFrame?: number;
  textReplacement?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

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

    void loadOnboardingLottie(kind)
      .then((sourceData) => {
        if (disposed || !ref.current) return;
        const animationData = structuredClone(sourceData);
        if (textReplacement) {
          const layers = Array.isArray(animationData.layers) ? animationData.layers : [];
          for (const layer of layers) {
            if (!layer || typeof layer !== "object" || (layer as { ty?: unknown }).ty !== 5) continue;
            const textFrames = (layer as { t?: { d?: { k?: unknown } } }).t?.d?.k;
            if (!Array.isArray(textFrames)) continue;
            for (const frame of textFrames) {
              const style = (frame as { s?: Record<string, unknown> })?.s;
              if (!style) continue;
              style.t = textReplacement;
              style.f = "Inter";
              style.s = 154;
              style.lh = 180;
            }
          }
          animationData.fonts = { list: [{ fName: "Inter", fFamily: "Inter", fStyle: "Bold", ascent: 75 }] };
          delete animationData.chars;
        }
        const expectedLayerCount = Array.isArray(animationData.layers) ? animationData.layers.length : 0;

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

        const pinPosterFrame = () => {
          if (disposed || posterFrame === undefined) return;
          instance?.goToAndStop(posterFrame, true);
        };

        const markReady = () => {
          if (disposed) return;
          setReady(true);
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
          console.error(`[Labstar] Falha interna no Lottie ${kind}`, event);
          setFailed(true);
          setReady(false);
        };

        instance.addEventListener("DOMLoaded", () => {
          settlePosterFrame();
        });
        instance.addEventListener("loaded_images", settlePosterFrame);
        instance.addEventListener("data_ready", () => {
          if (posterFrame === undefined) {
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
      });

    return () => {
      disposed = true;
      window.clearTimeout(readyTimer);
      for (const timer of posterTimers) window.clearTimeout(timer);
      instance?.destroy();
      container.replaceChildren();
    };
  }, [kind, loop, posterFrame, preserveAspectRatio, speed, textReplacement]);

  return <div ref={ref} className={`labstar-lottie ${failed ? "failed" : ""} ${ready ? "ready" : ""} ${className}`.trim()} aria-hidden="true" />;
}

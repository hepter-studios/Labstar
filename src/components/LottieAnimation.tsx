import { useEffect, useRef, useState } from "react";
import { loadOnboardingLottie, type OnboardingLottieKind } from "../lib/onboarding-lotties";

type LottieInstance = {
  destroy(): void;
  goToAndStop(value: number, isFrame: boolean): void;
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

const RUNTIME_URL = "https://cdnjs.cloudflare.com/ajax/libs/bodymovin/5.12.2/lottie.min.js";
let runtimePromise: Promise<LottieRuntime> | null = null;

function loadRuntime() {
  if (window.lottie) return Promise.resolve(window.lottie);
  if (runtimePromise) return runtimePromise;

  runtimePromise = new Promise<LottieRuntime>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-labstar-lottie]");
    const script = existing ?? document.createElement("script");

    const finish = () => {
      if (window.lottie) resolve(window.lottie);
      else reject(new Error("lottie_runtime_missing"));
    };

    if (existing) {
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener("error", () => reject(new Error("lottie_runtime_failed")), { once: true });
      window.setTimeout(() => window.lottie && resolve(window.lottie), 0);
      return;
    }

    script.src = RUNTIME_URL;
    script.async = true;
    script.dataset.labstarLottie = "true";
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", () => reject(new Error("lottie_runtime_failed")), { once: true });
    document.head.appendChild(script);
  });

  return runtimePromise;
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

  useEffect(() => {
    const container = ref.current;
    if (!container) return undefined;

    let disposed = false;
    let instance: LottieInstance | null = null;

    void Promise.all([loadRuntime(), loadOnboardingLottie(kind)])
      .then(([runtime, animationData]) => {
        if (disposed || !ref.current) return;
        instance = runtime.loadAnimation({
          container: ref.current,
          renderer: "svg",
          loop,
          autoplay: true,
          animationData,
          rendererSettings: { preserveAspectRatio },
        });

        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          instance.goToAndStop(0, true);
        }
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });

    return () => {
      disposed = true;
      instance?.destroy();
      container.replaceChildren();
    };
  }, [kind, loop, preserveAspectRatio]);

  return <div ref={ref} className={`labstar-lottie ${failed ? "failed" : ""} ${className}`.trim()} aria-hidden="true" />;
}

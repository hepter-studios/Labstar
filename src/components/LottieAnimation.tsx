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
    setFailed(false);

    void Promise.all([loadRuntime(), loadOnboardingLottie(kind)])
      .then(([runtime, animationData]) => {
        if (disposed || !ref.current) return;
        ref.current.replaceChildren();
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
      .catch((cause) => {
        console.error(`[Labstar] Falha ao renderizar Lottie ${kind}`, cause);
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

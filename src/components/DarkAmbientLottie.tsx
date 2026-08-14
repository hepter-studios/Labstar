import { useEffect, useState } from "react";
import type { OnboardingLottieKind } from "../lib/onboarding-lotties";
import { LottieAnimation } from "./LottieAnimation";

function readVisualState() {
  const root = document.documentElement;
  return {
    dark: root.dataset.labstarTheme === "dark",
    reduced: root.dataset.labstarMotion === "reduced" || window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  };
}

export function DarkAmbientLottie({
  kind,
  posterFrame,
  className = "",
}: {
  kind: OnboardingLottieKind;
  posterFrame: number;
  className?: string;
}) {
  const [visual, setVisual] = useState(readVisualState);

  useEffect(() => {
    const update = () => setVisual(readVisualState());
    const observer = new MutationObserver(update);
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-labstar-theme", "data-labstar-motion"],
    });
    media.addEventListener("change", update);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", update);
    };
  }, []);

  if (!visual.dark) return null;

  return (
    <LottieAnimation
      kind={kind}
      className={`dark-ambient-lottie ${className}`.trim()}
      loop={!visual.reduced}
      posterFrame={visual.reduced ? posterFrame : undefined}
      preserveAspectRatio="xMidYMid meet"
    />
  );
}

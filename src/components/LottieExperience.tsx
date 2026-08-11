import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LottieAnimation } from "./LottieAnimation";
import type { OnboardingLottieKind } from "../lib/onboarding-lotties";
import "../lottie-experience.css";

export type MascotCelebrationVariant = "happy" | "special" | "achievement" | "victory" | "retry" | "focus" | "consultation";

export type MascotCelebrationDetail = {
  variant?: MascotCelebrationVariant;
  title?: string;
  message?: string;
  force?: boolean;
};

const MASCOT_EVENT = "labstar:mascot-celebrate";
const MASCOT_COOLDOWN_MS = 45_000;
let lastMascotCelebrationAt = 0;

const MASCOT_VARIANTS: Record<MascotCelebrationVariant, { kind: OnboardingLottieKind; title: string }> = {
  happy: { kind: "happy-spaceman", title: "Órbita atualizada" },
  special: { kind: "astronaut-illustration", title: "Missão especial" },
  achievement: { kind: "star-in-hand", title: "Nova conquista" },
  victory: { kind: "victory-sign", title: "Missão concluída" },
  retry: { kind: "crying-astronaut", title: "Algo saiu da rota" },
  focus: { kind: "space-boy-developer", title: "Modo foco" },
  consultation: { kind: "free-consultation", title: "Tripulação reunida" },
};

export function celebrateWithMascot(detail: MascotCelebrationDetail = {}) {
  const now = Date.now();
  if (!detail.force && now - lastMascotCelebrationAt < MASCOT_COOLDOWN_MS) return;
  lastMascotCelebrationAt = now;
  window.dispatchEvent(new CustomEvent<MascotCelebrationDetail>(MASCOT_EVENT, { detail }));
}

export function ProjectLottieExperience({ projectLoadToken }: { projectLoadToken: number }) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (projectLoadToken <= 0) return undefined;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    setVisible(false);
    const frame = window.requestAnimationFrame(() => setVisible(true));
    timerRef.current = window.setTimeout(() => setVisible(false), 1_450);
    return () => {
      window.cancelAnimationFrame(frame);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [projectLoadToken]);

  if (!visible) return null;
  return (
    <section className="lottie-project-loading" aria-label="Carregando Projetos" aria-live="polite" aria-busy="true">
      <LottieAnimation kind="planet" className="lottie-project-planet" speed={1.8} />
      <span>Carregando Projetos</span>
    </section>
  );
}

export function LabstarAccessLoader({ message }: { message: string }) {
  return (
    <main className="access-screen labstar-access-loader" aria-label={message} aria-live="polite" aria-busy="true">
      <LottieAnimation kind="astronaut-illustration" className="labstar-access-loader-animation" preserveAspectRatio="xMidYMid meet" />
      <span>{message}</span>
    </main>
  );
}

export function MascotCelebrationHost() {
  const [celebration, setCelebration] = useState<(MascotCelebrationDetail & { key: number }) | null>(null);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const requestedVariant = new URLSearchParams(window.location.search).get("mascot-preview") as MascotCelebrationVariant | null;
    if (!requestedVariant || !Object.prototype.hasOwnProperty.call(MASCOT_VARIANTS, requestedVariant)) return;
    setCelebration({ variant: requestedVariant, key: Date.now(), title: MASCOT_VARIANTS[requestedVariant].title, message: "Prévia local do mascote" });
  }, []);

  useEffect(() => {
    const celebrate = (event: Event) => {
      const detail = (event as CustomEvent<MascotCelebrationDetail>).detail ?? {};
      setCelebration({ ...detail, key: Date.now() });
    };
    window.addEventListener(MASCOT_EVENT, celebrate);
    return () => window.removeEventListener(MASCOT_EVENT, celebrate);
  }, []);

  useEffect(() => {
    if (!celebration) return undefined;
    const timer = window.setTimeout(() => setCelebration(null), 6_500);
    return () => window.clearTimeout(timer);
  }, [celebration]);

  if (!celebration) return null;
  const variant = celebration.variant ?? "happy";
  const mascot = MASCOT_VARIANTS[variant];
  return (
    <aside className={`lottie-mascot-celebration ${variant}`} aria-live="polite">
      <button type="button" onClick={() => setCelebration(null)} aria-label="Dispensar mascote"><X size={14} /></button>
      <LottieAnimation key={celebration.key} kind={mascot.kind} className="lottie-mascot-animation" preserveAspectRatio="xMidYMid meet" />
      <span className="lottie-mascot-message">
        <strong>{celebration.title || mascot.title}</strong>
        {celebration.message && <small>{celebration.message}</small>}
      </span>
    </aside>
  );
}

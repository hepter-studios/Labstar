import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ACHIEVEMENTS_REFRESH_EVENT, ACHIEVEMENT_CATALOG, syncOwnAchievements, type AchievementKey } from "../lib/achievements";
import { LottieAnimation } from "./LottieAnimation";
import type { OnboardingLottieKind } from "../lib/onboarding-lotties";
import "../lottie-experience.css";

export type MascotCelebrationVariant = "happy" | "special" | "achievement" | "victory" | "retry" | "focus" | "consultation";

export type MascotCelebrationDetail = {
  variant?: MascotCelebrationVariant;
  title?: string;
  message?: string;
  kind?: OnboardingLottieKind;
  achievementKey?: AchievementKey;
  force?: boolean;
};

const MASCOT_EVENT = "labstar:mascot-celebrate";
const MASCOT_COOLDOWN_MS = 45_000;
const MAP_AMBIENT_ROTATION_MS = 16_000;
let lastMascotCelebrationAt = 0;

type MapAmbientScene = "diagonal" | "planet-large" | "planet-small" | "floating";

const MAP_AMBIENT_LOTTIES: ReadonlyArray<{ kind: OnboardingLottieKind; scene: MapAmbientScene; speed?: number }> = [
  { kind: "astronaut-illustration", scene: "diagonal", speed: .92 },
  { kind: "astronaut-orbit", scene: "planet-large", speed: .8 },
  { kind: "happy-spaceman", scene: "floating", speed: .78 },
  { kind: "astronaut-cosmos", scene: "diagonal", speed: .72 },
  { kind: "astronaut-solo", scene: "planet-small", speed: .8 },
  { kind: "star-in-hand", scene: "floating", speed: .74 },
  { kind: "victory-sign", scene: "planet-large", speed: .76 },
  { kind: "astronaut-flow", scene: "diagonal", speed: .72 },
  { kind: "space-boy-developer", scene: "floating", speed: .7 },
  { kind: "cute-astronaut-mug", scene: "planet-small", speed: .76 },
  { kind: "astronaut-coffee", scene: "floating", speed: .72 },
  { kind: "catch-the-fish", scene: "diagonal", speed: .68 },
  { kind: "free-consultation", scene: "planet-large", speed: .72 },
  { kind: "crying-astronaut", scene: "floating", speed: .72 },
  { kind: "astronaut-headphones", scene: "planet-small", speed: .74 },
];

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
    <section className="lottie-project-loading" aria-label="Abrindo Projetos" aria-live="polite" aria-busy="true">
      <LottieAnimation kind="planet" className="lottie-project-planet" speed={1.8} />
    </section>
  );
}

export function LabstarAccessLoader() {
  return (
    <main className="access-screen labstar-access-loader" aria-label="Carregando Labstar" aria-live="polite" aria-busy="true">
      <LottieAnimation kind="rocket" className="labstar-access-loader-animation" preserveAspectRatio="xMidYMid meet" />
    </main>
  );
}

function readMapAmbientState() {
  const root = document.documentElement;
  return root.dataset.labstarMotion !== "reduced"
    && !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    && window.matchMedia("(min-width: 701px)").matches;
}

export function MapAmbientFlybys() {
  const [enabled, setEnabled] = useState(readMapAmbientState);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const update = () => setEnabled(readMapAmbientState());
    const root = document.documentElement;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const desktop = window.matchMedia("(min-width: 701px)");
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ["data-labstar-motion"] });
    reduced.addEventListener("change", update);
    desktop.addEventListener("change", update);
    return () => {
      observer.disconnect();
      reduced.removeEventListener("change", update);
      desktop.removeEventListener("change", update);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    const advance = () => {
      if (!document.hidden) setActiveIndex((current) => (current + 1) % MAP_AMBIENT_LOTTIES.length);
    };
    const timer = window.setInterval(advance, MAP_AMBIENT_ROTATION_MS);
    return () => window.clearInterval(timer);
  }, [enabled]);

  if (!enabled) return null;
  const ambient = MAP_AMBIENT_LOTTIES[activeIndex];

  return (
    <div className="map-ambient-flybys" aria-hidden="true">
      <LottieAnimation
        key={`${ambient.kind}-${activeIndex}`}
        kind={ambient.kind}
        className={`map-ambient-flyby map-ambient-${ambient.scene} map-ambient-${ambient.kind}`}
        preserveAspectRatio="xMidYMid meet"
        speed={ambient.speed ?? .75}
      />
    </div>
  );
}

export function SoundToggleLottie({ token }: { token: number }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (token <= 0) return undefined;
    setVisible(false);
    const frame = window.requestAnimationFrame(() => setVisible(true));
    const timer = window.setTimeout(() => setVisible(false), 2_650);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [token]);

  if (!visible) return null;
  const reduced = document.documentElement.dataset.labstarMotion === "reduced"
    || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return (
    <div className="sound-toggle-lottie" aria-hidden="true">
      <LottieAnimation
        key={token}
        kind="astronaut-headphones"
        className="sound-toggle-lottie-animation"
        loop={!reduced}
        posterFrame={reduced ? 48 : undefined}
        preserveAspectRatio="xMidYMid meet"
      />
    </div>
  );
}

export function MascotCelebrationHost({ memberId }: { memberId?: string }) {
  const [celebration, setCelebration] = useState<(MascotCelebrationDetail & { key: number }) | null>(null);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const searchParams = new URLSearchParams(window.location.search);
    const requestedVariant = searchParams.get("mascot-preview") as MascotCelebrationVariant | null;
    if (!requestedVariant || !Object.prototype.hasOwnProperty.call(MASCOT_VARIANTS, requestedVariant)) return;
    const requestedKind = requestedVariant === "achievement" && searchParams.get("achievement-kind") === "astronaut-flow"
      ? "astronaut-flow"
      : undefined;
    const previewAchievement = requestedKind ? ACHIEVEMENT_CATALOG.find((achievement) => achievement.key === "engineering_master") : undefined;
    setCelebration({
      variant: requestedVariant,
      kind: requestedKind,
      key: Date.now(),
      title: previewAchievement?.title ?? MASCOT_VARIANTS[requestedVariant].title,
      message: previewAchievement?.description ?? "Prévia local do mascote",
      achievementKey: previewAchievement?.key,
    });
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
    if (!memberId) return undefined;
    let disposed = false;
    let synchronizing = false;
    let pendingAnnouncement = false;

    const synchronize = async (announce = false) => {
      if (synchronizing) {
        pendingAnnouncement ||= announce;
        return;
      }
      synchronizing = true;
      try {
        const progress = await syncOwnAchievements();
        if (disposed) return;
        const unlocked = progress.filter((item) => item.unlockedAt);
        const storageKey = `labstar-achievements-seen-v1:${memberId}`;
        let seen = new Set<string>();
        try {
          const saved = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
          if (Array.isArray(saved)) seen = new Set(saved.filter((value): value is string => typeof value === "string"));
        } catch {
          seen = new Set();
        }
        const newlyUnlocked = announce ? unlocked.find((item) => !seen.has(item.key)) : undefined;
        unlocked.forEach((item) => seen.add(item.key));
        try {
          localStorage.setItem(storageKey, JSON.stringify([...seen]));
        } catch {
          // A celebração continua funcionando mesmo quando o navegador bloqueia o armazenamento local.
        }
        if (!newlyUnlocked) return;
        const achievement = ACHIEVEMENT_CATALOG.find((item) => item.key === newlyUnlocked.key);
        if (!achievement) return;
        celebrateWithMascot({
          variant: "achievement",
          title: achievement.title,
          message: achievement.description,
          kind: "celebrationKind" in achievement ? achievement.celebrationKind : achievement.kind,
          achievementKey: achievement.key,
          force: true,
        });
      } catch {
        // A sincronização manual em Configurações continua mostrando qualquer erro ao usuário.
      } finally {
        synchronizing = false;
        if (!disposed && pendingAnnouncement) {
          pendingAnnouncement = false;
          void synchronize(true);
        }
      }
    };

    const refresh = () => void synchronize(true);
    const resyncWithoutAnnouncement = () => void synchronize(false);
    void synchronize(false);
    window.addEventListener(ACHIEVEMENTS_REFRESH_EVENT, refresh);
    window.addEventListener("focus", resyncWithoutAnnouncement);
    return () => {
      disposed = true;
      window.removeEventListener(ACHIEVEMENTS_REFRESH_EVENT, refresh);
      window.removeEventListener("focus", resyncWithoutAnnouncement);
    };
  }, [memberId]);

  useEffect(() => {
    if (!celebration) return undefined;
    const timer = window.setTimeout(() => setCelebration(null), celebration.variant === "achievement" ? 5_000 : 6_500);
    return () => window.clearTimeout(timer);
  }, [celebration]);

  if (!celebration) return null;
  const variant = celebration.variant ?? "happy";
  const mascot = MASCOT_VARIANTS[variant];
  const achievementCelebration = variant === "achievement";
  return (
    <aside className={`lottie-mascot-celebration ${variant}`} aria-live="polite" aria-label={achievementCelebration ? "Conquista desbloqueada" : undefined}>
      {!achievementCelebration && <button type="button" onClick={() => setCelebration(null)} aria-label="Dispensar mascote"><X size={14} /></button>}
      <LottieAnimation key={celebration.key} kind={celebration.kind ?? mascot.kind} className="lottie-mascot-animation" preserveAspectRatio="xMidYMid meet" />
      {!achievementCelebration && (
        <span className="lottie-mascot-message">
          <strong>{celebration.title || mascot.title}</strong>
          {celebration.message && <small>{celebration.message}</small>}
        </span>
      )}
    </aside>
  );
}

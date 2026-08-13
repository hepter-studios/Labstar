import type { OnboardingLottieKind } from "./onboarding-lotties";
import { authClient } from "./auth-client";
import { isDevPreviewMode } from "./devPreviewMode";

export const ACHIEVEMENT_CATALOG = [
  { key: "profile_in_orbit", title: "Perfil em órbita", description: "Personalize seu perfil com uma foto ou uma bio.", rarity: "Comum", target: 1, kind: "star-in-hand", posterFrame: 20 },
  { key: "first_transmission", title: "Primeiros sinais", description: "Envie dez mensagens em canais ou conversas privadas.", rarity: "Comum", target: 10, kind: "happy-spaceman", posterFrame: 24 },
  { key: "mission_preparation", title: "Preparando a missão", description: "Atualize dois projetos diferentes.", rarity: "Comum", target: 2, kind: "victory-sign", posterFrame: 20 },
  { key: "stellar_communicator", title: "Comunicador estelar", description: "Envie 50 mensagens para manter a tripulação alinhada.", rarity: "Rara", target: 50, kind: "free-consultation", posterFrame: 38 },
  { key: "project_pioneer", title: "Pioneiro de projetos", description: "Atualize três projetos diferentes.", rarity: "Rara", target: 3, kind: "space-boy-developer", posterFrame: 80 },
  { key: "multi_mission", title: "Múltiplas missões", description: "Receba dois cargos profissionais na organização.", rarity: "Rara", target: 2, kind: "astronaut-illustration", posterFrame: 70 },
  { key: "channel_explorer", title: "Explorador de canais", description: "Participe de cinco canais ou conversas diferentes.", rarity: "Rara", target: 5, kind: "astronaut-cosmos", posterFrame: 22 },
  { key: "orbital_coffee", title: "Café orbital", description: "Envie 100 mensagens para manter as missões em movimento.", rarity: "Rara", target: 100, kind: "cute-astronaut-mug", posterFrame: 90 },
  { key: "constellation_voice", title: "Voz da constelação", description: "Alcance 250 mensagens entre canais e conversas privadas.", rarity: "Rara", target: 250, kind: "astronaut-coffee", posterFrame: 100 },
  { key: "long_range_radio", title: "Rádio de longo alcance", description: "Alcance 500 mensagens no Labstar.", rarity: "Épica", target: 500, kind: "astronaut-headphones", posterFrame: 48 },
  { key: "space_veteran", title: "Veterano do espaço", description: "Alcance 1.000 mensagens e torne-se uma referência da tripulação.", rarity: "Épica", target: 1000, kind: "astronaut-solo", posterFrame: 58 },
  { key: "idea_fisher", title: "Pescador de ideias", description: "Atualize dez projetos diferentes.", rarity: "Rara", target: 10, kind: "catch-the-fish", posterFrame: 32 },
  { key: "mission_engineer", title: "Engenheiro de missão", description: "Atualize 25 projetos diferentes.", rarity: "Épica", target: 25, kind: "space-boy-developer", celebrationKind: "astronaut-flow", posterFrame: 80 },
  { key: "engineering_master", title: "Mestre de engenharia", description: "Atualize 50 projetos diferentes e domine o fluxo de construção.", rarity: "Épica", target: 50, kind: "astronaut-flow" },
  { key: "versatile_crew", title: "Tripulação versátil", description: "Receba quatro cargos profissionais na organização.", rarity: "Épica", target: 4, kind: "crying-astronaut", posterFrame: 22 },
  { key: "constellation_architect", title: "Arquiteto de constelações", description: "Participe de 15 canais ou conversas diferentes.", rarity: "Épica", target: 15, kind: "astronaut-orbit", posterFrame: 64 },
] as const satisfies ReadonlyArray<{
  key: string;
  title: string;
  description: string;
  rarity: "Comum" | "Rara" | "Épica";
  target: number;
  kind: OnboardingLottieKind;
  celebrationKind?: OnboardingLottieKind;
  posterFrame?: number;
}>;

export const ACHIEVEMENTS_REFRESH_EVENT = "labstar:achievements-refresh";
export const OPEN_ACHIEVEMENT_EVENT = "labstar:open-achievement";

export function requestAchievementRefresh() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(ACHIEVEMENTS_REFRESH_EVENT));
}

export type AchievementKey = (typeof ACHIEVEMENT_CATALOG)[number]["key"];

export function requestOpenAchievement(key: AchievementKey) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<{ key: AchievementKey }>(OPEN_ACHIEVEMENT_EVENT, { detail: { key } }));
}

export type AchievementProgress = {
  key: AchievementKey;
  progress: number;
  target: number;
  unlockedAt: string | null;
};

type AchievementRow = {
  achievement_key?: unknown;
  progress?: unknown;
  target?: unknown;
  unlocked_at?: unknown;
};

function numeric(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : fallback;
}

export async function syncOwnAchievements(): Promise<AchievementProgress[]> {
  if (isDevPreviewMode()) {
    return ACHIEVEMENT_CATALOG.map((achievement) => ({
      key: achievement.key,
      progress: 0,
      target: achievement.target,
      unlockedAt: null,
    }));
  }
  if (!authClient) throw new Error("achievements_database_unavailable");
  const { data, error } = await authClient.rpc("sync_own_achievements");
  if (error) {
    if (/42883|42P01|sync_own_achievements|member_achievements/i.test(`${error.code ?? ""} ${error.message ?? ""}`)) {
      throw new Error("achievements_migration_pending");
    }
    throw error;
  }

  const rows = new Map(
    ((data ?? []) as AchievementRow[])
      .filter((row): row is AchievementRow & { achievement_key: AchievementKey } => (
        typeof row.achievement_key === "string"
        && ACHIEVEMENT_CATALOG.some((achievement) => achievement.key === row.achievement_key)
      ))
      .map((row) => [row.achievement_key, row]),
  );

  // O banco pode ser atualizado alguns segundos depois do catálogo do cliente.
  // Normalizar pela lista oficial mantém todas as missões visíveis sem inventar
  // desbloqueios ou substituir o progresso real já persistido.
  return ACHIEVEMENT_CATALOG.map((achievement) => {
    const row = rows.get(achievement.key);
    return {
      key: achievement.key,
      progress: numeric(row?.progress, 0),
      target: Math.max(1, numeric(row?.target, achievement.target)),
      unlockedAt: typeof row?.unlocked_at === "string" ? row.unlocked_at : null,
    };
  });
}

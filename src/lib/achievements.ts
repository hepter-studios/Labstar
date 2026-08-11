import type { OnboardingLottieKind } from "./onboarding-lotties";
import { authClient } from "./auth-client";

export const ACHIEVEMENT_CATALOG = [
  { key: "welcome_aboard", title: "Bem-vindo a bordo", description: "Faça parte da tripulação ativa do Labstar.", rarity: "Comum", target: 1, kind: "victory-sign" },
  { key: "profile_in_orbit", title: "Perfil em órbita", description: "Complete nome, foto, cargo e área do seu perfil.", rarity: "Comum", target: 1, kind: "star-in-hand" },
  { key: "first_transmission", title: "Primeira transmissão", description: "Envie sua primeira mensagem em um canal ou conversa privada.", rarity: "Comum", target: 1, kind: "happy-spaceman" },
  { key: "stellar_communicator", title: "Comunicador estelar", description: "Envie 10 mensagens para manter a tripulação alinhada.", rarity: "Rara", target: 10, kind: "free-consultation" },
  { key: "project_pioneer", title: "Pioneiro de projetos", description: "Atualize os detalhes ou o README de um projeto.", rarity: "Rara", target: 1, kind: "space-boy-developer" },
  { key: "multi_mission", title: "Múltiplas missões", description: "Receba dois cargos profissionais na organização.", rarity: "Rara", target: 2, kind: "astronaut-illustration" },
  { key: "organization_founder", title: "Fundador de constelação", description: "Crie e lidere uma organização no Labstar.", rarity: "Épica", target: 1, kind: "star-in-hand" },
] as const satisfies ReadonlyArray<{
  key: string;
  title: string;
  description: string;
  rarity: "Comum" | "Rara" | "Épica";
  target: number;
  kind: OnboardingLottieKind;
}>;

export type AchievementKey = (typeof ACHIEVEMENT_CATALOG)[number]["key"];

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
  if (!authClient) throw new Error("achievements_database_unavailable");
  const { data, error } = await authClient.rpc("sync_own_achievements");
  if (error) {
    if (/42883|42P01|sync_own_achievements|member_achievements/i.test(`${error.code ?? ""} ${error.message ?? ""}`)) {
      throw new Error("achievements_migration_pending");
    }
    throw error;
  }

  const known = new Set<string>(ACHIEVEMENT_CATALOG.map((achievement) => achievement.key));
  return ((data ?? []) as AchievementRow[])
    .filter((row) => typeof row.achievement_key === "string" && known.has(row.achievement_key))
    .map((row) => ({
      key: row.achievement_key as AchievementKey,
      progress: numeric(row.progress, 0),
      target: Math.max(1, numeric(row.target, 1)),
      unlockedAt: typeof row.unlocked_at === "string" ? row.unlocked_at : null,
    }));
}

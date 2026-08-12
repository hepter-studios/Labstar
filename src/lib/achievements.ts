import type { OnboardingLottieKind } from "./onboarding-lotties";
import { authClient } from "./auth-client";

export const ACHIEVEMENT_CATALOG = [
  { key: "welcome_aboard", title: "Bem-vindo a bordo", description: "Faça parte da tripulação ativa do Labstar.", rarity: "Comum", target: 1, kind: "victory-sign", posterFrame: 20 },
  { key: "profile_in_orbit", title: "Perfil em órbita", description: "Complete nome, foto, cargo e área do seu perfil.", rarity: "Comum", target: 1, kind: "star-in-hand", posterFrame: 20 },
  { key: "first_transmission", title: "Primeira transmissão", description: "Envie sua primeira mensagem em um canal ou conversa privada.", rarity: "Comum", target: 1, kind: "happy-spaceman", posterFrame: 24 },
  { key: "stellar_communicator", title: "Comunicador estelar", description: "Envie 10 mensagens para manter a tripulação alinhada.", rarity: "Rara", target: 10, kind: "free-consultation", posterFrame: 38 },
  { key: "project_pioneer", title: "Pioneiro de projetos", description: "Atualize os detalhes ou o README de um projeto.", rarity: "Rara", target: 1, kind: "space-boy-developer", posterFrame: 80 },
  { key: "multi_mission", title: "Múltiplas missões", description: "Receba dois cargos profissionais na organização.", rarity: "Rara", target: 2, kind: "astronaut-illustration", posterFrame: 70 },
  { key: "organization_founder", title: "Fundador de constelação", description: "Crie e lidere uma organização no Labstar.", rarity: "Épica", target: 1, kind: "astronaut-cosmos", posterFrame: 22 },
  { key: "orbital_coffee", title: "Café orbital", description: "Envie 25 mensagens para manter as missões em movimento.", rarity: "Rara", target: 25, kind: "cute-astronaut-mug", posterFrame: 90 },
  { key: "constellation_voice", title: "Voz da constelação", description: "Alcance 50 mensagens entre canais e conversas privadas.", rarity: "Rara", target: 50, kind: "astronaut-coffee", posterFrame: 100 },
  { key: "long_range_radio", title: "Rádio de longo alcance", description: "Alcance 100 mensagens no Labstar.", rarity: "Épica", target: 100, kind: "astronaut-headphones", posterFrame: 48 },
  { key: "space_veteran", title: "Veterano do espaço", description: "Alcance 250 mensagens e torne-se uma referência da tripulação.", rarity: "Épica", target: 250, kind: "astronaut-solo", posterFrame: 58 },
  { key: "idea_fisher", title: "Pescador de ideias", description: "Atualize três projetos diferentes.", rarity: "Rara", target: 3, kind: "catch-the-fish", posterFrame: 32 },
  { key: "mission_engineer", title: "Engenheiro de missão", description: "Atualize cinco projetos diferentes.", rarity: "Épica", target: 5, kind: "astronaut-flow", posterFrame: 50 },
  { key: "versatile_crew", title: "Tripulação versátil", description: "Receba três cargos profissionais na organização.", rarity: "Épica", target: 3, kind: "crying-astronaut", posterFrame: 22 },
  { key: "universe_architect", title: "Arquiteto de universos", description: "Crie e lidere duas organizações no Labstar.", rarity: "Épica", target: 2, kind: "astronaut-orbit", posterFrame: 64 },
] as const satisfies ReadonlyArray<{
  key: string;
  title: string;
  description: string;
  rarity: "Comum" | "Rara" | "Épica";
  target: number;
  kind: OnboardingLottieKind;
  posterFrame: number;
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

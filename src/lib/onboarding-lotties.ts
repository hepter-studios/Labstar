import stars0 from "./lottie-payloads/stars-0";
import stars1 from "./lottie-payloads/stars-1";
import stars2 from "./lottie-payloads/stars-2";
import stars3 from "./lottie-payloads/stars-3";
import stars4 from "./lottie-payloads/stars-4";
import stars5 from "./lottie-payloads/stars-5";
import stars6 from "./lottie-payloads/stars-6";
import rocketPayload from "./lottie-payloads/rocket";

export type OnboardingLottieKind =
  | "stars"
  | "rocket"
  | "project-stars"
  | "planet"
  | "happy-spaceman"
  | "astronaut-illustration"
  | "star-in-hand"
  | "victory-sign"
  | "crying-astronaut"
  | "space-boy-developer"
  | "free-consultation"
  | "cute-astronaut-mug"
  | "astronaut-coffee"
  | "catch-the-fish"
  | "astronaut-cosmos"
  | "astronaut-solo"
  | "astronaut-orbit"
  | "astronaut-headphones"
  | "astronaut-flow";

// The supplied space scene is kept complete here (all top-level layers/assets).
// It is only gzip-compressed and split into modules so it stays manageable in source.
const STARS_GZIP_BASE64 = stars0 + stars1 + stars2 + stars3 + stars4 + stars5 + stars6;
const ROCKET_GZIP_BASE64 = rocketPayload;

const cache = new Map<OnboardingLottieKind, Promise<Record<string, unknown>>>();

function decodeBase64(value: string) {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

async function expandLottie(payload: string) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("gzip_decompression_unavailable");
  }

  const compressed = new Blob([decodeBase64(payload)]).stream();
  const decompressed = compressed.pipeThrough(new DecompressionStream("gzip"));
  const json = await new Response(decompressed).text();
  return JSON.parse(json) as Record<string, unknown>;
}

function recolorRocket(animation: Record<string, unknown>) {
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;

    const record = value as Record<string, unknown>;
    const color = record.c;
    if (color && typeof color === "object") {
      const colorRecord = color as Record<string, unknown>;
      const channels = colorRecord.k;
      if (Array.isArray(channels) && channels.length === 4 && channels.every((channel) => typeof channel === "number")) {
        const [red, green, blue, alpha] = channels as number[];
        const darkestChannel = Math.max(red, green, blue);
        colorRecord.k = darkestChannel < 0.2
          ? [0.12, 0.44, 0.9, alpha]
          : [0.9, 0.97, 1, alpha];
      }
    }

    Object.values(record).forEach(visit);
  };

  visit(animation);
  return animation;
}

async function loadLottieSource(kind: OnboardingLottieKind) {
  if (kind === "project-stars") return (await import("../assets/lottie/stars.json")).default as Record<string, unknown>;
  if (kind === "planet") return (await import("../assets/lottie/planet.json")).default as Record<string, unknown>;
  if (kind === "happy-spaceman") return (await import("../assets/lottie/happy-spaceman.json")).default as Record<string, unknown>;
  if (kind === "astronaut-illustration") return (await import("../assets/lottie/astronaut-illustration.json")).default as Record<string, unknown>;
  if (kind === "star-in-hand") return (await import("../assets/lottie/star-in-hand.json")).default as Record<string, unknown>;
  if (kind === "victory-sign") return (await import("../assets/lottie/victory-sign.json")).default as Record<string, unknown>;
  if (kind === "crying-astronaut") return (await import("../assets/lottie/crying-astronaut.json")).default as Record<string, unknown>;
  if (kind === "space-boy-developer") return (await import("../assets/lottie/space-boy-developer.json")).default as Record<string, unknown>;
  if (kind === "free-consultation") return (await import("../assets/lottie/free-consultation.json")).default as Record<string, unknown>;
  if (kind === "cute-astronaut-mug") return (await import("../assets/lottie/cute-astronaut-mug.json")).default as Record<string, unknown>;
  if (kind === "astronaut-coffee") return (await import("../assets/lottie/astronaut-coffee.json")).default as Record<string, unknown>;
  if (kind === "catch-the-fish") return (await import("../assets/lottie/catch-the-fish.json")).default as Record<string, unknown>;
  if (kind === "astronaut-cosmos") return (await import("../assets/lottie/astronaut-cosmos.json")).default as Record<string, unknown>;
  if (kind === "astronaut-solo") return (await import("../assets/lottie/astronaut-solo.json")).default as Record<string, unknown>;
  if (kind === "astronaut-orbit") return (await import("../assets/lottie/astronaut-orbit.json")).default as Record<string, unknown>;
  if (kind === "astronaut-headphones") return (await import("../assets/lottie/astronaut-headphones.json")).default as Record<string, unknown>;
  if (kind === "astronaut-flow") return (await import("../assets/lottie/astronaut-flow.json")).default as Record<string, unknown>;

  const payload = kind === "stars" ? STARS_GZIP_BASE64 : ROCKET_GZIP_BASE64;
  const animation = await expandLottie(payload);

  if (kind === "rocket") {
    const layers = Array.isArray(animation.layers) ? animation.layers : [];
    animation.layers = layers.filter((layer) => String((layer as { nm?: unknown }).nm ?? "") !== "Radial");
    recolorRocket(animation);
  }

  return animation;
}

export function loadOnboardingLottie(kind: OnboardingLottieKind) {
  const existing = cache.get(kind);
  if (existing) return existing;

  const promise = loadLottieSource(kind).catch((error) => {
    cache.delete(kind);
    throw error;
  });

  cache.set(kind, promise);
  return promise;
}

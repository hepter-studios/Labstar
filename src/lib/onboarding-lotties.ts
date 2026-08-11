import stars0 from "./lottie-payloads/stars-0";
import stars1 from "./lottie-payloads/stars-1";
import stars2 from "./lottie-payloads/stars-2";
import stars3 from "./lottie-payloads/stars-3";
import stars4 from "./lottie-payloads/stars-4";
import stars5 from "./lottie-payloads/stars-5";
import stars6 from "./lottie-payloads/stars-6";

export type OnboardingLottieKind =
  | "stars"
  | "project-stars"
  | "planet"
  | "happy-spaceman"
  | "astronaut-illustration"
  | "star-in-hand"
  | "victory-sign"
  | "crying-astronaut"
  | "space-boy-developer"
  | "free-consultation";

// The supplied space scene is kept complete here (all top-level layers/assets).
// It is only gzip-compressed and split into modules so it stays manageable in source.
const STARS_GZIP_BASE64 = stars0 + stars1 + stars2 + stars3 + stars4 + stars5 + stars6;

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

  return expandLottie(STARS_GZIP_BASE64);
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

import stars0 from "./lottie-payloads/stars-0";
import stars1 from "./lottie-payloads/stars-1";
import stars2 from "./lottie-payloads/stars-2";
import stars3 from "./lottie-payloads/stars-3";
import stars4 from "./lottie-payloads/stars-4";
import stars5 from "./lottie-payloads/stars-5";
import stars6 from "./lottie-payloads/stars-6";
import rocketPayload from "./lottie-payloads/rocket";

export type OnboardingLottieKind = "stars" | "rocket";

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

export function loadOnboardingLottie(kind: OnboardingLottieKind) {
  const existing = cache.get(kind);
  if (existing) return existing;

  const payload = kind === "stars" ? STARS_GZIP_BASE64 : ROCKET_GZIP_BASE64;
  const promise = expandLottie(payload).catch((error) => {
    cache.delete(kind);
    throw error;
  });

  cache.set(kind, promise);
  return promise;
}

import { isTauriApp } from "./native";

const DEFAULT_RUST_BACKEND_URL = "https://labstar-api-mackson.fly.dev";
const PREWARM_TIMEOUT_MS = 8_000;

const backendUrl = (import.meta.env.VITE_LABSTAR_API_URL ?? DEFAULT_RUST_BACKEND_URL)
  .trim()
  .replace(/\/+$/, "");

export async function prewarmRustBackend() {
  // O desktop já aquece a API pelo cliente HTTPS nativo em Rust.
  if (isTauriApp()) return;
  if (!/^https:\/\//.test(backendUrl)) return;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), PREWARM_TIMEOUT_MS);

  try {
    await fetch(`${backendUrl}/health/live`, {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
  } catch {
    // Aquecimento é oportunista. A verificação real de acesso continua sendo
    // /v1/me e mostrará o erro correto caso a API permaneça indisponível.
  } finally {
    window.clearTimeout(timeout);
  }
}

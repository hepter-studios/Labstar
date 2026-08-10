import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const runtimeEnvironment = (
  globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  }
).process?.env ?? {};

const isDesktopBuild = runtimeEnvironment.LABSTAR_DESKTOP_BUILD === "1"
  || Boolean(runtimeEnvironment.TAURI_ENV_PLATFORM);

const upstreamLabstarApiUrl = runtimeEnvironment.VITE_LABSTAR_API_URL?.trim()
  || "https://labstar-api-mackson.fly.dev";

// No navegador, chamadas administrativas passam pelo mesmo domínio do Labstar.
// Isso evita que CORS/DNS do navegador transforme um backend saudável em
// "serviço indisponível". O desktop continua chamando a API Rust diretamente.
const labstarApiUrl = isDesktopBuild ? upstreamLabstarApiUrl : "/api/admin";

export default defineConfig({
  define: {
    "import.meta.env.VITE_LABSTAR_API_URL": JSON.stringify(labstarApiUrl),
  },
  plugins: [
    react(),
    ...(!isDesktopBuild ? [VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "favicon.svg", "favicon-180.png"],
      manifest: {
        id: "/",
        name: "Labstar",
        short_name: "Labstar",
        description: "Ambiente privado para empresas, projetos e equipes.",
        lang: "pt-BR",
        theme_color: "#030407",
        background_color: "#030407",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        scope: "/",
        categories: ["business", "productivity", "social"],
        icons: [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "/pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        importScripts: ["push-sw.js"],
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/pgzwyngxsxnheulvusdq\.supabase\.co\/.*/i,
            handler: "NetworkOnly",
          },
        ],
      },
    })] : []),
  ],
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    proxy: !isDesktopBuild ? {
      "/api/admin": {
        target: upstreamLabstarApiUrl,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/admin/, ""),
      },
    } : undefined,
  },
  build: {
    target: "es2022",
    sourcemap: false,
  },
});

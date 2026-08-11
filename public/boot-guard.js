(() => {
  const startedAt = Date.now();
  const state = { ready: false, rendered: false };

  if ("serviceWorker" in navigator) {
    let reloadingForFreshWorker = false;
    const entryPattern = /\/assets\/index-[A-Za-z0-9_-]+\.js/;

    function currentEntry() {
      for (const script of document.scripts) {
        const match = script.src.match(entryPattern);
        if (match) return match[0];
      }
      return null;
    }

    async function ensureFreshDeployment() {
      const loadedEntry = currentEntry();
      if (!loadedEntry) return;

      const probe = await fetch(`/index.html?labstar-deployment=${Date.now()}`, {
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Cache-Control": "no-cache" },
      });
      if (!probe.ok) return;

      const latestEntry = (await probe.text()).match(entryPattern)?.[0] ?? null;
      if (!latestEntry || latestEntry === loadedEntry) {
        try {
          sessionStorage.removeItem("labstar:deployment-reload");
        } catch {
          // Storage can be disabled; freshness checks must still continue.
        }
        return;
      }

      try {
        if (sessionStorage.getItem("labstar:deployment-reload") === latestEntry) return;
        sessionStorage.setItem("labstar:deployment-reload", latestEntry);
      } catch {
        // The cache cleanup below remains safe without the loop guard.
      }

      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update();
      registration?.waiting?.postMessage({ type: "SKIP_WAITING" });

      if ("caches" in window) {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames
            .filter((name) => name.startsWith("workbox-precache"))
            .map((name) => caches.delete(name)),
        );
      }

      window.setTimeout(() => location.reload(), 250);
    }

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloadingForFreshWorker) return;
      reloadingForFreshWorker = true;
      location.reload();
    });

    window.addEventListener("load", () => {
      ensureFreshDeployment()
        .catch(() => undefined);
    });
  }

  function safeText(value) {
    return String(value ?? "erro desconhecido")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .slice(0, 4000);
  }

  function renderFailure(title, details) {
    if (state.ready) return;
    state.rendered = true;
    const elapsed = Date.now() - startedAt;
    let diagnostic = document.getElementById("labstar-boot-diagnostic");
    if (!diagnostic) {
      diagnostic = document.createElement("div");
      diagnostic.id = "labstar-boot-diagnostic";
      diagnostic.setAttribute("role", "alert");
      diagnostic.style.cssText = "position:fixed;z-index:2147483647;inset:0;overflow:auto;background:#030407";
      document.body.appendChild(diagnostic);
    }
    diagnostic.innerHTML = `
      <main style="min-height:100vh;display:grid;place-items:center;padding:28px;box-sizing:border-box;background:#030407;color:#f5f7ff;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
        <section style="width:min(680px,100%);padding:28px;border:1px solid rgba(255,255,255,.12);border-radius:18px;background:#090c13;box-shadow:0 30px 100px #000c">
          <strong style="display:block;margin-bottom:18px;font-size:20px;letter-spacing:.18em">L★BSTAR</strong>
          <small style="color:#ffb16f;font-weight:750;letter-spacing:.12em">DIAGNÓSTICO DE INICIALIZAÇÃO</small>
          <h1 style="margin:10px 0 8px;font-size:24px">${safeText(title)}</h1>
          <p style="margin:0 0 16px;color:#9da7bd;line-height:1.6">O aplicativo não ficará mais preso em uma tela preta. A mensagem abaixo identifica o ponto real da falha.</p>
          <pre style="max-height:300px;overflow:auto;white-space:pre-wrap;word-break:break-word;padding:14px;border-radius:12px;background:#03050a;color:#d9e1f5;font:12px/1.55 Consolas,monospace">${safeText(details)}\n\nURL: ${safeText(location.href)}\nTempo: ${elapsed} ms</pre>
          <button id="labstar-boot-reload" style="height:40px;padding:0 16px;border:0;border-radius:10px;background:#edf2ff;color:#080b12;font-weight:750;cursor:pointer">Tentar novamente</button>
        </section>
      </main>`;
    document.getElementById("labstar-boot-reload")?.addEventListener("click", () => location.reload());
  }

  window.__LABSTAR_BOOT_GUARD__ = {
    ready() {
      state.ready = true;
      document.documentElement.dataset.labstarBoot = "ready";
      document.getElementById("labstar-boot-diagnostic")?.remove();
    },
    fail(title, details) {
      renderFailure(title, details);
    },
  };

  window.addEventListener("error", (event) => {
    const source = event.filename ? `\nArquivo: ${event.filename}:${event.lineno}:${event.colno}` : "";
    const stack = event.error?.stack ? `\n${event.error.stack}` : "";
    renderFailure("Falha ao carregar a interface", `${event.message || "Erro JavaScript"}${source}${stack}`);
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason instanceof Error
      ? `${event.reason.message}\n${event.reason.stack || ""}`
      : JSON.stringify(event.reason ?? "Promise rejeitada sem motivo");
    renderFailure("Falha assíncrona durante a abertura", reason);
  });

  window.setTimeout(() => {
    if (!state.ready) {
      renderFailure(
        "A interface não confirmou a inicialização",
        "O HTML abriu, mas o bundle React não concluiu a primeira renderização em 8 segundos.",
      );
    }
  }, 8000);
})();

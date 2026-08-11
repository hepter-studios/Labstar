const LOTTIE_RUNTIME_SOURCES = [
  "https://raw.githubusercontent.com/airbnb/lottie-web/v5.12.2/build/player/lottie.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/bodymovin/5.12.2/lottie.min.js",
  "https://cdn.jsdelivr.net/npm/lottie-web@5.12.2/build/player/lottie.min.js",
];

function javascript(body, status = 200, cache = "no-store") {
  return new Response(body, {
    status,
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": cache,
      "x-content-type-options": "nosniff",
    },
  });
}

export async function onRequest(context) {
  if (context.request.method !== "GET") {
    return javascript("/* Method Not Allowed */", 405);
  }

  for (const source of LOTTIE_RUNTIME_SOURCES) {
    try {
      const upstream = await fetch(source, {
        headers: {
          accept: "application/javascript,text/javascript,*/*;q=0.1",
          "user-agent": "Labstar-Lottie-Runtime/1.0",
        },
      });

      if (!upstream.ok) continue;
      const body = await upstream.arrayBuffer();
      if (!body.byteLength) continue;

      return new Response(body, {
        status: 200,
        headers: {
          "content-type": "application/javascript; charset=utf-8",
          "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
          "x-content-type-options": "nosniff",
        },
      });
    } catch {
      // Tenta a próxima origem. O navegador continua falando apenas com o Labstar.
    }
  }

  return javascript("/* Labstar: Lottie runtime unavailable */", 503);
}

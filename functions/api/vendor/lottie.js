const LOTTIE_RUNTIME_URL = "https://raw.githubusercontent.com/airbnb/lottie-web/v5.12.2/build/player/lottie.min.js";

export async function onRequestGet() {
  let upstream;
  try {
    upstream = await fetch(LOTTIE_RUNTIME_URL, {
      headers: {
        accept: "application/javascript,text/javascript,*/*;q=0.1",
        "user-agent": "Labstar-Lottie-Runtime/1.0",
      },
    });
  } catch {
    return new Response("/* Labstar: lottie runtime unavailable */", {
      status: 503,
      headers: {
        "content-type": "application/javascript; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  if (!upstream.ok) {
    return new Response("/* Labstar: lottie runtime unavailable */", {
      status: 502,
      headers: {
        "content-type": "application/javascript; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  return new Response(await upstream.arrayBuffer(), {
    status: 200,
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
      "x-content-type-options": "nosniff",
    },
  });
}

export function onRequest() {
  return new Response("Method Not Allowed", {
    status: 405,
    headers: { allow: "GET" },
  });
}

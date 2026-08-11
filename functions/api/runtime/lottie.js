const LOTTIE_RUNTIME_URL = "https://cdnjs.cloudflare.com/ajax/libs/bodymovin/5.12.2/lottie.min.js";

export async function onRequest() {
  try {
    const upstream = await fetch(LOTTIE_RUNTIME_URL, {
      headers: {
        "user-agent": "Labstar/1.0 organization-onboarding",
        "accept": "application/javascript,text/javascript,*/*;q=0.8",
      },
    });

    if (!upstream.ok) {
      return new Response("/* Labstar: Lottie runtime unavailable */", {
        status: 502,
        headers: {
          "content-type": "application/javascript; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "content-type": "application/javascript; charset=utf-8",
        "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new Response("/* Labstar: Lottie runtime proxy failed */", {
      status: 502,
      headers: {
        "content-type": "application/javascript; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }
}

const API_ORIGIN = "https://labstar-api-mackson.fly.dev";

const ALLOWED_PATHS = [
  /^\/health(?:\/live|\/ready)?$/,
  /^\/v1\/me$/,
  /^\/v1\/profile(?:\/avatar)?$/,
  /^\/v1\/members(?:\/[0-9a-f-]+(?:\/job-roles)?)?$/,
  /^\/v1\/job-roles(?:\/[0-9a-f-]+)?$/,
  /^\/v1\/invites(?:\/inspect\/[0-9a-f]+|\/accept\/[0-9a-f]+|\/[0-9a-f-]+)?$/,
  /^\/v1\/workspace$/,
  /^\/v1\/collaboration$/,
  /^\/v1\/spaces(?:\/[0-9a-f-]+(?:\/logo)?)?$/,
  /^\/v1\/categories$/,
  /^\/v1\/channels(?:\/[0-9a-f-]+(?:\/permissions|\/messages)?)?$/,
  /^\/v1\/channel-messages\/[0-9a-f-]+$/,
  /^\/v1\/channel-attachments$/,
  /^\/v1\/notifications(?:\/read-all|\/[0-9a-f-]+\/read)?$/,
  /^\/v1\/integrations(?:\/[0-9a-f-]+)?$/,
  /^\/v1\/social-posts(?:\/[0-9a-f-]+)?$/,
  /^\/v1\/meetings(?:\/[0-9a-f-]+\/cancel)?$/,
  /^\/v1\/direct\/threads(?:\/[0-9a-f-]+\/(?:messages|read))?$/,
  /^\/v1\/direct\/messages\/[0-9a-f-]+$/,
  /^\/v1\/direct\/attachments$/,
  /^\/v1\/calls(?:\/ice-config|\/pending|\/[0-9a-f-]+(?:\/status|\/signals)?)?$/,
  /^\/v1\/work-items(?:\/[0-9a-f-]+)?$/,
  /^\/v1\/search$/,
  /^\/v1\/realtime\/ticket$/,
];

function requestedPath(value) {
  const parts = Array.isArray(value) ? value : [value];
  return `/${parts.filter(Boolean).join("/")}`;
}

export async function onRequest({ request, params }) {
  const path = requestedPath(params.path);
  if (!ALLOWED_PATHS.some((pattern) => pattern.test(path))) {
    return Response.json({ code: "route_not_allowed" }, { status: 404 });
  }

  const incomingUrl = new URL(request.url);
  const target = new URL(`${path}${incomingUrl.search}`, API_ORIGIN);
  const headers = new Headers();
  for (const name of ["accept", "authorization", "content-type", "if-none-match"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("x-labstar-edge", "cloudflare-pages");

  const init = { method: request.method, headers, redirect: "manual" };
  if (request.method !== "GET" && request.method !== "HEAD") init.body = request.body;

  try {
    const upstream = await fetch(target, init);
    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.set("cache-control", "no-store");
    responseHeaders.set("x-labstar-proxy", "rust-api");
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch {
    return Response.json(
      { code: "backend_proxy_unavailable", message: "Backend Rust indisponível." },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }
}

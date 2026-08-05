const API_ORIGIN = "https://labstar-api-mackson.fly.dev";
const SUPABASE_ORIGIN = "https://pgzwyngxsxnheulvusdq.supabase.co";

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

function jsonResponse(value, status = 200, extraHeaders = {}) {
  return Response.json(value, {
    status,
    headers: {
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

function memberFromRow(row) {
  return {
    id: String(row.id ?? ""),
    email: String(row.email ?? ""),
    name: String(row.name ?? ""),
    status: String(row.status ?? "active"),
    role: String(row.role ?? "member"),
    jobTitle: String(row.job_title ?? ""),
    area: String(row.area ?? ""),
    assignments: Array.isArray(row.assignments) ? row.assignments.map(String) : [],
    createdAt: String(row.created_at ?? ""),
    lastSeenAt: String(row.last_seen_at ?? row.created_at ?? ""),
    avatarPath: String(row.avatar_path ?? ""),
    avatarUrl: "",
    jobRoles: [],
  };
}

function roleFromRow(row) {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    department: String(row.department ?? "Outros"),
    color: String(row.color ?? "#8baeff"),
    icon: String(row.icon ?? "star"),
    position: Number(row.position ?? 100),
    permissions: Array.isArray(row.permissions) ? row.permissions.map(String) : [],
  };
}

async function supabaseReadFallback(path, request, env) {
  if (request.method !== "GET") return null;
  const authorization = request.headers.get("authorization");
  const apiKey = env.VITE_SUPABASE_PUBLISHABLE_KEY
    || env.VITE_SUPABASE_ANON_KEY
    || env.SUPABASE_PUBLISHABLE_KEY
    || env.SUPABASE_ANON_KEY;
  if (!authorization || !apiKey) return null;

  let restPath = "";
  let transform = (value) => value;

  if (path === "/v1/members") {
    restPath = "/rest/v1/members?select=*&order=created_at.asc";
    transform = (value) => Array.isArray(value) ? value.map(memberFromRow) : [];
  } else if (path === "/v1/job-roles") {
    restPath = "/rest/v1/job_roles?select=*&order=position.asc";
    transform = (value) => Array.isArray(value) ? value.map(roleFromRow) : [];
  } else {
    const match = path.match(/^\/v1\/members\/([0-9a-f-]+)\/job-roles$/);
    if (!match) return null;
    restPath = `/rest/v1/member_job_roles?member_id=eq.${encodeURIComponent(match[1])}&select=job_role:job_roles(*)`;
    transform = (value) => Array.isArray(value)
      ? value.map((entry) => entry?.job_role).filter(Boolean).map(roleFromRow)
      : [];
  }

  const response = await fetch(`${SUPABASE_ORIGIN}${restPath}`, {
    headers: {
      accept: "application/json",
      apikey: apiKey,
      authorization,
    },
  });
  if (!response.ok) return null;
  const payload = await response.json();
  return jsonResponse(transform(payload), 200, {
    "x-labstar-proxy": "supabase-read-fallback",
  });
}

export async function onRequest({ request, params, env }) {
  const path = requestedPath(params.path);
  if (!ALLOWED_PATHS.some((pattern) => pattern.test(path))) {
    return jsonResponse({ code: "route_not_allowed" }, 404);
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
    const teamReturnedEmpty = path === "/v1/members"
      && upstream.ok
      && Array.isArray(await upstream.clone().json().catch(() => null))
      && (await upstream.clone().json().catch(() => null))?.length === 0;

    if (!upstream.ok || teamReturnedEmpty) {
      const fallback = await supabaseReadFallback(path, request, env);
      if (fallback) return fallback;
    }

    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.set("cache-control", "no-store");
    responseHeaders.set("x-labstar-proxy", "rust-api");
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch {
    const fallback = await supabaseReadFallback(path, request, env);
    if (fallback) return fallback;
    return jsonResponse(
      { code: "backend_proxy_unavailable", message: "Backend Rust indisponível." },
      502,
    );
  }
}

import { createClient } from "npm:@supabase/supabase-js@2.55.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GITHUB_CLIENT_ID = Deno.env.get("GITHUB_PROFILE_CLIENT_ID") ?? "";
const GITHUB_CLIENT_SECRET = Deno.env.get("GITHUB_PROFILE_CLIENT_SECRET") ?? "";
const GITHUB_CALLBACK_URL = Deno.env.get("GITHUB_PROFILE_CALLBACK_URL")
  ?? `${SUPABASE_URL}/functions/v1/github-profile-connection?action=callback`;
const EXTRA_ALLOWED_ORIGINS = (Deno.env.get("LABSTAR_PROFILE_ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type StartPayload = {
  action?: string;
  returnTo?: string;
};

type GithubUser = {
  id?: number;
  login?: string;
  name?: string | null;
  avatar_url?: string;
  html_url?: string;
  bio?: string | null;
  company?: string | null;
  location?: string | null;
  public_repos?: number;
  followers?: number;
  following?: number;
};

function isAllowedOrigin(origin: string) {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    if (url.protocol === "https:" && (url.hostname === "labstar.pages.dev" || url.hostname.endsWith(".labstar.pages.dev"))) return true;
    if (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) return true;
    return EXTRA_ALLOWED_ORIGINS.includes(url.origin);
  } catch {
    return false;
  }
}

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin : "https://labstar.pages.dev",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(request: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json; charset=utf-8" },
  });
}

function validateReturnTo(value: unknown) {
  if (typeof value !== "string" || value.length > 1_000) throw new Error("invalid_return_to");
  const url = new URL(value);
  const allowed = (
    (url.protocol === "https:" && (url.hostname === "labstar.pages.dev" || url.hostname.endsWith(".labstar.pages.dev")))
    || (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1"))
    || EXTRA_ALLOWED_ORIGINS.includes(url.origin)
  );
  if (!allowed || url.username || url.password) throw new Error("invalid_return_to");
  url.hash = "";
  return url.toString();
}

function randomState() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

function redirectWithStatus(returnTo: string, status: "connected" | "cancelled" | "error") {
  const target = new URL(returnTo);
  target.searchParams.set("github_profile", status);
  return Response.redirect(target.toString(), 303);
}

async function startConnection(request: Request) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    return json(request, 503, { error: "github_profile_connection_not_configured" });
  }

  const token = bearerToken(request);
  if (!token) return json(request, 401, { error: "authentication_required" });

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return json(request, 401, { error: "invalid_session" });

  let payload: StartPayload;
  try {
    payload = await request.json() as StartPayload;
  } catch {
    return json(request, 400, { error: "invalid_json" });
  }

  let returnTo: string;
  try {
    returnTo = validateReturnTo(payload.returnTo);
  } catch {
    return json(request, 400, { error: "invalid_return_to" });
  }

  const { data: member, error: memberError } = await admin
    .from("members")
    .select("id,status")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();

  if (memberError || !member || member.status !== "active") {
    return json(request, 403, { error: "active_member_required" });
  }

  const state = randomState();
  const stateHash = await sha256Hex(state);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1_000).toISOString();

  await admin.from("profile_connection_states")
    .delete()
    .eq("member_id", member.id)
    .eq("provider", "github");

  const { error: stateError } = await admin.from("profile_connection_states").insert({
    member_id: member.id,
    provider: "github",
    state_hash: stateHash,
    return_to: returnTo,
    expires_at: expiresAt,
  });

  if (stateError) return json(request, 500, { error: "connection_state_failed" });

  const authorizationUrl = new URL("https://github.com/login/oauth/authorize");
  authorizationUrl.searchParams.set("client_id", GITHUB_CLIENT_ID);
  authorizationUrl.searchParams.set("redirect_uri", GITHUB_CALLBACK_URL);
  authorizationUrl.searchParams.set("scope", "read:user");
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("allow_signup", "false");

  return json(request, 200, { authorizationUrl: authorizationUrl.toString() });
}

async function callback(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  const providerError = url.searchParams.get("error") ?? "";

  if (!state || state.length > 1_000) return new Response("Invalid OAuth state", { status: 400 });

  const stateHash = await sha256Hex(state);
  const { data: consumed, error: stateError } = await admin.rpc("consume_github_profile_state", {
    target_state_hash: stateHash,
  });
  const record = Array.isArray(consumed) ? consumed[0] : consumed;

  if (stateError || !record?.member_id || !record?.return_to) {
    return new Response("Expired or invalid OAuth state", { status: 400 });
  }

  if (providerError || !code) return redirectWithStatus(record.return_to, "cancelled");

  try {
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "User-Agent": "Labstar-Profile-Connection",
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: GITHUB_CALLBACK_URL,
      }),
    });
    const tokenBody = await tokenResponse.json() as { access_token?: string; error?: string };
    if (!tokenResponse.ok || !tokenBody.access_token) throw new Error(tokenBody.error || "token_exchange_failed");

    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        "Accept": "application/vnd.github+json",
        "Authorization": `Bearer ${tokenBody.access_token}`,
        "User-Agent": "Labstar-Profile-Connection",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    const github = await userResponse.json() as GithubUser;
    if (!userResponse.ok || !github.id || !github.login) throw new Error("github_user_fetch_failed");

    const profile = {
      githubId: String(github.id),
      username: github.login,
      name: github.name ?? "",
      avatarUrl: github.avatar_url ?? "",
      profileUrl: github.html_url ?? `https://github.com/${github.login}`,
      bio: github.bio ?? "",
      company: github.company ?? "",
      location: github.location ?? "",
      publicRepos: Number(github.public_repos ?? 0),
      followers: Number(github.followers ?? 0),
      following: Number(github.following ?? 0),
      connectedAt: new Date().toISOString(),
      source: "github_oauth",
      verified: true,
    };

    const { error: saveError } = await admin.rpc("set_member_github_profile", {
      target_member_id: record.member_id,
      new_github_profile: profile,
    });
    if (saveError) throw saveError;

    return redirectWithStatus(record.return_to, "connected");
  } catch {
    return redirectWithStatus(record.return_to, "error");
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  const url = new URL(request.url);
  if (request.method === "GET" && url.searchParams.get("action") === "callback") return callback(request);
  if (request.method !== "POST") return json(request, 405, { error: "method_not_allowed" });
  return startConnection(request);
});

import { getCurrentIdentity, supabaseClient } from "./supabase";
import { isTauriApp, nativeOAuthReturnUrl, openNativeAuthUrl } from "./native";

export type GithubPublicProfile = {
  username: string;
  name: string;
  avatarUrl: string;
  profileUrl: string;
  bio: string;
  company: string;
  location: string;
  publicRepos: number;
  followers: number;
  following: number;
  connectedAt: string;
  verified: boolean;
};

export type PublicProfileConnections = {
  github: GithubPublicProfile | null;
  instagramUsername: string;
};

type GithubApiUser = {
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

const PROFILE_LINK_PENDING_KEY = "labstar-profile-link-pending";

function requireClient() {
  if (!supabaseClient) throw new Error("supabase_not_configured");
  return supabaseClient;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeInstagramUsername(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  let candidate = trimmed.replace(/^@/, "");
  try {
    if (/^https?:\/\//i.test(candidate)) {
      const url = new URL(candidate);
      if (!/(^|\.)instagram\.com$/i.test(url.hostname)) throw new Error("invalid_instagram_host");
      candidate = url.pathname.split("/").filter(Boolean)[0] ?? "";
    }
  } catch {
    throw new Error("invalid_instagram_username");
  }
  candidate = candidate.replace(/^@/, "").trim();
  if (!/^[a-zA-Z0-9._]{1,30}$/.test(candidate)) throw new Error("invalid_instagram_username");
  return candidate;
}

function normalizeGithubUsername(value: string) {
  const username = value.trim();
  if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(username)) {
    throw new Error("invalid_github_username");
  }
  return username;
}

function githubFromStored(value: unknown): GithubPublicProfile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const username = stringValue(row.username);
  if (!username) return null;
  return {
    username,
    name: stringValue(row.name),
    avatarUrl: stringValue(row.avatarUrl),
    profileUrl: stringValue(row.profileUrl) || `https://github.com/${username}`,
    bio: stringValue(row.bio),
    company: stringValue(row.company),
    location: stringValue(row.location),
    publicRepos: numberValue(row.publicRepos),
    followers: numberValue(row.followers),
    following: numberValue(row.following),
    connectedAt: stringValue(row.connectedAt),
    verified: row.verified === true,
  };
}

function identityUsername(identityData: Record<string, unknown>) {
  const candidates = [
    identityData.user_name,
    identityData.preferred_username,
    identityData.username,
    identityData.login,
  ];
  return candidates.map(stringValue).find(Boolean) ?? "";
}

async function fetchGithubProfile(username: string, identityData: Record<string, unknown> = {}): Promise<GithubPublicProfile> {
  const normalized = normalizeGithubUsername(username);
  let api: GithubApiUser = {};
  try {
    const response = await fetch(`https://api.github.com/users/${encodeURIComponent(normalized)}`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (response.ok) api = await response.json() as GithubApiUser;
  } catch {
    // Os metadados verificados pelo OAuth continuam suficientes para mostrar a conexão.
  }

  const login = stringValue(api.login) || normalized;
  return {
    username: login,
    name: stringValue(api.name) || stringValue(identityData.full_name) || stringValue(identityData.name),
    avatarUrl: stringValue(api.avatar_url) || stringValue(identityData.avatar_url),
    profileUrl: stringValue(api.html_url) || `https://github.com/${login}`,
    bio: stringValue(api.bio),
    company: stringValue(api.company),
    location: stringValue(api.location),
    publicRepos: numberValue(api.public_repos),
    followers: numberValue(api.followers),
    following: numberValue(api.following),
    connectedAt: new Date().toISOString(),
    verified: true,
  };
}

async function currentMemberId() {
  const identity = await getCurrentIdentity();
  if (!identity?.member) throw new Error("member_not_found");
  return identity.member.id;
}

export async function getMemberProfileConnections(memberId: string): Promise<PublicProfileConnections> {
  try {
    const { data, error } = await requireClient()
      .from("members")
      .select("github_profile,instagram_username")
      .eq("id", memberId)
      .maybeSingle();
    if (error) throw error;
    return {
      github: githubFromStored(data?.github_profile),
      instagramUsername: stringValue(data?.instagram_username),
    };
  } catch {
    return { github: null, instagramUsername: "" };
  }
}

export async function listMemberProfileConnections() {
  try {
    const { data, error } = await requireClient()
      .from("members")
      .select("id,email,github_profile,instagram_username");
    if (error) throw error;
    return (data ?? []).map((row) => ({
      memberId: String(row.id),
      email: stringValue(row.email).toLowerCase(),
      github: githubFromStored(row.github_profile),
      instagramUsername: stringValue(row.instagram_username),
    }));
  } catch {
    return [];
  }
}

export async function getCurrentProfileConnections(): Promise<PublicProfileConnections & { githubIdentityLinked: boolean }> {
  const memberId = await currentMemberId();
  const stored = await getMemberProfileConnections(memberId);
  const { data, error } = await requireClient().auth.getUserIdentities();
  if (error) throw error;
  const githubIdentity = data?.identities?.find((identity) => identity.provider === "github") ?? null;
  return { ...stored, githubIdentityLinked: Boolean(githubIdentity) };
}

export async function syncConnectedGithubProfile() {
  const { data, error } = await requireClient().auth.getUserIdentities();
  if (error) throw error;
  const identity = data?.identities?.find((candidate) => candidate.provider === "github");
  if (!identity) throw new Error("github_identity_not_linked");
  const identityData = (identity.identity_data ?? {}) as Record<string, unknown>;
  const username = identityUsername(identityData);
  if (!username) throw new Error("github_username_missing");
  const profile = await fetchGithubProfile(username, identityData);
  const { error: saveError } = await requireClient().rpc("set_own_github_profile", {
    new_github_profile: profile,
  });
  if (saveError) throw saveError;
  return profile;
}

export async function connectGithubIdentity() {
  const redirectTo = isTauriApp()
    ? nativeOAuthReturnUrl()
    : `${window.location.origin}${window.location.pathname}?linked=github`;
  window.sessionStorage.setItem(PROFILE_LINK_PENDING_KEY, "github");
  const { data, error } = await requireClient().auth.linkIdentity({
    provider: "github",
    options: {
      redirectTo,
      skipBrowserRedirect: isTauriApp(),
    },
  });
  if (error) {
    window.sessionStorage.removeItem(PROFILE_LINK_PENDING_KEY);
    throw error;
  }
  if (isTauriApp() && data?.url) await openNativeAuthUrl(data.url);
  else if (data?.url) window.location.assign(data.url);
}

export async function disconnectGithubIdentity() {
  const { data, error } = await requireClient().auth.getUserIdentities();
  if (error) throw error;
  const identity = data?.identities?.find((candidate) => candidate.provider === "github");
  if (identity) {
    const { error: unlinkError } = await requireClient().auth.unlinkIdentity(identity);
    if (unlinkError) throw unlinkError;
  }
  const { error: clearError } = await requireClient().rpc("clear_own_github_profile");
  if (clearError) throw clearError;
}

export async function saveInstagramConnection(value: string) {
  const normalized = normalizeInstagramUsername(value);
  const { error } = await requireClient().rpc("set_own_instagram_username", {
    new_instagram_username: normalized || null,
  });
  if (error) throw error;
  return normalized;
}

export function takePendingProfileConnection() {
  const pending = window.sessionStorage.getItem(PROFILE_LINK_PENDING_KEY);
  if (pending) window.sessionStorage.removeItem(PROFILE_LINK_PENDING_KEY);
  return pending;
}

import { getCurrentIdentity, supabaseClient } from "./supabase";

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
  message?: string;
};

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

export function normalizeGithubUsername(value: string) {
  const trimmed = value.trim();
  let candidate = trimmed.replace(/^@/, "");
  try {
    if (/^https?:\/\//i.test(candidate)) {
      const url = new URL(candidate);
      if (!/(^|\.)github\.com$/i.test(url.hostname)) throw new Error("invalid_github_host");
      candidate = url.pathname.split("/").filter(Boolean)[0] ?? "";
    }
  } catch {
    throw new Error("invalid_github_username");
  }
  candidate = candidate.replace(/^@/, "").trim();
  if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(candidate)) {
    throw new Error("invalid_github_username");
  }
  return candidate;
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

async function fetchGithubProfile(value: string): Promise<GithubPublicProfile> {
  const username = normalizeGithubUsername(value);
  const response = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  const api = await response.json() as GithubApiUser;
  if (!response.ok || !api.login) {
    throw new Error(response.status === 404 ? "github_profile_not_found" : "github_profile_unavailable");
  }

  return {
    username: stringValue(api.login),
    name: stringValue(api.name),
    avatarUrl: stringValue(api.avatar_url),
    profileUrl: stringValue(api.html_url) || `https://github.com/${username}`,
    bio: stringValue(api.bio),
    company: stringValue(api.company),
    location: stringValue(api.location),
    publicRepos: numberValue(api.public_repos),
    followers: numberValue(api.followers),
    following: numberValue(api.following),
    connectedAt: new Date().toISOString(),
    verified: false,
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

export async function getCurrentProfileConnections(): Promise<PublicProfileConnections> {
  return getMemberProfileConnections(await currentMemberId());
}

export async function connectGithubProfile(value: string) {
  const profile = await fetchGithubProfile(value);
  const { error } = await requireClient().rpc("set_own_github_profile", {
    new_github_profile: profile,
  });
  if (error) throw error;
  return profile;
}

export async function refreshGithubProfile(username: string) {
  return connectGithubProfile(username);
}

export async function disconnectGithubProfile() {
  const { error } = await requireClient().rpc("clear_own_github_profile");
  if (error) throw error;
}

export async function saveInstagramConnection(value: string) {
  const normalized = normalizeInstagramUsername(value);
  const { error } = await requireClient().rpc("set_own_instagram_username", {
    new_instagram_username: normalized || null,
  });
  if (error) throw error;
  return normalized;
}

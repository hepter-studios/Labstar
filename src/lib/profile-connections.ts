import { isTauriApp, openNativeProfileConnectionUrl, takeNativeProfileConnectionStatus } from "./native";
import { getCurrentIdentity, supabaseClient } from "./supabase";

export type GithubPublicProfile = {
  githubId: string;
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
};

export type GithubProfileConnectionResult = "connected" | "cancelled" | "error" | null;

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

function githubFromStored(value: unknown): GithubPublicProfile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const username = stringValue(row.username);
  const githubId = stringValue(row.githubId);
  if (!username || !githubId || row.verified !== true) return null;
  return {
    githubId,
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
    verified: true,
  };
}

async function currentMemberId() {
  const identity = await getCurrentIdentity();
  if (!identity?.member) throw new Error("member_not_found");
  return identity.member.id;
}

function webReturnUrl() {
  const current = new URL(window.location.href);
  current.search = "";
  current.hash = "";
  if (isTauriApp()) return "https://labstar.pages.dev/?source=desktop";
  return current.toString();
}

export async function getMemberProfileConnections(memberId: string): Promise<PublicProfileConnections> {
  try {
    const { data, error } = await requireClient()
      .from("members")
      .select("github_profile")
      .eq("id", memberId)
      .maybeSingle();
    if (error) throw error;
    return { github: githubFromStored(data?.github_profile) };
  } catch {
    return { github: null };
  }
}

export async function listMemberProfileConnections() {
  try {
    const { data, error } = await requireClient()
      .from("members")
      .select("id,email,github_profile");
    if (error) throw error;
    return (data ?? []).map((row) => ({
      memberId: String(row.id),
      email: stringValue(row.email).toLowerCase(),
      github: githubFromStored(row.github_profile),
    }));
  } catch {
    return [];
  }
}

export async function getCurrentProfileConnections(): Promise<PublicProfileConnections> {
  return getMemberProfileConnections(await currentMemberId());
}

export async function connectGithubProfile() {
  const { data, error } = await requireClient().functions.invoke<{ authorizationUrl?: string; error?: string }>(
    "github-profile-connection",
    { body: { action: "start", returnTo: webReturnUrl() } },
  );
  if (error) throw error;
  const authorizationUrl = stringValue(data?.authorizationUrl);
  if (!authorizationUrl) throw new Error(data?.error || "github_authorization_url_missing");

  if (isTauriApp()) await openNativeProfileConnectionUrl(authorizationUrl);
  else window.location.assign(authorizationUrl);
}

export async function disconnectGithubProfile() {
  const { error } = await requireClient().rpc("clear_own_github_profile");
  if (error) throw error;
}

export function takeGithubProfileConnectionResult(): GithubProfileConnectionResult {
  const nativeStatus = takeNativeProfileConnectionStatus();
  const url = new URL(window.location.href);
  const queryStatus = url.searchParams.get("github_profile");
  const status = nativeStatus || queryStatus;
  if (queryStatus) {
    url.searchParams.delete("github_profile");
    url.searchParams.delete("source");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }
  return status === "connected" || status === "cancelled" || status === "error" ? status : null;
}

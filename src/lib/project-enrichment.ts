import { supabaseClient } from "./supabase";
import { requestAchievementRefresh } from "./achievements";

export type ProjectProfile = {
  nodeId: string;
  logoPath: string;
  logoUrl: string;
  documentTitle: string;
  documentUrl: string;
  documentMarkdown: string;
  tags: string[];
  techStack: string[];
  version: string;
  dueDate: string;
  nextMilestone: string;
  updatedAt: string;
  persistence: "remote" | "local";
};

export type ProjectProfileInput = Omit<ProjectProfile, "logoUrl" | "updatedAt" | "persistence"> & {
  logoUrl?: string;
};

const LOCAL_KEY = "labstar-project-profiles-v1";
const BUCKET = "labstar-files";

function emptyProfile(nodeId: string): ProjectProfile {
  return {
    nodeId,
    logoPath: "",
    logoUrl: "",
    documentTitle: "README",
    documentUrl: "",
    documentMarkdown: "",
    tags: [],
    techStack: [],
    version: "",
    dueDate: "",
    nextMilestone: "",
    updatedAt: "",
    persistence: "local",
  };
}

function normalizeList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(String).map((item) => item.trim()).filter(Boolean))].slice(0, 24);
}

function readLocalProfiles() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOCAL_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [] as ProjectProfile[];
    return parsed.flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const row = value as Partial<ProjectProfile>;
      if (!row.nodeId) return [];
      return [{
        ...emptyProfile(String(row.nodeId)),
        ...row,
        nodeId: String(row.nodeId),
        tags: normalizeList(row.tags),
        techStack: normalizeList(row.techStack),
        persistence: row.persistence === "remote" ? "remote" : "local",
      } satisfies ProjectProfile];
    });
  } catch {
    return [] as ProjectProfile[];
  }
}

function writeLocalProfiles(profiles: ProjectProfile[]) {
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(profiles));
  } catch {
    // O banco continua sendo a fonte oficial quando o armazenamento local está indisponível.
  }
}

function upsertLocal(profile: ProjectProfile) {
  const current = readLocalProfiles();
  const next = [...current.filter((item) => item.nodeId !== profile.nodeId), profile];
  writeLocalProfiles(next);
  return profile;
}

function client() {
  if (!supabaseClient) throw new Error("supabase_not_configured");
  return supabaseClient;
}

function unavailableError(error: unknown) {
  const value = error as { code?: string; message?: string } | null;
  const text = `${value?.code ?? ""} ${value?.message ?? ""}`.toLocaleLowerCase();
  return /42p01|pgrst205|project_profiles|schema cache|failed to fetch|network|load failed/.test(text);
}

async function signedLogo(path: string) {
  if (!path) return "";
  const { data, error } = await client().storage.from(BUCKET).createSignedUrl(path, 6 * 60 * 60);
  return error ? "" : data.signedUrl;
}

async function rowToProfile(row: Record<string, unknown>): Promise<ProjectProfile> {
  const logoPath = String(row.logo_path ?? "");
  return {
    nodeId: String(row.node_id ?? ""),
    logoPath,
    logoUrl: await signedLogo(logoPath),
    documentTitle: String(row.document_title ?? "README") || "README",
    documentUrl: String(row.document_url ?? ""),
    documentMarkdown: String(row.document_markdown ?? ""),
    tags: normalizeList(row.tags),
    techStack: normalizeList(row.tech_stack),
    version: String(row.version ?? ""),
    dueDate: String(row.due_date ?? ""),
    nextMilestone: String(row.next_milestone ?? ""),
    updatedAt: String(row.updated_at ?? ""),
    persistence: "remote",
  };
}

export async function listProjectProfiles(): Promise<ProjectProfile[]> {
  const local = readLocalProfiles();
  try {
    const { data, error } = await client().from("project_profiles").select("*").order("updated_at", { ascending: false });
    if (error) throw error;
    const remote = await Promise.all((data ?? []).map((row) => rowToProfile(row as Record<string, unknown>)));
    const remoteIds = new Set(remote.map((item) => item.nodeId));
    const merged = [...remote, ...local.filter((item) => !remoteIds.has(item.nodeId))];
    writeLocalProfiles(merged);
    return merged;
  } catch (error) {
    if (!unavailableError(error)) throw error;
    return local;
  }
}

export async function saveProjectProfile(input: ProjectProfileInput): Promise<ProjectProfile> {
  const normalized: ProjectProfile = {
    ...emptyProfile(input.nodeId),
    ...input,
    nodeId: input.nodeId,
    logoUrl: input.logoUrl ?? "",
    documentTitle: input.documentTitle.trim() || "README",
    documentUrl: input.documentUrl.trim(),
    documentMarkdown: input.documentMarkdown.trim(),
    tags: normalizeList(input.tags),
    techStack: normalizeList(input.techStack),
    version: input.version.trim(),
    dueDate: input.dueDate.trim(),
    nextMilestone: input.nextMilestone.trim(),
    updatedAt: new Date().toISOString(),
    persistence: "local",
  };

  try {
    const { data, error } = await client().from("project_profiles").upsert({
      node_id: normalized.nodeId,
      logo_path: normalized.logoPath || null,
      document_title: normalized.documentTitle,
      document_url: normalized.documentUrl || null,
      document_markdown: normalized.documentMarkdown || null,
      tags: normalized.tags,
      tech_stack: normalized.techStack,
      version: normalized.version || null,
      due_date: normalized.dueDate || null,
      next_milestone: normalized.nextMilestone || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "node_id" }).select("*").single();
    if (error) throw error;
    const saved = upsertLocal(await rowToProfile(data as Record<string, unknown>));
    requestAchievementRefresh();
    return saved;
  } catch (error) {
    if (!unavailableError(error)) throw error;
    return upsertLocal(normalized);
  }
}

function safeSegment(value: string) {
  return value.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 100) || "project";
}

function safeFileName(name: string) {
  const parts = name.split(".");
  const extension = parts.length > 1 ? `.${parts.pop()!.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8)}` : "";
  const stem = parts.join(".").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 70) || "logo";
  return `${stem}${extension}`;
}

export async function uploadProjectLogo(nodeId: string, file: File) {
  if (!file.type.startsWith("image/")) throw new Error("invalid_image");
  if (file.size > 5 * 1024 * 1024) throw new Error("image_too_large");
  const path = `projects/${safeSegment(nodeId)}/logo-${Date.now()}-${safeFileName(file.name)}`;
  const { error } = await client().storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;
  return { path, url: await signedLogo(path) };
}

export async function removeProjectLogo(path: string) {
  if (!path) return;
  const { error } = await client().storage.from(BUCKET).remove([path]);
  if (error && !unavailableError(error)) throw error;
}

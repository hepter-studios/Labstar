import { supabaseClient } from "./supabase";

export type ProjectDocumentAsset = {
  id: string;
  nodeId: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  createdAt: string;
};

export const MAX_PROJECT_DOCUMENT_ASSET_BYTES = 25 * 1024 * 1024;
const BUCKET = "labstar-files";

function client() {
  if (!supabaseClient) throw new Error("supabase_not_configured");
  return supabaseClient;
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
  const extension = parts.length > 1
    ? `.${parts.pop()!.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12)}`
    : "";
  const stem = parts.join(".")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 90) || "arquivo";
  return `${stem}${extension}`;
}

async function signedUrl(path: string) {
  if (!path) return "";
  const { data, error } = await client().storage.from(BUCKET).createSignedUrl(path, 6 * 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}

async function rowToAsset(row: Record<string, unknown>): Promise<ProjectDocumentAsset> {
  const filePath = String(row.file_path ?? "");
  return {
    id: String(row.id ?? ""),
    nodeId: String(row.node_id ?? ""),
    fileName: String(row.file_name ?? "arquivo"),
    filePath,
    mimeType: String(row.mime_type ?? "application/octet-stream"),
    sizeBytes: Number(row.size_bytes ?? 0),
    url: await signedUrl(filePath),
    createdAt: String(row.created_at ?? ""),
  };
}

export function projectAssetMarkdownReference(asset: ProjectDocumentAsset) {
  const ref = `labstar-attachment:${encodeURIComponent(asset.id)}`;
  return asset.mimeType.startsWith("image/")
    ? `![${asset.fileName}](${ref})`
    : `[${asset.fileName}](${ref})`;
}

export function registerProjectDocumentAssets(assets: ProjectDocumentAsset[]) {
  const target = window as typeof window & { __LABSTAR_PROJECT_ASSET_URLS__?: Record<string, string> };
  const current = target.__LABSTAR_PROJECT_ASSET_URLS__ ?? {};
  for (const asset of assets) current[asset.id] = asset.url;
  target.__LABSTAR_PROJECT_ASSET_URLS__ = current;
}

export function unregisterProjectDocumentAsset(assetId: string) {
  const target = window as typeof window & { __LABSTAR_PROJECT_ASSET_URLS__?: Record<string, string> };
  if (target.__LABSTAR_PROJECT_ASSET_URLS__) delete target.__LABSTAR_PROJECT_ASSET_URLS__[assetId];
}

export async function listProjectDocumentAssets(nodeId?: string): Promise<ProjectDocumentAsset[]> {
  let query = client().from("project_document_assets").select("*").order("created_at", { ascending: true });
  if (nodeId) query = query.eq("node_id", nodeId);
  const { data, error } = await query;
  if (error) throw error;
  const assets = await Promise.all((data ?? []).map((row) => rowToAsset(row as Record<string, unknown>)));
  registerProjectDocumentAssets(assets);
  return assets;
}

export async function uploadProjectDocumentAsset(nodeId: string, file: File): Promise<ProjectDocumentAsset> {
  if (!file.size) throw new Error("empty_file");
  if (file.size > MAX_PROJECT_DOCUMENT_ASSET_BYTES) throw new Error("file_too_large");
  const path = `projects/${safeSegment(nodeId)}/documents/${Date.now()}-${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const { error: uploadError } = await client().storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { data, error } = await client().from("project_document_assets").insert({
    node_id: nodeId,
    file_name: file.name.slice(0, 240),
    file_path: path,
    mime_type: file.type || "application/octet-stream",
    size_bytes: file.size,
  }).select("*").single();

  if (error) {
    await client().storage.from(BUCKET).remove([path]).catch(() => undefined);
    throw error;
  }

  const asset = await rowToAsset(data as Record<string, unknown>);
  registerProjectDocumentAssets([asset]);
  return asset;
}

export async function removeProjectDocumentAsset(asset: ProjectDocumentAsset) {
  const { error } = await client().from("project_document_assets").delete().eq("id", asset.id);
  if (error) throw error;
  if (asset.filePath) await client().storage.from(BUCKET).remove([asset.filePath]).catch(() => undefined);
  unregisterProjectDocumentAsset(asset.id);
}

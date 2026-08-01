import { supabaseClient } from "./supabase";

export type WorkItemKind = "task" | "decision" | "follow_up";
export type WorkItemStatus = "open" | "in_progress" | "blocked" | "done";
export type WorkItemPriority = "low" | "medium" | "high" | "urgent";

export type WorkItem = {
  id: string;
  title: string;
  details: string;
  kind: WorkItemKind;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  channelId: string | null;
  spaceId: string | null;
  assigneeId: string | null;
  createdBy: string;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const WORKSPACE_ID = "labstar-work-items-v1";

function requireClient() {
  if (!supabaseClient) throw new Error("supabase_not_configured");
  return supabaseClient;
}

function normalizeItem(value: unknown): WorkItem | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = String(row.id ?? "");
  const title = String(row.title ?? "").trim();
  if (!id || !title) return null;
  const kind = ["task", "decision", "follow_up"].includes(String(row.kind))
    ? String(row.kind) as WorkItemKind
    : "task";
  const status = ["open", "in_progress", "blocked", "done"].includes(String(row.status))
    ? String(row.status) as WorkItemStatus
    : "open";
  const priority = ["low", "medium", "high", "urgent"].includes(String(row.priority))
    ? String(row.priority) as WorkItemPriority
    : "medium";
  return {
    id,
    title,
    details: String(row.details ?? ""),
    kind,
    status,
    priority,
    channelId: row.channelId ? String(row.channelId) : null,
    spaceId: row.spaceId ? String(row.spaceId) : null,
    assigneeId: row.assigneeId ? String(row.assigneeId) : null,
    createdBy: String(row.createdBy ?? ""),
    dueAt: row.dueAt ? String(row.dueAt) : null,
    completedAt: row.completedAt ? String(row.completedAt) : null,
    createdAt: String(row.createdAt ?? new Date().toISOString()),
    updatedAt: String(row.updatedAt ?? row.createdAt ?? new Date().toISOString()),
  };
}

export async function listWorkItems(): Promise<WorkItem[]> {
  const { data, error } = await requireClient()
    .from("workspaces")
    .select("nodes")
    .eq("id", WORKSPACE_ID)
    .maybeSingle();
  if (error) throw error;
  const raw = Array.isArray(data?.nodes) ? data.nodes : [];
  return raw
    .map(normalizeItem)
    .filter((item): item is WorkItem => Boolean(item))
    .sort((a, b) => {
      if (a.status === "done" && b.status !== "done") return 1;
      if (a.status !== "done" && b.status === "done") return -1;
      if (a.dueAt && b.dueAt) return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
      if (a.dueAt) return -1;
      if (b.dueAt) return 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
}

async function saveWorkItems(items: WorkItem[]) {
  const { error } = await requireClient().from("workspaces").upsert({
    id: WORKSPACE_ID,
    nodes: items,
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (error) throw error;
}

export async function createWorkItem(input: {
  title: string;
  details?: string;
  kind: WorkItemKind;
  priority: WorkItemPriority;
  channelId?: string | null;
  spaceId?: string | null;
  assigneeId?: string | null;
  createdBy: string;
  dueAt?: string | null;
}) {
  const current = await listWorkItems();
  const now = new Date().toISOString();
  const item: WorkItem = {
    id: crypto.randomUUID(),
    title: input.title.trim(),
    details: input.details?.trim() ?? "",
    kind: input.kind,
    status: "open",
    priority: input.priority,
    channelId: input.channelId ?? null,
    spaceId: input.spaceId ?? null,
    assigneeId: input.assigneeId ?? null,
    createdBy: input.createdBy,
    dueAt: input.dueAt || null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await saveWorkItems([item, ...current]);
  window.dispatchEvent(new CustomEvent("labstar:work-items-changed"));
  return item;
}

export async function updateWorkItem(id: string, patch: Partial<Omit<WorkItem, "id" | "createdAt" | "createdBy">>) {
  const current = await listWorkItems();
  let updated: WorkItem | null = null;
  const now = new Date().toISOString();
  const next = current.map((item) => {
    if (item.id !== id) return item;
    const status = patch.status ?? item.status;
    updated = {
      ...item,
      ...patch,
      title: patch.title?.trim() || item.title,
      details: patch.details === undefined ? item.details : patch.details.trim(),
      completedAt: status === "done" ? item.completedAt ?? now : null,
      updatedAt: now,
    };
    return updated;
  });
  if (!updated) throw new Error("work_item_not_found");
  await saveWorkItems(next);
  window.dispatchEvent(new CustomEvent("labstar:work-items-changed"));
  return updated;
}

export async function deleteWorkItem(id: string) {
  const current = await listWorkItems();
  await saveWorkItems(current.filter((item) => item.id !== id));
  window.dispatchEvent(new CustomEvent("labstar:work-items-changed"));
}

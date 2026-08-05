import { jsonBody, rustApi } from "./rust-api";

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

export async function listWorkItems(): Promise<WorkItem[]> {
  return rustApi<WorkItem[]>("/v1/work-items");
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
  const item = await rustApi<WorkItem>("/v1/work-items", {
    method: "POST",
    body: jsonBody(input),
  });
  window.dispatchEvent(new CustomEvent("labstar:work-items-changed"));
  return item;
}

export async function updateWorkItem(
  id: string,
  patch: Partial<Omit<WorkItem, "id" | "createdAt" | "createdBy">>,
) {
  const item = await rustApi<WorkItem>(`/v1/work-items/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: jsonBody(patch),
  });
  window.dispatchEvent(new CustomEvent("labstar:work-items-changed"));
  return item;
}

export async function deleteWorkItem(id: string) {
  await rustApi(`/v1/work-items/${encodeURIComponent(id)}`, { method: "DELETE" });
  window.dispatchEvent(new CustomEvent("labstar:work-items-changed"));
}

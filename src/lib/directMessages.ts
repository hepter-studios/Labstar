import type { RealtimeChannel } from "@supabase/supabase-js";
import { listRolesForMember, supabaseClient, type JobRole } from "./supabase";

export type DirectThreadSummary = {
  threadId: string;
  otherMemberId: string;
  updatedAt: string;
  lastMessageBody: string;
  lastMessageAt: string | null;
  unreadCount: number;
};

export type DirectAttachment = {
  id: string;
  messageId: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
};

export type DirectMessage = {
  id: string;
  threadId: string;
  authorId: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  replyTo: string | null;
  isPinned: boolean;
  author: {
    id: string;
    name: string;
    email: string;
    avatarPath: string;
    avatarUrl: string;
    jobTitle: string;
    jobRoles: JobRole[];
  } | null;
  attachments: DirectAttachment[];
};

function requireClient() {
  if (!supabaseClient) throw new Error("supabase_not_configured");
  return supabaseClient;
}

async function signedAssetUrl(path?: string | null, expiresIn = 60 * 60 * 8) {
  if (!path) return "";
  try {
    const { data, error } = await requireClient().storage.from("labstar-files").createSignedUrl(path, expiresIn);
    return error ? "" : data.signedUrl;
  } catch {
    return "";
  }
}

function safeFileName(name: string) {
  const parts = name.split(".");
  const extension = parts.length > 1 ? `.${parts.pop()!.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12)}` : "";
  const stem = parts.join(".")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 90) || "arquivo";
  return `${stem}${extension}`;
}

export async function listDirectThreads(): Promise<DirectThreadSummary[]> {
  const { data, error } = await requireClient().rpc("list_direct_threads");
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    threadId: String(row.thread_id),
    otherMemberId: String(row.other_member_id),
    updatedAt: String(row.updated_at),
    lastMessageBody: String(row.last_message_body ?? ""),
    lastMessageAt: row.last_message_at ? String(row.last_message_at) : null,
    unreadCount: Number(row.unread_count ?? 0),
  }));
}

export async function getOrCreateDirectThread(otherMemberId: string) {
  const { data, error } = await requireClient().rpc("get_or_create_direct_thread", { other_member_id: otherMemberId });
  if (error) throw error;
  return String(data);
}

export async function markDirectThreadRead(threadId: string) {
  const { error } = await requireClient().rpc("mark_direct_thread_read", { target_thread_id: threadId });
  if (error) throw error;
}

export async function listDirectMessages(threadId: string): Promise<DirectMessage[]> {
  const client = requireClient();
  const { data: messageRows, error: messageError } = await client
    .from("direct_messages")
    .select("id,thread_id,author_id,body,created_at,edited_at,reply_to,is_pinned")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(300);
  if (messageError) throw messageError;
  if (!messageRows?.length) return [];

  const authorIds = [...new Set(messageRows.map((row) => String(row.author_id)))];
  const messageIds = messageRows.map((row) => String(row.id));

  const [memberResult, attachmentResult] = await Promise.all([
    client
      .from("members")
      .select("id,name,email,avatar_path,job_title")
      .in("id", authorIds),
    client
      .from("direct_message_attachments")
      .select("id,message_id,file_name,file_path,mime_type,size_bytes")
      .in("message_id", messageIds)
      .order("created_at", { ascending: true }),
  ]);

  const authorsById = new Map<string, Record<string, unknown>>();
  if (!memberResult.error) {
    for (const row of memberResult.data ?? []) authorsById.set(String(row.id), row as Record<string, unknown>);
  }

  const rolesByAuthor = new Map<string, JobRole[]>();
  await Promise.all(authorIds.map(async (id) => {
    try {
      rolesByAuthor.set(id, await listRolesForMember(id));
    } catch {
      rolesByAuthor.set(id, []);
    }
  }));

  const attachmentsByMessage = new Map<string, Record<string, unknown>[]>();
  if (!attachmentResult.error) {
    for (const row of attachmentResult.data ?? []) {
      const messageId = String(row.message_id);
      attachmentsByMessage.set(messageId, [...(attachmentsByMessage.get(messageId) ?? []), row as Record<string, unknown>]);
    }
  }

  return Promise.all(messageRows.map(async (row) => {
    const authorId = String(row.author_id);
    const authorRow = authorsById.get(authorId) ?? null;
    const avatarPath = String(authorRow?.avatar_path ?? "");
    const attachmentRows = attachmentsByMessage.get(String(row.id)) ?? [];
    const attachments = await Promise.all(attachmentRows.map(async (file) => ({
      id: String(file.id),
      messageId: String(file.message_id),
      fileName: String(file.file_name),
      filePath: String(file.file_path),
      mimeType: String(file.mime_type ?? "application/octet-stream"),
      sizeBytes: Number(file.size_bytes ?? 0),
      url: await signedAssetUrl(String(file.file_path), 60 * 60),
    })));

    return {
      id: String(row.id),
      threadId: String(row.thread_id),
      authorId,
      body: String(row.body ?? ""),
      createdAt: String(row.created_at),
      editedAt: row.edited_at ? String(row.edited_at) : null,
      replyTo: row.reply_to ? String(row.reply_to) : null,
      isPinned: Boolean(row.is_pinned),
      author: authorRow ? {
        id: authorId,
        name: String(authorRow.name ?? "Membro"),
        email: String(authorRow.email ?? ""),
        avatarPath,
        avatarUrl: await signedAssetUrl(avatarPath),
        jobTitle: String(authorRow.job_title ?? ""),
        jobRoles: rolesByAuthor.get(authorId) ?? [],
      } : null,
      attachments,
    } satisfies DirectMessage;
  }));
}

export async function sendDirectMessage(input: {
  threadId: string;
  authorId: string;
  body: string;
  replyTo?: string | null;
  files?: File[];
}) {
  const files = input.files ?? [];
  const body = input.body.trim() || (files.some((file) => file.type.startsWith("image/"))
    ? "Enviou uma imagem"
    : `Enviou ${files.length} arquivo(s)`);

  const { data: message, error } = await requireClient().from("direct_messages").insert({
    thread_id: input.threadId,
    author_id: input.authorId,
    body,
    reply_to: input.replyTo ?? null,
  }).select("*").single();
  if (error) throw error;

  for (const file of files.slice(0, 8)) {
    if (file.size > 50 * 1024 * 1024) throw new Error("file_too_large");
    const path = `direct/${input.threadId}/${message.id}/${Date.now()}-${safeFileName(file.name)}`;
    const { error: uploadError } = await requireClient().storage.from("labstar-files").upload(path, file, {
      cacheControl: "3600",
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (uploadError) throw uploadError;

    const { error: attachmentError } = await requireClient().from("direct_message_attachments").insert({
      message_id: message.id,
      file_name: file.name,
      file_path: path,
      mime_type: file.type || "application/octet-stream",
      size_bytes: file.size,
    });
    if (attachmentError) throw attachmentError;
  }

  return message;
}

export async function editDirectMessage(messageId: string, body: string) {
  const { error } = await requireClient().from("direct_messages").update({
    body: body.trim(),
    edited_at: new Date().toISOString(),
  }).eq("id", messageId);
  if (error) throw error;
}

export async function pinDirectMessage(messageId: string, isPinned: boolean) {
  const { error } = await requireClient().from("direct_messages").update({ is_pinned: isPinned }).eq("id", messageId);
  if (error) throw error;
}

export async function deleteDirectMessage(messageId: string) {
  const { error } = await requireClient().from("direct_messages").delete().eq("id", messageId);
  if (error) throw error;
}

export function subscribeToDirectThread(threadId: string, onChange: () => void): RealtimeChannel {
  const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return requireClient()
    .channel(`labstar-direct-${threadId}-${id}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "direct_messages", filter: `thread_id=eq.${threadId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "direct_message_attachments" }, onChange)
    .subscribe();
}

export function unsubscribeDirect(channel: RealtimeChannel | null) {
  if (channel) void requireClient().removeChannel(channel);
}

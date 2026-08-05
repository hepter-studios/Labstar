import type { JobRole } from "./supabase";
import {
  jsonBody,
  rustApi,
  rustApiUpload,
  subscribeRustRealtime,
  type RustRealtimeSubscription,
} from "./rust-api";

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
  sha256?: string;
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

export type DirectMessageRealtimeEvent = {
  id: string;
  threadId: string;
  authorId: string;
  body: string;
  createdAt: string;
};

export type DirectSubscription = {
  close: () => void;
};

function lazyRealtime(
  onReady: (subscription: RustRealtimeSubscription) => void,
  onError?: () => void,
): DirectSubscription {
  let closed = false;
  let current: RustRealtimeSubscription | null = null;
  void subscribeRustRealtime(() => undefined)
    .then((subscription) => {
      if (closed) subscription.close();
      else {
        current = subscription;
        onReady(subscription);
      }
    })
    .catch(() => onError?.());
  return {
    close: () => {
      closed = true;
      current?.close();
    },
  };
}

export async function listDirectThreads(): Promise<DirectThreadSummary[]> {
  return rustApi<DirectThreadSummary[]>("/v1/direct/threads");
}

export async function getOrCreateDirectThread(otherMemberId: string) {
  const response = await rustApi<{ threadId: string }>("/v1/direct/threads", {
    method: "POST",
    body: jsonBody({ otherMemberId }),
  });
  return response.threadId;
}

export async function markDirectThreadRead(threadId: string) {
  await rustApi(`/v1/direct/threads/${encodeURIComponent(threadId)}/read`, { method: "POST" });
}

export async function listDirectMessages(threadId: string): Promise<DirectMessage[]> {
  return rustApi<DirectMessage[]>(
    `/v1/direct/threads/${encodeURIComponent(threadId)}/messages`,
  );
}

export async function sendDirectMessage(input: {
  threadId: string;
  authorId: string;
  body: string;
  replyTo?: string | null;
  files?: File[];
}) {
  const files = (input.files ?? []).slice(0, 8);
  const body = input.body.trim() || (files.some((file) => file.type.startsWith("image/"))
    ? "Enviou uma imagem"
    : `Enviou ${files.length} arquivo(s)`);

  const message = await rustApi<{ id: string; threadId: string }>(
    `/v1/direct/threads/${encodeURIComponent(input.threadId)}/messages`,
    {
      method: "POST",
      body: jsonBody({ body, replyTo: input.replyTo ?? null }),
    },
  );

  for (const file of files) {
    const form = new FormData();
    form.set("threadId", input.threadId);
    form.set("messageId", message.id);
    form.set("file", file, file.name);
    await rustApiUpload<DirectAttachment>("/v1/direct/attachments", form);
  }

  return message;
}

export async function editDirectMessage(messageId: string, body: string) {
  await rustApi(`/v1/direct/messages/${encodeURIComponent(messageId)}`, {
    method: "PATCH",
    body: jsonBody({ body: body.trim() }),
  });
}

export async function pinDirectMessage(messageId: string, isPinned: boolean) {
  await rustApi(`/v1/direct/messages/${encodeURIComponent(messageId)}`, {
    method: "PATCH",
    body: jsonBody({ isPinned }),
  });
}

export async function deleteDirectMessage(messageId: string) {
  await rustApi(`/v1/direct/messages/${encodeURIComponent(messageId)}`, { method: "DELETE" });
}

export function subscribeToDirectThread(threadId: string, onChange: () => void): DirectSubscription {
  let closed = false;
  let current: RustRealtimeSubscription | null = null;
  void subscribeRustRealtime((event) => {
    if (event.type === "directMessageCreated"
      || event.type === "directMessageUpdated"
      || event.type === "directMessageDeleted") {
      if (event.payload.threadId === threadId) onChange();
    }
  }).then((subscription) => {
    if (closed) subscription.close();
    else current = subscription;
  }).catch(() => undefined);

  return {
    close: () => {
      closed = true;
      current?.close();
    },
  };
}

export function subscribeToAllDirectMessages(
  onInsert: (event: DirectMessageRealtimeEvent) => void,
  onStatus?: (status: string) => void,
): DirectSubscription {
  let closed = false;
  let current: RustRealtimeSubscription | null = null;
  void subscribeRustRealtime((event) => {
    if (event.type !== "directMessageCreated") return;
    onInsert({
      id: event.payload.messageId,
      threadId: event.payload.threadId,
      authorId: event.payload.authorId,
      body: "Nova mensagem privada",
      createdAt: new Date().toISOString(),
    });
  }, onStatus).then((subscription) => {
    if (closed) subscription.close();
    else current = subscription;
  }).catch(() => onStatus?.("error"));

  return {
    close: () => {
      closed = true;
      current?.close();
    },
  };
}

export function unsubscribeDirect(subscription: DirectSubscription | null) {
  subscription?.close();
}

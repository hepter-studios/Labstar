import { supabaseClient } from "./supabase";

export const CHAT_CLEARED_EVENT = "labstar:chat-cleared";

export type ChatClearedDetail =
  | { kind: "channel"; channelId: string }
  | { kind: "direct"; threadId: string };

export function notifyChatCleared(detail: ChatClearedDetail) {
  window.dispatchEvent(new CustomEvent<ChatClearedDetail>(CHAT_CLEARED_EVENT, { detail }));
}

function requireClient() {
  if (!supabaseClient) throw new Error("supabase_not_configured");
  return supabaseClient;
}

export async function clearChannelChat(channelId: string) {
  if (!channelId) throw new Error("channel_required");
  const { data, error } = await requireClient().rpc("clear_channel_chat", {
    target_channel_id: channelId,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function clearDirectConversation(threadId: string) {
  if (!threadId) throw new Error("direct_thread_required");
  const { data, error } = await requireClient().rpc("clear_direct_conversation", {
    target_thread_id: threadId,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

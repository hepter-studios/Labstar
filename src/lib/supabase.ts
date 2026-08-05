import type { User } from "@supabase/supabase-js";
import { authClient, requireAuthClient } from "./auth-client";
import { BackendApiError, getBackendIdentity, type BackendMember } from "./backend";
import {
  jsonBody,
  rustApi,
  rustApiUpload,
  subscribeRustRealtime,
  type RustRealtimeSubscription,
} from "./rust-api";

export type MemberRole = "owner" | "admin" | "manager" | "member" | "viewer";
export type MemberStatus = "pending" | "active" | "suspended";

export type JobRole = {
  id: string;
  name: string;
  department: string;
  color: string;
  icon: string;
  position: number;
  permissions: string[];
};

export type Member = {
  id: string;
  email: string;
  name: string;
  status: MemberStatus;
  role: MemberRole;
  jobTitle: string;
  area: string;
  assignments: string[];
  createdAt: string;
  lastSeenAt: string;
  avatarPath: string;
  avatarUrl: string;
  jobRoles: JobRole[];
};

export type CollaborationSpace = {
  id: string;
  name: string;
  description: string;
  kind: "company" | "product" | "project" | "team";
  color: string;
  icon: string;
  logoPath: string;
  logoUrl: string;
  position: number;
};

export type ChannelCategory = {
  id: string;
  spaceId: string;
  name: string;
  position: number;
};

export type LabstarChannel = {
  id: string;
  spaceId: string;
  categoryId: string | null;
  name: string;
  description: string;
  type: "text" | "announcement" | "rules" | "voice" | "social";
  allowedRoles: MemberRole[];
  allowedAssignments: string[];
  position: number;
};

export type MessageAttachment = {
  id: string;
  messageId: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
};

export type ChannelMessage = {
  id: string;
  channelId: string;
  authorId: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  replyTo: string | null;
  isPinned: boolean;
  author: Pick<Member, "id" | "name" | "email" | "avatarPath" | "avatarUrl" | "jobTitle" | "jobRoles"> | null;
  attachments: MessageAttachment[];
};

export type LabstarNotification = {
  id: string;
  title: string;
  body: string;
  channelId: string | null;
  isRead: boolean;
  createdAt: string;
};

export type SocialPost = {
  id: string;
  spaceId: string;
  title: string;
  content: string;
  platforms: string[];
  status: "idea" | "draft" | "review" | "scheduled" | "published";
  scheduledFor: string | null;
  ownerId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ScheduledMeeting = {
  id: string;
  channelId: string;
  title: string;
  agenda: string;
  startsAt: string;
  durationMinutes: number;
  createdBy: string | null;
  attendeeIds: string[];
  status: "scheduled" | "live" | "completed" | "cancelled";
  createdAt: string;
};

export type IntegrationRule = {
  id: string;
  spaceId: string;
  provider: "github" | "discord" | "monitoring" | "billing" | "support";
  name: string;
  endpoint: string;
  channelId: string;
  events: string[];
  enabled: boolean;
  renewalDate: string;
};

export const supabaseClient = authClient;
export const isSupabaseConfigured = Boolean(authClient);

function memberFromBackend(member: BackendMember): Member {
  return {
    id: member.id,
    email: member.email,
    name: member.name,
    status: member.status,
    role: member.role,
    jobTitle: member.jobTitle ?? "",
    area: member.area ?? "",
    assignments: [],
    createdAt: "",
    lastSeenAt: new Date().toISOString(),
    avatarPath: "",
    avatarUrl: "",
    jobRoles: [],
  };
}

function blockedMember(user: User, status: "pending" | "suspended"): Member {
  const email = user.email?.trim().toLowerCase() ?? "";
  const name = String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? "").trim();
  return {
    id: user.id,
    email,
    name: name || email.split("@")[0] || "Membro Labstar",
    status,
    role: "viewer",
    jobTitle: "",
    area: "",
    assignments: [],
    createdAt: "",
    lastSeenAt: new Date().toISOString(),
    avatarPath: "",
    avatarUrl: "",
    jobRoles: [],
  };
}

export async function requestMagicLink(email: string) {
  const { error } = await requireAuthClient().auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { shouldCreateUser: false, emailRedirectTo: window.location.origin },
  });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await requireAuthClient().auth.signOut();
  if (error) throw error;
  window.location.assign("/");
}

export async function getCurrentIdentity(): Promise<{ user: User; member: Member | null } | null> {
  const { data: { session }, error } = await requireAuthClient().auth.getSession();
  if (error) throw error;
  if (!session?.user?.email) return null;
  try {
    const identity = await getBackendIdentity(session.access_token);
    const base = memberFromBackend({ ...identity.member, email: identity.email });
    const team = await listMembers().catch(() => ({ members: [base], canManage: false }));
    return { user: session.user, member: team.members.find((item) => item.id === base.id) ?? base };
  } catch (requestError) {
    if (!(requestError instanceof BackendApiError)) throw requestError;
    if (requestError.code === "member_not_authorized") return { user: session.user, member: null };
    if (requestError.code === "member_pending" || requestError.code === "member_suspended") {
      return {
        user: session.user,
        member: blockedMember(session.user, requestError.code === "member_pending" ? "pending" : "suspended"),
      };
    }
    throw requestError;
  }
}

export async function loadWorkspace<T>() {
  const result = await rustApi<{ nodes: T }>("/v1/workspace");
  return result.nodes ?? null;
}

export async function saveWorkspace(nodes: unknown[]) {
  await rustApi("/v1/workspace", { method: "PUT", body: jsonBody({ nodes }) });
}

export async function listMembers() {
  const [members, me] = await Promise.all([
    rustApi<Member[]>("/v1/members"),
    rustApi<{ role: MemberRole }>("/v1/me"),
  ]);
  const withRoles = await Promise.all(members.map(async (member) => ({
    ...member,
    jobRoles: await listRolesForMember(member.id).catch(() => []),
  })));
  return { members: withRoles, canManage: me.role === "owner" || me.role === "admin" };
}

export async function updateMember(id: string, updates: Partial<Member>) {
  const member = await rustApi<Member>(`/v1/members/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: jsonBody(updates),
  });
  return { ...member, jobRoles: await listRolesForMember(id).catch(() => []) };
}

export async function inviteMember(input: {
  email: string;
  name: string;
  jobTitle: string;
  area: string;
  role: "admin" | "manager" | "member" | "viewer";
}) {
  const member = await rustApi<Member>("/v1/members", {
    method: "POST",
    body: jsonBody(input),
  });
  let emailSent = true;
  try { await requestMagicLink(input.email); } catch { emailSent = false; }
  return { member: { ...member, jobRoles: [] }, emailSent };
}

export async function listJobRoles() {
  return rustApi<JobRole[]>("/v1/job-roles");
}

export async function createJobRole(input: Omit<JobRole, "id">) {
  return rustApi<JobRole>("/v1/job-roles", { method: "POST", body: jsonBody(input) });
}

export async function updateJobRole(id: string, input: Partial<Omit<JobRole, "id">>) {
  const current = (await listJobRoles()).find((role) => role.id === id);
  if (!current) throw new Error("job_role_not_found");
  return rustApi<JobRole>(`/v1/job-roles/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: jsonBody({ ...current, ...input }),
  });
}

export async function deleteJobRole(id: string) {
  await rustApi(`/v1/job-roles/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function listRolesForMember(memberId: string) {
  return rustApi<JobRole[]>(`/v1/members/${encodeURIComponent(memberId)}/job-roles`);
}

export async function setMemberJobRoles(memberId: string, roleIds: string[]) {
  return rustApi<JobRole[]>(`/v1/members/${encodeURIComponent(memberId)}/job-roles`, {
    method: "PUT",
    body: jsonBody({ roleIds }),
  });
}

export async function uploadOwnAvatar(memberId: string, file: File) {
  const form = new FormData();
  form.set("file", file, file.name);
  await rustApiUpload("/v1/profile/avatar", form);
  const team = await listMembers();
  const member = team.members.find((item) => item.id === memberId);
  if (!member) throw new Error("member_not_found");
  return member;
}

export async function updateOwnProfile(memberId: string, name: string, avatarPath?: string | null) {
  const member = await rustApi<Member>("/v1/profile", {
    method: "PATCH",
    body: jsonBody({ name, avatarPath }),
  });
  return { ...member, jobRoles: await listRolesForMember(memberId).catch(() => []) };
}

export async function removeOwnAvatar(memberId: string, _currentPath: string) {
  const member = await rustApi<Member>("/v1/profile", {
    method: "PATCH",
    body: jsonBody({ clearAvatar: true }),
  });
  return { ...member, jobRoles: await listRolesForMember(memberId).catch(() => []) };
}

export async function loadCollaboration() {
  return rustApi<{
    spaces: CollaborationSpace[];
    categories: ChannelCategory[];
    channels: LabstarChannel[];
  }>("/v1/collaboration");
}

export async function createSpace(
  input: Pick<CollaborationSpace, "name" | "description" | "kind" | "color">,
  _createdBy: string,
) {
  return rustApi<CollaborationSpace>("/v1/spaces", { method: "POST", body: jsonBody(input) });
}

export async function updateSpace(
  spaceId: string,
  patch: Partial<Pick<CollaborationSpace, "name" | "description" | "kind" | "color" | "logoPath">>,
) {
  return rustApi<CollaborationSpace>(`/v1/spaces/${encodeURIComponent(spaceId)}`, {
    method: "PATCH",
    body: jsonBody(patch),
  });
}

export async function uploadSpaceLogo(spaceId: string, file: File) {
  const form = new FormData();
  form.set("file", file, file.name);
  return rustApiUpload<{ path: string; url: string }>(
    `/v1/spaces/${encodeURIComponent(spaceId)}/logo`,
    form,
  );
}

export async function createCategory(spaceId: string, name: string) {
  return rustApi<ChannelCategory>("/v1/categories", {
    method: "POST",
    body: jsonBody({ spaceId, name }),
  });
}

export async function createChannel(input: {
  spaceId: string;
  categoryId: string;
  name: string;
  description: string;
  type: LabstarChannel["type"];
  createdBy: string;
}) {
  return rustApi<LabstarChannel>("/v1/channels", {
    method: "POST",
    body: jsonBody(input),
  });
}

export async function listIntegrationRules(spaceId: string) {
  return rustApi<IntegrationRule[]>(`/v1/integrations?spaceId=${encodeURIComponent(spaceId)}`);
}

export async function saveIntegrationRule(rule: IntegrationRule) {
  return rustApi<IntegrationRule>("/v1/integrations", {
    method: "PUT",
    body: jsonBody({ ...rule, channelId: rule.channelId || null, renewalDate: rule.renewalDate || null }),
  });
}

export async function removeIntegrationRule(id: string) {
  await rustApi(`/v1/integrations/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function listMessages(channelId: string) {
  return rustApi<ChannelMessage[]>(`/v1/channels/${encodeURIComponent(channelId)}/messages`);
}

export async function sendMessage(input: {
  channelId: string;
  spaceId: string;
  authorId: string;
  body: string;
  replyTo?: string | null;
  files?: File[];
}) {
  const files = (input.files ?? []).slice(0, 8);
  const body = input.body.trim() || (files.some((file) => file.type.startsWith("image/"))
    ? "Enviou uma imagem"
    : `Enviou ${files.length} arquivo(s)`);
  const message = await rustApi<{ id: string; channelId: string }>(
    `/v1/channels/${encodeURIComponent(input.channelId)}/messages`,
    { method: "POST", body: jsonBody({ body, replyTo: input.replyTo ?? null }) },
  );
  for (const file of files) {
    const form = new FormData();
    form.set("spaceId", input.spaceId);
    form.set("channelId", input.channelId);
    form.set("messageId", message.id);
    form.set("file", file, file.name);
    await rustApiUpload("/v1/channel-attachments", form);
  }
  return message;
}

export async function editMessage(messageId: string, body: string) {
  await rustApi(`/v1/channel-messages/${encodeURIComponent(messageId)}`, {
    method: "PATCH", body: jsonBody({ body }),
  });
}

export async function pinMessage(messageId: string, isPinned: boolean) {
  await rustApi(`/v1/channel-messages/${encodeURIComponent(messageId)}`, {
    method: "PATCH", body: jsonBody({ isPinned }),
  });
}

export async function deleteMessage(messageId: string) {
  await rustApi(`/v1/channel-messages/${encodeURIComponent(messageId)}`, { method: "DELETE" });
}

export async function listNotifications(_memberId: string) {
  return rustApi<LabstarNotification[]>("/v1/notifications");
}

export async function markNotificationRead(id: string) {
  await rustApi(`/v1/notifications/${encodeURIComponent(id)}/read`, { method: "POST" });
}

export async function markAllNotificationsRead(_memberId: string) {
  await rustApi("/v1/notifications/read-all", { method: "POST" });
}

export type TableSubscription = { close: () => void };

export function subscribeToTable(
  _table: "channel_messages" | "channel_message_attachments" | "notifications",
  _filter: string,
  onChange: () => void,
): TableSubscription {
  let closed = false;
  let current: RustRealtimeSubscription | null = null;
  void subscribeRustRealtime(() => { if (!closed) onChange(); })
    .then((subscription) => {
      if (closed) subscription.close();
      else current = subscription;
    })
    .catch(() => undefined);
  return { close: () => { closed = true; current?.close(); } };
}

export function unsubscribe(subscription: TableSubscription | null) {
  subscription?.close();
}

export async function listSocialPosts(spaceId: string) {
  return rustApi<SocialPost[]>(`/v1/social-posts?spaceId=${encodeURIComponent(spaceId)}`);
}

export async function saveSocialPost(
  post: Partial<SocialPost> & Pick<SocialPost, "spaceId" | "title" | "status">,
  ownerId: string,
) {
  return rustApi<SocialPost>("/v1/social-posts", {
    method: "PUT",
    body: jsonBody({ ...post, ownerId: post.ownerId ?? ownerId }),
  });
}

export async function deleteSocialPost(id: string) {
  await rustApi(`/v1/social-posts/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function listMeetings(channelId: string) {
  return rustApi<ScheduledMeeting[]>(`/v1/meetings?channelId=${encodeURIComponent(channelId)}`);
}

export async function createMeeting(input: {
  channelId: string;
  title: string;
  agenda: string;
  startsAt: string;
  durationMinutes: number;
  createdBy: string;
  attendeeIds: string[];
}) {
  return rustApi<ScheduledMeeting>("/v1/meetings", {
    method: "POST",
    body: jsonBody(input),
  });
}

export async function cancelMeeting(id: string) {
  await rustApi(`/v1/meetings/${encodeURIComponent(id)}/cancel`, { method: "POST" });
}

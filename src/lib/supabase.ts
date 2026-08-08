import { type RealtimeChannel, type SupabaseClient, type User } from "@supabase/supabase-js";
import { secureSignOut } from "./access";
import { BackendApiError, getBackendIdentity, type BackendMember } from "./backend";
import { authClient } from "./auth-client";

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

export type MemberRemovalResult = {
  outcome: "removed" | "suspended";
  member: Member | null;
  reason: string;
};

export type AccountDeletionResult = {
  outcome: "deleted";
  memberId: string | null;
  authIdentityDeleted: boolean;
};

type MemberRow = {
  id: string;
  email: string;
  name: string;
  status: MemberStatus;
  role: MemberRole;
  job_title: string;
  area: string;
  assignments: string[] | null;
  created_at: string;
  last_seen_at: string;
  avatar_path?: string | null;
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

export const isSupabaseConfigured = Boolean(authClient);
export const supabaseClient: SupabaseClient | null = authClient;

function requireClient() {
  if (!supabaseClient) throw new Error("supabase_not_configured");
  return supabaseClient;
}

async function signedAssetUrl(path?: string | null, expiresIn = 60 * 60 * 8) {
  if (!path) return "";
  const { data, error } = await requireClient().storage.from("labstar-files").createSignedUrl(path, expiresIn);
  return error ? "" : data.signedUrl;
}

function jobRoleFromRow(row: Record<string, unknown>): JobRole {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    department: String(row.department ?? "Outros"),
    color: String(row.color ?? "#8baeff"),
    icon: String(row.icon ?? "★"),
    position: Number(row.position ?? 100),
    permissions: Array.isArray(row.permissions) ? row.permissions.map(String) : [],
  };
}

async function memberFromRow(row: MemberRow, jobRoles: JobRole[] = []): Promise<Member> {
  const avatarPath = row.avatar_path ?? "";
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    status: row.status,
    role: row.role,
    jobTitle: row.job_title ?? "",
    area: row.area ?? "",
    assignments: Array.isArray(row.assignments) ? row.assignments : [],
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    avatarPath,
    avatarUrl: await signedAssetUrl(avatarPath),
    jobRoles,
  };
}

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

async function enrichAuthorizedMember(member: Member): Promise<Member> {
  try {
    const { data, error } = await requireClient()
      .from("members")
      .select("*")
      .eq("id", member.id)
      .maybeSingle();
    if (error || !data) return member;
    const roles = await listRolesForMember(member.id);
    return memberFromRow(data as MemberRow, roles);
  } catch {
    return member;
  }
}

function fallbackBlockedMember(user: User, status: "pending" | "suspended"): Member {
  const email = user.email?.trim().toLowerCase() ?? "";
  const metadataName = String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? "").trim();
  return {
    id: user.id,
    email,
    name: metadataName || email.split("@")[0] || "Membro Labstar",
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

function memberToUpdates(updates: Partial<Member>) {
  const patch: Record<string, unknown> = {};
  if (typeof updates.name === "string") patch.name = updates.name.trim();
  if (updates.status) patch.status = updates.status;
  if (updates.role) patch.role = updates.role;
  if (typeof updates.jobTitle === "string") patch.job_title = updates.jobTitle.trim();
  if (typeof updates.area === "string") patch.area = updates.area.trim();
  if (Array.isArray(updates.assignments)) patch.assignments = updates.assignments;
  if (typeof updates.avatarPath === "string") patch.avatar_path = updates.avatarPath || null;
  return patch;
}

export async function requestMagicLink(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const { error } = await requireClient().auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: window.location.origin,
    },
  });
  if (error) throw error;
}

export async function signOut() {
  await secureSignOut();
}

export async function getCurrentIdentity(): Promise<{ user: User; member: Member | null } | null> {
  const supabase = requireClient();
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session?.user?.email) return null;

  try {
    const identity = await getBackendIdentity(session.access_token);
    const authorized = memberFromBackend({ ...identity.member, email: identity.email });
    return { user: session.user, member: await enrichAuthorizedMember(authorized) };
  } catch (error) {
    if (!(error instanceof BackendApiError)) throw error;

    if (error.code === "member_not_authorized") {
      return { user: session.user, member: null };
    }

    if (error.code === "member_pending" || error.code === "member_suspended") {
      const status = error.code === "member_pending" ? "pending" : "suspended";
      try {
        const email = session.user.email.trim().toLowerCase();
        const { data } = await supabase
          .from("members")
          .select("*")
          .eq("email", email)
          .maybeSingle();
        if (data) {
          const roles = await listRolesForMember(String(data.id));
          return { user: session.user, member: await memberFromRow(data as MemberRow, roles) };
        }
      } catch {
        // O estado de autorização vem do Rust; o Supabase é apenas enriquecimento visual.
      }
      return { user: session.user, member: fallbackBlockedMember(session.user, status) };
    }

    throw error;
  }
}

export async function loadWorkspace<T>() {
  const { data, error } = await requireClient()
    .from("workspaces")
    .select("nodes")
    .eq("id", "labstar-main")
    .maybeSingle();
  if (error) throw error;
  return (data?.nodes ?? null) as T | null;
}

export async function saveWorkspace(nodes: unknown[]) {
  const { error } = await requireClient()
    .from("workspaces")
    .upsert({
      id: "labstar-main",
      nodes,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
  if (error) throw error;
}

export async function listMembers() {
  const identity = await getCurrentIdentity();
  if (!identity?.member) throw new Error("member_not_found");
  const canManage = identity.member.role === "owner" || identity.member.role === "admin";
  const { data, error } = await requireClient()
    .from("members")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  const { data: assignmentRows, error: assignmentError } = await requireClient()
    .from("member_job_roles")
    .select("member_id,job_role:job_roles(*)");
  if (assignmentError) throw assignmentError;
  const rolesByMember = new Map<string, JobRole[]>();
  for (const assignment of assignmentRows ?? []) {
    const roleValue = (assignment as { job_role?: Record<string, unknown> | Record<string, unknown>[] | null }).job_role;
    const roleRow = Array.isArray(roleValue) ? roleValue[0] : roleValue;
    if (!roleRow) continue;
    const memberId = String((assignment as { member_id: string }).member_id);
    rolesByMember.set(memberId, [...(rolesByMember.get(memberId) ?? []), jobRoleFromRow(roleRow)]);
  }
  return {
    members: await Promise.all((data as MemberRow[])
      .filter((row) => !row.email.toLocaleLowerCase().endsWith("@labstar.invalid"))
      .map((row) => memberFromRow(row, rolesByMember.get(row.id) ?? []))),
    canManage,
  };
}

export async function updateMember(id: string, updates: Partial<Member>) {
  const { data, error } = await requireClient()
    .from("members")
    .update(memberToUpdates(updates))
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  const roles = await listRolesForMember(id);
  return memberFromRow(data as MemberRow, roles);
}

function memberRemovalError(code: string) {
  return Object.assign(new Error(code), { code });
}

export async function removeTeamMember(id: string): Promise<MemberRemovalResult> {
  const identity = await getCurrentIdentity();
  if (!identity?.member) throw memberRemovalError("member_not_authorized");
  if (identity.member.role !== "owner" && identity.member.role !== "admin") {
    throw memberRemovalError("permission_denied");
  }
  if (identity.member.id === id) throw memberRemovalError("self_removal_forbidden");

  const client = requireClient();
  const { data: targetData, error: targetError } = await client
    .from("members")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (targetError) throw targetError;
  if (!targetData) throw memberRemovalError("member_not_found");
  const target = targetData as MemberRow;
  if (target.role === "owner") throw memberRemovalError("owner_removal_forbidden");

  const { data, error } = await client.rpc("remove_team_member", { target_member_id: id });
  if (!error) {
    const row = (Array.isArray(data) ? data[0] : data) as { outcome?: string; reason?: string } | null;
    if (row?.outcome === "removed") {
      return { outcome: "removed", member: null, reason: row.reason ?? "access_removed" };
    }
    if (row?.outcome === "suspended") {
      const roles = await listRolesForMember(id);
      const { data: suspendedData, error: suspendedError } = await client.from("members").select("*").eq("id", id).single();
      if (suspendedError) throw suspendedError;
      return {
        outcome: "suspended",
        member: await memberFromRow(suspendedData as MemberRow, roles),
        reason: row.reason ?? "history_preserved",
      };
    }
    throw memberRemovalError("invalid_removal_response");
  }

  const missingRpc = error.code === "PGRST202"
    || error.message?.toLocaleLowerCase().includes("schema cache")
    || error.message?.toLocaleLowerCase().includes("could not find the function");
  if (!missingRpc) throw error;

  const suspended = await updateMember(id, { status: "suspended" });
  return {
    outcome: "suspended",
    member: suspended,
    reason: "safe_fallback",
  };
}

function accountDeletionError(error: { code?: string; message?: string }) {
  const text = `${error.code ?? ""} ${error.message ?? ""}`.toLocaleLowerCase();
  const knownCodes = [
    "self_deletion_forbidden",
    "owner_deletion_forbidden",
    "owner_required",
    "member_must_be_suspended",
    "confirmation_email_mismatch",
    "account_not_found",
    "permission_denied",
    "member_not_authorized",
  ];
  const known = knownCodes.find((code) => text.includes(code));
  return memberRemovalError(known ?? error.code ?? "account_deletion_failed");
}

export async function permanentlyDeleteTeamAccount(
  email: string,
  confirmationEmail: string,
): Promise<AccountDeletionResult> {
  const normalizedEmail = email.trim().toLocaleLowerCase();
  const normalizedConfirmation = confirmationEmail.trim().toLocaleLowerCase();
  if (!normalizedEmail || normalizedEmail !== normalizedConfirmation) {
    throw memberRemovalError("confirmation_email_mismatch");
  }

  const { data, error } = await requireClient().rpc("delete_labstar_account", {
    target_email: normalizedEmail,
    confirmation_email: normalizedConfirmation,
  });
  if (error) throw accountDeletionError(error);

  const row = (Array.isArray(data) ? data[0] : data) as {
    outcome?: string;
    member_id?: string | null;
    auth_identity_deleted?: boolean;
  } | null;
  if (row?.outcome !== "deleted") throw memberRemovalError("invalid_account_deletion_response");
  return {
    outcome: "deleted",
    memberId: row.member_id ?? null,
    authIdentityDeleted: Boolean(row.auth_identity_deleted),
  };
}

export async function inviteMember(input: {
  email: string;
  name: string;
  jobTitle: string;
  area: string;
  role: "admin" | "manager" | "member" | "viewer";
}) {
  const email = input.email.trim().toLowerCase();
  const { data, error } = await requireClient()
    .from("members")
    .insert({
      email,
      name: input.name.trim() || email.split("@")[0],
      status: "active",
      role: input.role,
      job_title: input.jobTitle.trim(),
      area: input.area.trim(),
      assignments: [],
    })
    .select("*")
    .single();

  if (error) throw error;

  let emailSent = true;
  try {
    await requestMagicLink(email);
  } catch {
    emailSent = false;
  }

  return { member: await memberFromRow(data as MemberRow), emailSent };
}

export async function listJobRoles() {
  const { data, error } = await requireClient()
    .from("job_roles")
    .select("*")
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => jobRoleFromRow(row as Record<string, unknown>));
}

export async function createJobRole(input: Omit<JobRole, "id">) {
  const { data, error } = await requireClient().from("job_roles").insert({
    name: input.name.trim(),
    department: input.department.trim() || "Outros",
    color: input.color,
    icon: "star",
    position: input.position,
    permissions: input.permissions,
  }).select("*").single();
  if (error) throw error;
  return jobRoleFromRow(data as Record<string, unknown>);
}

export async function updateJobRole(id: string, input: Partial<Omit<JobRole, "id">>) {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.department !== undefined) patch.department = input.department.trim() || "Outros";
  if (input.color !== undefined) patch.color = input.color;
  if (input.position !== undefined) patch.position = input.position;
  if (input.permissions !== undefined) patch.permissions = input.permissions;
  patch.icon = "star";
  const { data, error } = await requireClient().from("job_roles").update(patch).eq("id", id).select("*").single();
  if (error) throw error;
  return jobRoleFromRow(data as Record<string, unknown>);
}

export async function deleteJobRole(id: string) {
  const { error } = await requireClient().from("job_roles").delete().eq("id", id);
  if (error) throw error;
}

export async function listRolesForMember(memberId: string) {
  const { data, error } = await requireClient()
    .from("member_job_roles")
    .select("job_role:job_roles(*)")
    .eq("member_id", memberId);
  if (error) return [];
  return (data ?? []).flatMap((row) => {
    const value = (row as { job_role?: Record<string, unknown> | Record<string, unknown>[] | null }).job_role;
    const role = Array.isArray(value) ? value[0] : value;
    return role ? [jobRoleFromRow(role)] : [];
  }).sort((a, b) => a.position - b.position);
}

export async function setMemberJobRoles(memberId: string, roleIds: string[]) {
  const supabase = requireClient();
  const { error: deleteError } = await supabase.from("member_job_roles").delete().eq("member_id", memberId);
  if (deleteError) throw deleteError;
  if (roleIds.length) {
    const { error: insertError } = await supabase.from("member_job_roles").insert(
      roleIds.map((jobRoleId, index) => ({ member_id: memberId, job_role_id: jobRoleId, is_primary: index === 0 })),
    );
    if (insertError) throw insertError;
  }
  return listRolesForMember(memberId);
}

function safeFileName(name: string) {
  const parts = name.split(".");
  const extension = parts.length > 1 ? `.${parts.pop()!.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8)}` : "";
  const stem = parts.join(".").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 70) || "arquivo";
  return `${stem}${extension}`;
}

export async function uploadOwnAvatar(memberId: string, file: File) {
  if (!file.type.startsWith("image/")) throw new Error("invalid_image");
  if (file.size > 5 * 1024 * 1024) throw new Error("image_too_large");
  const path = `avatars/${memberId}/${Date.now()}-${safeFileName(file.name)}`;
  const { error: uploadError } = await requireClient().storage.from("labstar-files").upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) throw uploadError;
  const { data, error } = await requireClient().rpc("update_own_profile", {
    new_name: null,
    new_avatar_path: path,
  });
  if (error) throw error;
  const roles = await listRolesForMember(memberId);
  return memberFromRow((Array.isArray(data) ? data[0] : data) as MemberRow, roles);
}

export async function updateOwnProfile(memberId: string, name: string, avatarPath?: string | null) {
  const { data, error } = await requireClient().rpc("update_own_profile", {
    new_name: name.trim() || null,
    new_avatar_path: avatarPath === undefined ? null : avatarPath,
  });
  if (error) throw error;
  const roles = await listRolesForMember(memberId);
  return memberFromRow((Array.isArray(data) ? data[0] : data) as MemberRow, roles);
}

export async function removeOwnAvatar(memberId: string, currentPath: string) {
  const { data, error } = await requireClient().rpc("clear_own_avatar");
  if (error) throw error;
  if (currentPath) await requireClient().storage.from("labstar-files").remove([currentPath]);
  const roles = await listRolesForMember(memberId);
  return memberFromRow((Array.isArray(data) ? data[0] : data) as MemberRow, roles);
}

export async function loadCollaboration() {
  const supabase = requireClient();
  const [{ data: spaceRows, error: spacesError }, { data: categoryRows, error: categoriesError }, { data: channelRows, error: channelsError }] = await Promise.all([
    supabase.from("collaboration_spaces").select("*").order("position"),
    supabase.from("channel_categories").select("*").order("position"),
    supabase.from("channels").select("*").order("position"),
  ]);
  if (spacesError) throw spacesError;
  if (categoriesError) throw categoriesError;
  if (channelsError) throw channelsError;
  const spaces: CollaborationSpace[] = await Promise.all((spaceRows ?? []).map(async (row) => ({
    id: String(row.id),
    name: String(row.name),
    description: String(row.description ?? ""),
    kind: row.kind as CollaborationSpace["kind"],
    color: String(row.color ?? "#8baeff"),
    icon: String(row.icon ?? "★"),
    logoPath: String(row.logo_path ?? ""),
    logoUrl: await signedAssetUrl(row.logo_path),
    position: Number(row.position ?? 100),
  })));
  const categories: ChannelCategory[] = (categoryRows ?? []).map((row) => ({
    id: String(row.id),
    spaceId: String(row.space_id),
    name: String(row.name),
    position: Number(row.position ?? 100),
  }));
  const channels: LabstarChannel[] = (channelRows ?? []).map((row) => ({
    id: String(row.id),
    spaceId: String(row.space_id),
    categoryId: row.category_id ? String(row.category_id) : null,
    name: String(row.name),
    description: String(row.description ?? ""),
    type: row.type as LabstarChannel["type"],
    allowedRoles: Array.isArray(row.allowed_roles) ? row.allowed_roles as MemberRole[] : [],
    allowedAssignments: Array.isArray(row.allowed_assignments) ? row.allowed_assignments.map(String) : [],
    position: Number(row.position ?? 100),
  }));
  return { spaces, categories, channels };
}

export async function createSpace(input: Pick<CollaborationSpace, "name" | "description" | "kind" | "color">, createdBy: string) {
  const { data, error } = await requireClient().from("collaboration_spaces").insert({
    name: input.name.trim(),
    description: input.description.trim(),
    kind: input.kind,
    color: input.color,
    icon: "★",
    created_by: createdBy,
  }).select("*").single();
  if (error) throw error;
  return data;
}

export async function updateSpace(spaceId: string, patch: Partial<Pick<CollaborationSpace, "name" | "description" | "kind" | "color" | "logoPath">>) {
  const updates: Record<string, unknown> = {};
  if (patch.name !== undefined) updates.name = patch.name.trim();
  if (patch.description !== undefined) updates.description = patch.description.trim();
  if (patch.kind !== undefined) updates.kind = patch.kind;
  if (patch.color !== undefined) updates.color = patch.color;
  if (patch.logoPath !== undefined) updates.logo_path = patch.logoPath || null;
  const { error } = await requireClient().from("collaboration_spaces").update(updates).eq("id", spaceId);
  if (error) throw error;
}

export async function uploadSpaceLogo(spaceId: string, file: File) {
  if (!file.type.startsWith("image/")) throw new Error("invalid_image");
  if (file.size > 5 * 1024 * 1024) throw new Error("image_too_large");
  const path = `spaces/${spaceId}/logo-${Date.now()}-${safeFileName(file.name)}`;
  const { error } = await requireClient().storage.from("labstar-files").upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;
  await updateSpace(spaceId, { logoPath: path });
  return { path, url: await signedAssetUrl(path) };
}

export async function createCategory(spaceId: string, name: string) {
  const { data, error } = await requireClient().from("channel_categories").insert({
    space_id: spaceId,
    name: name.trim(),
  }).select("*").single();
  if (error) throw error;
  return data;
}

export async function createChannel(input: {
  spaceId: string;
  categoryId: string;
  name: string;
  description: string;
  type: LabstarChannel["type"];
  createdBy: string;
}) {
  const { data, error } = await requireClient().from("channels").insert({
    space_id: input.spaceId,
    category_id: input.categoryId,
    name: input.name.trim().toLowerCase().replace(/\s+/g, "-"),
    description: input.description.trim(),
    type: input.type,
    created_by: input.createdBy,
  }).select("*").single();
  if (error) throw error;
  return data;
}

export async function listIntegrationRules(spaceId: string) {
  const { data, error } = await requireClient().from("integration_rules").select("*").eq("space_id", spaceId).order("created_at");
  if (error) throw error;
  return (data ?? []).map((row): IntegrationRule => ({
    id: String(row.id),
    spaceId: String(row.space_id),
    provider: row.provider as IntegrationRule["provider"],
    name: String(row.name),
    endpoint: String(row.endpoint ?? ""),
    channelId: String(row.channel_id ?? ""),
    events: Array.isArray(row.events) ? row.events.map(String) : [],
    enabled: Boolean(row.enabled),
    renewalDate: String(row.renewal_date ?? ""),
  }));
}

export async function saveIntegrationRule(rule: IntegrationRule) {
  const { data, error } = await requireClient().from("integration_rules").upsert({
    id: rule.id,
    space_id: rule.spaceId,
    provider: rule.provider,
    name: rule.name.trim(),
    endpoint: rule.endpoint.trim(),
    channel_id: rule.channelId || null,
    events: rule.events,
    enabled: rule.enabled,
    renewal_date: rule.renewalDate || null,
    updated_at: new Date().toISOString(),
  }).select("*").single();
  if (error) throw error;
  return data;
}

export async function removeIntegrationRule(id: string) {
  const { error } = await requireClient().from("integration_rules").delete().eq("id", id);
  if (error) throw error;
}

export async function listMessages(channelId: string) {
  const { data, error } = await requireClient()
    .from("channel_messages")
    .select("*,author:members!channel_messages_author_id_fkey(id,name,email,avatar_path,job_title),attachments:channel_message_attachments(*)")
    .eq("channel_id", channelId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw error;
  const authorIds = [...new Set((data ?? []).map((row) => String(row.author_id)))];
  const rolesByAuthor = new Map<string, JobRole[]>();
  await Promise.all(authorIds.map(async (id) => rolesByAuthor.set(id, await listRolesForMember(id))));
  return Promise.all((data ?? []).map(async (row) => {
    const authorValue = row.author as Record<string, unknown> | Record<string, unknown>[] | null;
    const authorRow = Array.isArray(authorValue) ? authorValue[0] : authorValue;
    const avatarPath = String(authorRow?.avatar_path ?? "");
    const attachments = await Promise.all(((row.attachments ?? []) as Record<string, unknown>[]).map(async (file) => ({
      id: String(file.id),
      messageId: String(file.message_id),
      fileName: String(file.file_name),
      filePath: String(file.file_path),
      mimeType: String(file.mime_type),
      sizeBytes: Number(file.size_bytes),
      url: await signedAssetUrl(String(file.file_path), 60 * 60),
    })));
    return {
      id: String(row.id),
      channelId: String(row.channel_id),
      authorId: String(row.author_id),
      body: String(row.body),
      createdAt: String(row.created_at),
      editedAt: row.edited_at ? String(row.edited_at) : null,
      replyTo: row.reply_to ? String(row.reply_to) : null,
      isPinned: Boolean(row.is_pinned),
      author: authorRow ? {
        id: String(authorRow.id),
        name: String(authorRow.name),
        email: String(authorRow.email),
        avatarPath,
        avatarUrl: await signedAssetUrl(avatarPath),
        jobTitle: String(authorRow.job_title ?? ""),
        jobRoles: rolesByAuthor.get(String(authorRow.id)) ?? [],
      } : null,
      attachments,
    } satisfies ChannelMessage;
  }));
}

export async function sendMessage(input: {
  channelId: string;
  spaceId: string;
  authorId: string;
  body: string;
  replyTo?: string | null;
  files?: File[];
}) {
  const files = input.files ?? [];
  const body = input.body.trim() || (files.some((file) => file.type.startsWith("image/")) ? "Enviou uma imagem" : `Enviou ${files.length} arquivo(s)`);
  const { data: message, error } = await requireClient().from("channel_messages").insert({
    channel_id: input.channelId,
    author_id: input.authorId,
    body,
    reply_to: input.replyTo ?? null,
  }).select("*").single();
  if (error) throw error;
  for (const file of files.slice(0, 8)) {
    if (file.size > 20 * 1024 * 1024) throw new Error("file_too_large");
    const path = `spaces/${input.spaceId}/channels/${input.channelId}/${message.id}/${Date.now()}-${safeFileName(file.name)}`;
    const { error: uploadError } = await requireClient().storage.from("labstar-files").upload(path, file, {
      cacheControl: "3600",
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (uploadError) throw uploadError;
    const { error: attachmentError } = await requireClient().from("channel_message_attachments").insert({
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

export async function editMessage(messageId: string, body: string) {
  const { error } = await requireClient().from("channel_messages").update({
    body: body.trim(),
    edited_at: new Date().toISOString(),
  }).eq("id", messageId);
  if (error) throw error;
}

export async function pinMessage(messageId: string, isPinned: boolean) {
  const { error } = await requireClient().from("channel_messages").update({ is_pinned: isPinned }).eq("id", messageId);
  if (error) throw error;
}

export async function deleteMessage(messageId: string) {
  const { error } = await requireClient().from("channel_messages").delete().eq("id", messageId);
  if (error) throw error;
}

export async function listNotifications(memberId: string) {
  const { data, error } = await requireClient().from("notifications")
    .select("*")
    .eq("recipient_id", memberId)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String(row.id),
    title: String(row.title),
    body: String(row.body),
    channelId: row.channel_id ? String(row.channel_id) : null,
    isRead: Boolean(row.is_read),
    createdAt: String(row.created_at),
  } satisfies LabstarNotification));
}

export async function markNotificationRead(id: string) {
  const { error } = await requireClient().from("notifications").update({ is_read: true }).eq("id", id);
  if (error) throw error;
}

export async function markAllNotificationsRead(memberId: string) {
  const { error } = await requireClient().from("notifications").update({ is_read: true }).eq("recipient_id", memberId).eq("is_read", false);
  if (error) throw error;
}

export function subscribeToTable(table: "channel_messages" | "channel_message_attachments" | "notifications", filter: string, onChange: () => void): RealtimeChannel {
  const subscriptionId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const channel = requireClient().channel(`labstar-${table}-${filter || "all"}-${subscriptionId}`);
  return channel
    .on("postgres_changes", filter
      ? { event: "*", schema: "public", table, filter }
      : { event: "*", schema: "public", table }, onChange)
    .subscribe();
}

export function unsubscribe(channel: RealtimeChannel | null) {
  if (channel) void requireClient().removeChannel(channel);
}

export async function listSocialPosts(spaceId: string) {
  const { data, error } = await requireClient().from("social_posts").select("*").eq("space_id", spaceId).order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String(row.id),
    spaceId: String(row.space_id),
    title: String(row.title),
    content: String(row.content ?? ""),
    platforms: Array.isArray(row.platforms) ? row.platforms.map(String) : [],
    status: row.status as SocialPost["status"],
    scheduledFor: row.scheduled_for ? String(row.scheduled_for) : null,
    ownerId: row.owner_id ? String(row.owner_id) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  } satisfies SocialPost));
}

export async function saveSocialPost(post: Partial<SocialPost> & Pick<SocialPost, "spaceId" | "title" | "status">, ownerId: string) {
  const payload = {
    id: post.id || undefined,
    space_id: post.spaceId,
    title: post.title.trim(),
    content: post.content?.trim() ?? "",
    platforms: post.platforms ?? [],
    status: post.status,
    scheduled_for: post.scheduledFor || null,
    owner_id: post.ownerId ?? ownerId,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await requireClient().from("social_posts").upsert(payload).select("*").single();
  if (error) throw error;
  return data;
}

export async function deleteSocialPost(id: string) {
  const { error } = await requireClient().from("social_posts").delete().eq("id", id);
  if (error) throw error;
}

export async function listMeetings(channelId: string) {
  const { data, error } = await requireClient()
    .from("meetings")
    .select("*")
    .eq("channel_id", channelId)
    .neq("status", "cancelled")
    .order("starts_at", { ascending: true })
    .limit(30);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String(row.id),
    channelId: String(row.channel_id),
    title: String(row.title),
    agenda: String(row.agenda ?? ""),
    startsAt: String(row.starts_at),
    durationMinutes: Number(row.duration_minutes ?? 45),
    createdBy: row.created_by ? String(row.created_by) : null,
    attendeeIds: Array.isArray(row.attendee_ids) ? row.attendee_ids.map(String) : [],
    status: row.status as ScheduledMeeting["status"],
    createdAt: String(row.created_at),
  } satisfies ScheduledMeeting));
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
  const { data, error } = await requireClient().from("meetings").insert({
    channel_id: input.channelId,
    title: input.title.trim(),
    agenda: input.agenda.trim(),
    starts_at: input.startsAt,
    duration_minutes: input.durationMinutes,
    created_by: input.createdBy,
    attendee_ids: input.attendeeIds,
  }).select("*").single();
  if (error) throw error;
  return data;
}

export async function cancelMeeting(id: string) {
  const { error } = await requireClient().from("meetings").update({ status: "cancelled" }).eq("id", id);
  if (error) throw error;
}

import {
  getCurrentIdentity,
  listJobRoles,
  listMembers,
  supabaseClient,
  type JobRole,
  type Member,
  type MemberRole,
} from "./supabase";

export type ManagedChannelType = "text" | "announcement" | "rules" | "voice" | "social";

export type ChannelAccessConfig = {
  id: string;
  spaceId: string;
  categoryId: string | null;
  name: string;
  description: string;
  type: ManagedChannelType;
  isPrivate: boolean;
  readOnly: boolean;
  allowedRoles: MemberRole[];
  allowedJobRoleIds: string[];
  allowedMemberIds: string[];
  allowedAssignments: string[];
};

export type ChannelAccessDraft = Omit<ChannelAccessConfig, "id">;

export type ChannelAccessDirectory = {
  member: Member;
  members: Member[];
  jobRoles: JobRole[];
  canCreate: boolean;
  canManage: boolean;
};

function client() {
  if (!supabaseClient) throw new Error("supabase_not_configured");
  return supabaseClient;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? [...new Set(value.map(String).filter(Boolean))] : [];
}

function memberRoles(value: unknown): MemberRole[] {
  const valid = new Set<MemberRole>(["owner", "admin", "manager", "member", "viewer"]);
  return stringArray(value).filter((item): item is MemberRole => valid.has(item as MemberRole));
}

function rowToConfig(row: Record<string, unknown>): ChannelAccessConfig {
  return {
    id: String(row.id ?? ""),
    spaceId: String(row.space_id ?? ""),
    categoryId: row.category_id ? String(row.category_id) : null,
    name: String(row.name ?? "canal"),
    description: String(row.description ?? ""),
    type: (String(row.type ?? "text") as ManagedChannelType),
    isPrivate: Boolean(row.is_private),
    readOnly: Boolean(row.read_only),
    allowedRoles: memberRoles(row.allowed_roles),
    allowedJobRoleIds: stringArray(row.allowed_job_roles),
    allowedMemberIds: stringArray(row.allowed_member_ids),
    allowedAssignments: stringArray(row.allowed_assignments),
  };
}

function hasPermission(member: Member, permission: string) {
  return member.jobRoles.some((role) => role.permissions.includes(permission));
}

export function memberCanCreateChannels(member: Member) {
  return member.role === "owner"
    || member.role === "admin"
    || hasPermission(member, "manage_channels")
    || hasPermission(member, "create_channels");
}

export function memberCanManageChannels(member: Member) {
  return member.role === "owner"
    || member.role === "admin"
    || hasPermission(member, "manage_channels")
    || hasPermission(member, "manage_private_channels");
}

export async function loadChannelAccessDirectory(): Promise<ChannelAccessDirectory> {
  const identity = await getCurrentIdentity();
  if (!identity?.member) throw new Error("active_member_required");
  const [team, roles] = await Promise.all([listMembers(), listJobRoles()]);
  return {
    member: identity.member,
    members: team.members.filter((item) => item.status === "active"),
    jobRoles: roles,
    canCreate: memberCanCreateChannels(identity.member),
    canManage: memberCanManageChannels(identity.member),
  };
}

export async function listManagedChannels(): Promise<ChannelAccessConfig[]> {
  const { data, error } = await client()
    .from("channels")
    .select("id,space_id,category_id,name,description,type,is_private,read_only,allowed_roles,allowed_job_roles,allowed_member_ids,allowed_assignments")
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => rowToConfig(row as Record<string, unknown>));
}

export async function loadManagedChannel(channelId: string): Promise<ChannelAccessConfig> {
  const { data, error } = await client()
    .from("channels")
    .select("id,space_id,category_id,name,description,type,is_private,read_only,allowed_roles,allowed_job_roles,allowed_member_ids,allowed_assignments")
    .eq("id", channelId)
    .single();
  if (error) throw error;
  return rowToConfig(data as Record<string, unknown>);
}

function normalizedName(value: string) {
  return value.trim().toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-_ ]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "canal";
}

function payload(input: ChannelAccessDraft) {
  const selectedRoles = input.isPrivate
    ? [...new Set<MemberRole>(["owner", "admin", ...input.allowedRoles.filter((role) => role !== "owner" && role !== "admin")])]
    : [];
  return {
    space_id: input.spaceId,
    category_id: input.categoryId,
    name: normalizedName(input.name),
    description: input.description.trim(),
    type: input.type,
    is_private: input.isPrivate,
    read_only: input.readOnly,
    allowed_roles: selectedRoles,
    allowed_job_roles: input.isPrivate ? [...new Set(input.allowedJobRoleIds)] : [],
    allowed_member_ids: input.isPrivate ? [...new Set(input.allowedMemberIds)] : [],
    allowed_assignments: input.isPrivate ? [...new Set(input.allowedAssignments)] : [],
  };
}

export async function createManagedChannel(input: ChannelAccessDraft, createdBy: string) {
  const { data, error } = await client().from("channels").insert({
    ...payload(input),
    created_by: createdBy,
  }).select("*").single();
  if (error) throw error;
  return rowToConfig(data as Record<string, unknown>);
}

export async function updateManagedChannel(channelId: string, input: ChannelAccessDraft) {
  const { data, error } = await client().from("channels")
    .update(payload(input))
    .eq("id", channelId)
    .select("*")
    .single();
  if (error) throw error;
  return rowToConfig(data as Record<string, unknown>);
}

export async function deleteManagedChannel(channelId: string) {
  const { error } = await client().from("channels").delete().eq("id", channelId);
  if (error) throw error;
}

export function channelAccessErrorMessage(error: unknown) {
  const value = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  const text = `${value?.code ?? ""} ${value?.message ?? ""} ${value?.details ?? ""} ${value?.hint ?? ""}`.toLocaleLowerCase();
  if (/42703|pgrst204|allowed_job_roles|allowed_member_ids|is_private|read_only|schema cache/.test(text)) {
    return "A atualização de privacidade dos canais ainda está sendo aplicada no banco.";
  }
  if (/permission|denied|42501|manage_channels|create_channels/.test(text)) {
    return "Sua conta não tem permissão para alterar este canal.";
  }
  if (/duplicate|23505/.test(text)) {
    return "Já existe um canal com esse identificador neste espaço.";
  }
  return "Não foi possível salvar as configurações do canal agora.";
}

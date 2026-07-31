import { supabaseClient, type MemberRole } from "./supabase";

function requireClient() {
  if (!supabaseClient) throw new Error("supabase_not_configured");
  return supabaseClient;
}

const validRoles = new Set<MemberRole>(["owner", "admin", "manager", "member", "viewer"]);

export async function updateChannelPermissions(input: {
  channelId: string;
  allowedRoles: MemberRole[];
  allowedAssignments: string[];
}) {
  const allowedRoles = [...new Set(input.allowedRoles)].filter((role) => validRoles.has(role));
  const allowedAssignments = [...new Set(input.allowedAssignments.map((value) => value.trim()).filter(Boolean))]
    .map((value) => value.slice(0, 100))
    .slice(0, 50);

  const { data, error } = await requireClient()
    .from("channels")
    .update({
      allowed_roles: allowedRoles,
      allowed_assignments: allowedAssignments,
    })
    .eq("id", input.channelId)
    .select("id,allowed_roles,allowed_assignments")
    .single();

  if (error) throw error;
  return {
    id: String(data.id),
    allowedRoles: Array.isArray(data.allowed_roles) ? data.allowed_roles as MemberRole[] : [],
    allowedAssignments: Array.isArray(data.allowed_assignments) ? data.allowed_assignments.map(String) : [],
  };
}

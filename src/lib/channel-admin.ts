import type { MemberRole } from "./supabase";
import { jsonBody, rustApi } from "./rust-api";

const validRoles = new Set<MemberRole>(["owner", "admin", "manager", "member", "viewer"]);

export async function updateChannelPermissions(input: {
  channelId: string;
  allowedRoles: MemberRole[];
  allowedAssignments: string[];
}) {
  const allowedAssignments = [...new Set(input.allowedAssignments.map((value) => value.trim()).filter(Boolean))]
    .map((value) => value.slice(0, 100))
    .slice(0, 50);
  const requestedRoles = [...new Set(input.allowedRoles)].filter((role) => validRoles.has(role));
  return rustApi<{
    id: string;
    allowedRoles: MemberRole[];
    allowedAssignments: string[];
  }>(`/v1/channels/${encodeURIComponent(input.channelId)}/permissions`, {
    method: "PUT",
    body: jsonBody({ allowedRoles: requestedRoles, allowedAssignments }),
  });
}

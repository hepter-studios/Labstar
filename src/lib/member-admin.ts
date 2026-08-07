import { getCurrentAccessIdentity } from "./access";
import { supabaseClient } from "./supabase";

export async function deleteLabstarMember(targetMemberId: string) {
  if (!supabaseClient) throw new Error("supabase_not_configured");
  const identity = await getCurrentAccessIdentity();
  if (!identity?.member) throw new Error("member_not_found");
  if (identity.member.role !== "owner" && identity.member.role !== "admin") throw new Error("not_allowed");
  if (identity.member.id === targetMemberId) throw new Error("cannot_delete_self");

  const { data: target, error: targetError } = await supabaseClient
    .from("members")
    .select("id,role,name,email")
    .eq("id", targetMemberId)
    .maybeSingle();
  if (targetError) throw targetError;
  if (!target) throw new Error("member_not_found");
  if (target.role === "owner") throw new Error("cannot_delete_owner");

  const { error: roleError } = await supabaseClient
    .from("member_job_roles")
    .delete()
    .eq("member_id", targetMemberId);
  if (roleError) throw roleError;

  const { error: deleteError } = await supabaseClient
    .from("members")
    .delete()
    .eq("id", targetMemberId);
  if (deleteError) throw deleteError;

  return { id: String(target.id), name: String(target.name), email: String(target.email) };
}

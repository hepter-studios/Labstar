import { requireAuthClient } from "./auth-client";

export type BackendMember = {
  id: string;
  email: string;
  name: string;
  status: "pending" | "active" | "suspended";
  role: "owner" | "admin" | "manager" | "member" | "viewer";
  jobTitle: string;
  area: string;
};

export type BackendMeResponse = {
  userId: string;
  email: string;
  member: Omit<BackendMember, "email">;
};

export type BackendInviteInspection = {
  valid: boolean;
  status: string;
  mode: "quick" | "personal" | null;
  emailHint: string | null;
  expiresAt: string | null;
  approvalRequired: boolean | null;
};

export type BackendCreatedInvite = {
  id: string;
  token: string;
  urlPath: string;
  mode: "quick" | "personal";
  email: string | null;
  expiresAt: string;
  approvalRequired: boolean;
};

export type BackendAcceptedInvite = {
  member: BackendMember;
  approvalRequired: boolean;
};

type IdentityRow = {
  id: string;
  auth_user_id?: string | null;
  email: string;
  name: string;
  status: "pending" | "active" | "suspended";
  role: "owner" | "admin" | "manager" | "member" | "viewer";
  job_title?: string | null;
  area?: string | null;
};

type RpcFailure = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

type InviteInspectionRow = {
  valid: boolean;
  status: string;
  kind: "quick" | "personal" | null;
  email_hint: string | null;
  expires_at: string | null;
  approval_required: boolean | null;
};

type CreatedInviteRow = {
  invite_id: string;
  invite_token: string;
  invite_path: string;
  kind: "quick" | "personal";
  email: string | null;
  expires_at: string;
  approval_required: boolean;
};

export class BackendApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "BackendApiError";
    this.code = code;
    this.status = status;
  }
}

function firstRow<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] as T | undefined) ?? null;
  if (value && typeof value === "object") return value as T;
  return null;
}

function rpcError(error: unknown): BackendApiError {
  const value = (error && typeof error === "object" ? error : {}) as RpcFailure;
  const text = [value.message, value.details, value.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const knownCodes = [
    "invite_invalid_or_expired",
    "invite_email_mismatch",
    "member_already_linked",
    "member_suspended",
    "member_pending",
    "member_not_authorized",
    "verified_email_required",
    "authentication_required",
    "permission_denied",
    "only_owner_can_grant_admin",
    "personal_invite_requires_email",
    "invalid_invite_kind",
    "invalid_role",
  ] as const;

  const known = knownCodes.find((candidate) => text.includes(candidate));
  if (known) {
    const status = known === "authentication_required" || known === "verified_email_required"
      ? 401
      : known.startsWith("invalid_") || known === "personal_invite_requires_email" || known === "invite_invalid_or_expired"
        ? 400
        : 403;
    return new BackendApiError(known, value.message || known, status);
  }

  if (value.code === "42501") {
    return new BackendApiError("permission_denied", value.message || "Permissão negada.", 403);
  }
  if (value.code === "28000") {
    return new BackendApiError("authentication_failed", value.message || "Autenticação necessária.", 401);
  }
  if (value.code === "PGRST202" || text.includes("schema cache") || text.includes("could not find the function")) {
    return new BackendApiError(
      "access_rpc_unavailable",
      "As funções seguras de acesso ainda não estão disponíveis no Supabase.",
      503,
    );
  }
  if (text.includes("failed to fetch") || text.includes("network")) {
    return new BackendApiError("database_unavailable", "Não foi possível conectar ao Supabase.", 503);
  }

  return new BackendApiError(
    value.code || "database_request_failed",
    value.message || "O Supabase recusou a solicitação.",
    500,
  );
}

function memberAuthorizationError(status: IdentityRow["status"]) {
  if (status === "pending") {
    return new BackendApiError("member_pending", "O membro ainda aguarda aprovação.", 403);
  }
  if (status === "suspended") {
    return new BackendApiError("member_suspended", "O acesso deste membro está suspenso.", 403);
  }
  return null;
}

function mapMember(row: IdentityRow): BackendMember {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    status: row.status,
    role: row.role,
    jobTitle: row.job_title ?? "",
    area: row.area ?? "",
  };
}

async function currentIdentityRow(): Promise<{ userId: string; row: IdentityRow }> {
  const client = requireAuthClient();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError) throw rpcError(userError);
  const user = userData.user;
  if (!user) throw new BackendApiError("authentication_failed", "Sua sessão expirou.", 401);

  const email = user.email?.trim().toLowerCase() ?? "";
  let row: IdentityRow | null = null;

  const byIdentity = await client
    .from("members")
    .select("id,auth_user_id,email,name,status,role,job_title,area")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (byIdentity.error) throw rpcError(byIdentity.error);
  row = byIdentity.data as IdentityRow | null;

  if (!row && email) {
    const byEmail = await client
      .from("members")
      .select("id,auth_user_id,email,name,status,role,job_title,area")
      .eq("email", email)
      .maybeSingle();
    if (byEmail.error) throw rpcError(byEmail.error);
    row = byEmail.data as IdentityRow | null;
  }

  if (!row) {
    throw new BackendApiError(
      "member_not_authorized",
      "Esta identidade não possui vínculo ativo com a equipe.",
      403,
    );
  }

  const authorizationError = memberAuthorizationError(row.status);
  if (authorizationError) throw authorizationError;

  return { userId: user.id, row };
}

export async function getBackendIdentity(_accessToken: string): Promise<BackendMeResponse> {
  const identity = await currentIdentityRow();
  window.sessionStorage.setItem("labstar-backend-mode", "supabase-rpc");

  return {
    userId: identity.userId,
    email: identity.row.email,
    member: {
      id: identity.row.id,
      name: identity.row.name,
      status: identity.row.status,
      role: identity.row.role,
      jobTitle: identity.row.job_title ?? "",
      area: identity.row.area ?? "",
    },
  };
}

export async function inspectBackendInvite(token: string): Promise<BackendInviteInspection> {
  const client = requireAuthClient();
  const { data, error } = await client.rpc("inspect_member_invite", { invite_token: token });
  if (error) throw rpcError(error);

  const row = firstRow<InviteInspectionRow>(data);
  if (!row) {
    return {
      valid: false,
      status: "invalid",
      mode: null,
      emailHint: null,
      expiresAt: null,
      approvalRequired: null,
    };
  }

  return {
    valid: Boolean(row.valid),
    status: row.status,
    mode: row.kind,
    emailHint: row.email_hint,
    expiresAt: row.expires_at,
    approvalRequired: row.approval_required,
  };
}

export async function acceptBackendInvite(
  token: string,
  _accessToken: string,
): Promise<BackendAcceptedInvite> {
  const client = requireAuthClient();
  const { data, error } = await client.rpc("accept_member_invite", { invite_token: token });
  if (error) throw rpcError(error);

  const row = firstRow<IdentityRow>(data);
  if (!row) {
    throw new BackendApiError("invite_invalid_or_expired", "O convite não pôde ser aceito.", 400);
  }

  const member = mapMember(row);
  return {
    member,
    approvalRequired: member.status === "pending",
  };
}

export async function createBackendInvite(input: {
  mode: "quick" | "personal";
  email?: string;
  name?: string;
  role: "admin" | "manager" | "member" | "viewer";
  jobTitle?: string;
  area?: string;
  validForHours: number;
}, _accessToken: string): Promise<BackendCreatedInvite> {
  const client = requireAuthClient();
  const { data, error } = await client.rpc("create_member_invite_link_client", {
    invitation_kind: input.mode,
    invited_email: input.mode === "personal" ? input.email?.trim().toLowerCase() || null : null,
    invited_name: input.name?.trim() ?? "",
    invited_role: input.role,
    invited_job_title: input.jobTitle?.trim() ?? "",
    invited_area: input.area?.trim() ?? "",
    valid_for_hours: input.validForHours,
  });
  if (error) throw rpcError(error);

  const row = firstRow<CreatedInviteRow>(data);
  if (!row) {
    throw new BackendApiError("invite_creation_failed", "O convite não foi criado.", 500);
  }

  return {
    id: row.invite_id,
    token: row.invite_token,
    urlPath: row.invite_path,
    mode: row.kind,
    email: row.email,
    expiresAt: row.expires_at,
    approvalRequired: row.approval_required,
  };
}

export async function revokeBackendInvite(
  inviteId: string,
  _accessToken: string,
): Promise<void> {
  const client = requireAuthClient();
  const { error } = await client.rpc("revoke_member_invite", { target_invite_id: inviteId });
  if (error) throw rpcError(error);
}

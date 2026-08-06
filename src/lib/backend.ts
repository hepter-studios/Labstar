import { jsonBody, rustApi, RustApiError } from "./rust-api";

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

export class BackendApiError extends RustApiError {}

function asBackendError(error: unknown): never {
  if (error instanceof BackendApiError) throw error;
  if (error instanceof RustApiError) {
    throw new BackendApiError(error.code, error.message, error.status, error.details);
  }
  throw error;
}

export async function getBackendIdentity(_accessToken: string): Promise<BackendMeResponse> {
  try {
    const member = await rustApi<{
      userId: string;
      memberId: string;
      email: string;
      name: string;
      role: BackendMember["role"];
      status: BackendMember["status"];
      jobTitle: string;
      area: string;
    }>("/v1/me");
    window.sessionStorage.setItem("labstar-backend-mode", "rust-api");
    return {
      userId: member.userId,
      email: member.email,
      member: {
        id: member.memberId,
        name: member.name,
        status: member.status,
        role: member.role,
        jobTitle: member.jobTitle,
        area: member.area,
      },
    };
  } catch (error) {
    asBackendError(error);
  }
}

export async function inspectBackendInvite(token: string): Promise<BackendInviteInspection> {
  try {
    return await rustApi<BackendInviteInspection>(`/v1/invites/inspect/${encodeURIComponent(token)}`);
  } catch (error) {
    asBackendError(error);
  }
}

export async function acceptBackendInvite(
  token: string,
  _accessToken: string,
): Promise<BackendAcceptedInvite> {
  try {
    return await rustApi<BackendAcceptedInvite>(`/v1/invites/accept/${encodeURIComponent(token)}`, {
      method: "POST",
    });
  } catch (error) {
    asBackendError(error);
  }
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
  try {
    return await rustApi<BackendCreatedInvite>("/v1/invites", {
      method: "POST",
      body: jsonBody(input),
    });
  } catch (error) {
    asBackendError(error);
  }
}

export async function revokeBackendInvite(
  inviteId: string,
  _accessToken: string,
): Promise<void> {
  try {
    await rustApi<void>(`/v1/invites/${encodeURIComponent(inviteId)}`, { method: "DELETE" });
  } catch (error) {
    asBackendError(error);
  }
}

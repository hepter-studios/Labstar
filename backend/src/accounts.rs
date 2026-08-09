use axum::{Json, extract::State, http::StatusCode};
use reqwest::Url;
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use uuid::Uuid;

use crate::{auth::AuthenticatedUser, error::ApiError, state::AppState};

const MEMBER_FIELDS: &str = "id,auth_user_id,email,name,status,role,avatar_path,deleted_at";
const ADMIN_PAGE_SIZE: usize = 200;
const ADMIN_MAX_PAGES: usize = 5;

#[derive(Debug, Deserialize)]
pub struct DeleteAccountRequest {
    email: String,
    confirmation_email: String,
}

#[derive(Debug, Serialize)]
pub struct DeleteAccountResponse {
    outcome: &'static str,
    member_id: Option<Uuid>,
    auth_identity_deleted: bool,
    cleanup_warning: Option<&'static str>,
}

#[derive(Debug, Clone, Deserialize)]
struct MemberRecord {
    id: Uuid,
    auth_user_id: Option<Uuid>,
    #[allow(dead_code)]
    email: String,
    #[allow(dead_code)]
    name: String,
    status: String,
    role: String,
    #[allow(dead_code)]
    avatar_path: Option<String>,
    deleted_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AdminUser {
    id: Uuid,
    email: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AdminUsersPage {
    #[serde(default)]
    users: Vec<AdminUser>,
}

#[derive(Debug, Deserialize)]
struct FinalizeRow {
    member_id: Uuid,
    avatar_path: Option<String>,
}

pub async fn delete_account(
    State(state): State<AppState>,
    identity: AuthenticatedUser,
    Json(input): Json<DeleteAccountRequest>,
) -> Result<Json<DeleteAccountResponse>, ApiError> {
    let email = normalize_email(&input.email);
    if email.is_empty() || email != normalize_email(&input.confirmation_email) {
        return Err(ApiError::ConfirmationEmailMismatch);
    }

    let actor = find_member_by_auth_id(&state, identity.id)
        .await?
        .or(find_member_by_email(&state, &identity.email).await?)
        .ok_or(ApiError::MemberNotAuthorized)?;
    if !identity.email_confirmed || actor.status != "active" || actor.deleted_at.is_some() {
        return Err(ApiError::MemberNotAuthorized);
    }
    if !matches!(actor.role.as_str(), "owner" | "admin") {
        return Err(ApiError::PermissionDenied);
    }

    let target = find_member_by_email(&state, &email).await?;
    let mut target_auth_id = target.as_ref().and_then(|member| member.auth_user_id);
    if target_auth_id.is_none() {
        target_auth_id = find_auth_user_by_email(&state, &email).await?;
    }

    validate_deletion(&actor, target.as_ref(), &identity, &email, target_auth_id)?;
    if target.is_none() && target_auth_id.is_none() {
        return Err(ApiError::AccountNotFound);
    }

    let auth_identity_deleted = match target_auth_id {
        Some(user_id) => delete_auth_user(&state, user_id).await?,
        None => false,
    };

    let finalized = match target.as_ref() {
        Some(member) => Some(finalize_member(&state, member.id, &email).await?),
        None => None,
    };
    let avatar_path = finalized
        .as_ref()
        .and_then(|row| row.avatar_path.as_deref());
    let cleanup_warning = match avatar_path {
        Some(path) if !path.is_empty() && !delete_avatar(&state, path).await => {
            Some("avatar_cleanup_pending")
        }
        _ => None,
    };

    Ok(Json(DeleteAccountResponse {
        outcome: "deleted",
        member_id: finalized.map(|row| row.member_id),
        auth_identity_deleted,
        cleanup_warning,
    }))
}

fn normalize_email(value: &str) -> String {
    value.trim().to_ascii_lowercase()
}

fn validate_deletion(
    actor: &MemberRecord,
    target: Option<&MemberRecord>,
    identity: &AuthenticatedUser,
    email: &str,
    target_auth_id: Option<Uuid>,
) -> Result<(), ApiError> {
    if email == identity.email
        || target_auth_id == Some(identity.id)
        || target.is_some_and(|member| member.id == actor.id)
    {
        return Err(ApiError::SelfDeletionForbidden);
    }
    if target.is_some_and(|member| member.role == "owner") {
        return Err(ApiError::OwnerDeletionForbidden);
    }
    if actor.role == "admin" && target.is_none_or(|member| member.role == "admin") {
        return Err(ApiError::OwnerRequired);
    }
    if target.is_some_and(|member| member.status != "suspended") {
        return Err(ApiError::MemberMustBeSuspended);
    }
    Ok(())
}

async fn find_member_by_auth_id(
    state: &AppState,
    user_id: Uuid,
) -> Result<Option<MemberRecord>, ApiError> {
    let mut url = state
        .config
        .endpoint("rest/v1/members")
        .map_err(|_| ApiError::UpstreamUnavailable)?;
    url.query_pairs_mut()
        .append_pair("select", MEMBER_FIELDS)
        .append_pair("auth_user_id", &format!("eq.{user_id}"))
        .append_pair("deleted_at", "is.null")
        .append_pair("limit", "1");
    first_admin_row(state, url).await
}

async fn find_member_by_email(
    state: &AppState,
    email: &str,
) -> Result<Option<MemberRecord>, ApiError> {
    let mut url = state
        .config
        .endpoint("rest/v1/members")
        .map_err(|_| ApiError::UpstreamUnavailable)?;
    url.query_pairs_mut()
        .append_pair("select", MEMBER_FIELDS)
        .append_pair("email", &format!("ilike.{email}"))
        .append_pair("deleted_at", "is.null")
        .append_pair("limit", "1");
    first_admin_row(state, url).await
}

async fn first_admin_row<T: DeserializeOwned>(
    state: &AppState,
    url: Url,
) -> Result<Option<T>, ApiError> {
    let response = admin_request(state, state.http.get(url))
        .send()
        .await
        .map_err(|_| ApiError::UpstreamUnavailable)?;
    if !response.status().is_success() {
        return Err(ApiError::UpstreamUnavailable);
    }
    Ok(response
        .json::<Vec<T>>()
        .await
        .map_err(|_| ApiError::UpstreamUnavailable)?
        .into_iter()
        .next())
}

async fn find_auth_user_by_email(state: &AppState, email: &str) -> Result<Option<Uuid>, ApiError> {
    for page in 1..=ADMIN_MAX_PAGES {
        let mut url = state
            .config
            .endpoint("auth/v1/admin/users")
            .map_err(|_| ApiError::UpstreamUnavailable)?;
        url.query_pairs_mut()
            .append_pair("page", &page.to_string())
            .append_pair("per_page", &ADMIN_PAGE_SIZE.to_string());
        let response = admin_request(state, state.http.get(url))
            .send()
            .await
            .map_err(|_| ApiError::UpstreamUnavailable)?;
        if !response.status().is_success() {
            return Err(ApiError::UpstreamUnavailable);
        }
        let body = response
            .json::<AdminUsersPage>()
            .await
            .map_err(|_| ApiError::UpstreamUnavailable)?;
        let count = body.users.len();
        if let Some(user) = body.users.into_iter().find(|user| {
            user.email
                .as_deref()
                .is_some_and(|candidate| normalize_email(candidate) == email)
        }) {
            return Ok(Some(user.id));
        }
        if count < ADMIN_PAGE_SIZE {
            break;
        }
    }
    Ok(None)
}

async fn delete_auth_user(state: &AppState, user_id: Uuid) -> Result<bool, ApiError> {
    let mut url = state
        .config
        .admin_user_endpoint(user_id)
        .map_err(|_| ApiError::UpstreamUnavailable)?;
    url.query_pairs_mut()
        .append_pair("should_soft_delete", "false");
    let response = admin_request(state, state.http.delete(url))
        .send()
        .await
        .map_err(|_| ApiError::AuthIdentityDeleteFailed)?;
    match response.status() {
        StatusCode::OK | StatusCode::NO_CONTENT => Ok(true),
        StatusCode::NOT_FOUND => Ok(false),
        _ => Err(ApiError::AuthIdentityDeleteFailed),
    }
}

async fn finalize_member(
    state: &AppState,
    member_id: Uuid,
    email: &str,
) -> Result<FinalizeRow, ApiError> {
    let url = state
        .config
        .endpoint("rest/v1/rpc/finalize_labstar_account_deletion")
        .map_err(|_| ApiError::AccountCleanupIncomplete)?;
    let response = admin_request(state, state.http.post(url))
        .header("Prefer", "return=representation")
        .json(&serde_json::json!({
            "target_member_id": member_id,
            "target_email": email,
        }))
        .send()
        .await
        .map_err(|_| ApiError::AccountCleanupIncomplete)?;
    if !response.status().is_success() {
        return Err(ApiError::AccountCleanupIncomplete);
    }
    response
        .json::<Vec<FinalizeRow>>()
        .await
        .map_err(|_| ApiError::AccountCleanupIncomplete)?
        .into_iter()
        .next()
        .ok_or(ApiError::AccountCleanupIncomplete)
}

async fn delete_avatar(state: &AppState, path: &str) -> bool {
    let Ok(url) = state.config.storage_object_endpoint(path) else {
        return false;
    };
    let Ok(response) = admin_request(state, state.http.delete(url)).send().await else {
        return false;
    };
    response.status().is_success() || response.status() == StatusCode::NOT_FOUND
}

fn admin_request(state: &AppState, request: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
    request
        .bearer_auth(&state.config.supabase_service_role_key)
        .header("apikey", &state.config.supabase_service_role_key)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn member(id: Uuid, role: &str, status: &str, email: &str) -> MemberRecord {
        MemberRecord {
            id,
            auth_user_id: Some(id),
            email: email.to_string(),
            name: "Teste".to_string(),
            status: status.to_string(),
            role: role.to_string(),
            avatar_path: None,
            deleted_at: None,
        }
    }

    #[test]
    fn rejects_self_owner_and_active_targets() {
        let actor_id = Uuid::new_v4();
        let actor = member(actor_id, "owner", "active", "owner@example.com");
        let identity = AuthenticatedUser {
            id: actor_id,
            email: actor.email.clone(),
            email_confirmed: true,
        };
        assert!(matches!(
            validate_deletion(
                &actor,
                Some(&actor),
                &identity,
                &actor.email,
                Some(actor_id)
            ),
            Err(ApiError::SelfDeletionForbidden)
        ));

        let owner = member(
            Uuid::new_v4(),
            "owner",
            "suspended",
            "second-owner@example.com",
        );
        assert!(matches!(
            validate_deletion(
                &actor,
                Some(&owner),
                &identity,
                &owner.email,
                owner.auth_user_id
            ),
            Err(ApiError::OwnerDeletionForbidden)
        ));

        let active = member(Uuid::new_v4(), "member", "active", "active@example.com");
        assert!(matches!(
            validate_deletion(
                &actor,
                Some(&active),
                &identity,
                &active.email,
                active.auth_user_id
            ),
            Err(ApiError::MemberMustBeSuspended)
        ));
    }

    #[test]
    fn admin_cannot_delete_admin_or_orphan_identity() {
        let actor_id = Uuid::new_v4();
        let actor = member(actor_id, "admin", "active", "admin@example.com");
        let identity = AuthenticatedUser {
            id: actor_id,
            email: actor.email.clone(),
            email_confirmed: true,
        };
        let target = member(Uuid::new_v4(), "admin", "suspended", "target@example.com");
        assert!(matches!(
            validate_deletion(
                &actor,
                Some(&target),
                &identity,
                &target.email,
                target.auth_user_id
            ),
            Err(ApiError::OwnerRequired)
        ));
        assert!(matches!(
            validate_deletion(
                &actor,
                None,
                &identity,
                "orphan@example.com",
                Some(Uuid::new_v4())
            ),
            Err(ApiError::OwnerRequired)
        ));
    }

    #[test]
    fn owner_can_delete_suspended_member() {
        let actor_id = Uuid::new_v4();
        let actor = member(actor_id, "owner", "active", "owner@example.com");
        let identity = AuthenticatedUser {
            id: actor_id,
            email: actor.email.clone(),
            email_confirmed: true,
        };
        let target = member(Uuid::new_v4(), "member", "suspended", "member@example.com");
        assert!(
            validate_deletion(
                &actor,
                Some(&target),
                &identity,
                &target.email,
                target.auth_user_id
            )
            .is_ok()
        );
    }
}

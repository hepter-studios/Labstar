use serde::Serialize;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::{auth::AuthenticatedUser, error::ApiError};

#[derive(Debug, Clone, FromRow, Serialize)]
pub struct MemberRecord {
    pub id: Uuid,
    pub auth_user_id: Option<Uuid>,
    pub email: String,
    pub name: String,
    pub status: String,
    pub role: String,
    pub job_title: Option<String>,
    pub area: Option<String>,
}

pub async fn require_active_member(
    database: &PgPool,
    identity: &AuthenticatedUser,
) -> Result<MemberRecord, ApiError> {
    if !identity.email_confirmed {
        return Err(ApiError::MemberNotAuthorized);
    }

    let identity_email = identity
        .email
        .as_deref()
        .ok_or(ApiError::MemberNotAuthorized)?;

    let member = sqlx::query_as::<_, MemberRecord>(
        r#"
        select
            id,
            auth_user_id,
            lower(trim(email)) as email,
            name,
            status::text as status,
            role::text as role,
            job_title,
            area
        from public.members
        where auth_user_id = $1
        limit 1
        "#,
    )
    .bind(identity.id)
    .fetch_optional(database)
    .await
    .map_err(|_| ApiError::DatabaseUnavailable)?
    .ok_or(ApiError::MemberNotAuthorized)?;

    match member.status.as_str() {
        "active" => {}
        "pending" => return Err(ApiError::MemberPending),
        "suspended" => return Err(ApiError::MemberSuspended),
        _ => return Err(ApiError::MemberNotAuthorized),
    }

    if member.email != identity_email {
        return Err(ApiError::MemberNotAuthorized);
    }

    Ok(member)
}

pub async fn require_manager(
    database: &PgPool,
    identity: &AuthenticatedUser,
) -> Result<MemberRecord, ApiError> {
    let member = require_active_member(database, identity).await?;
    if matches!(member.role.as_str(), "owner" | "admin") {
        Ok(member)
    } else {
        Err(ApiError::PermissionDenied)
    }
}

pub fn ensure_role_can_be_granted(actor: &MemberRecord, invited_role: &str) -> Result<(), ApiError> {
    if !matches!(invited_role, "admin" | "manager" | "member" | "viewer") {
        return Err(ApiError::InvalidRole);
    }

    if invited_role == "admin" && actor.role != "owner" {
        return Err(ApiError::PermissionDenied);
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn actor(role: &str) -> MemberRecord {
        MemberRecord {
            id: Uuid::nil(),
            auth_user_id: Some(Uuid::nil()),
            email: "owner@example.com".to_string(),
            name: "Owner".to_string(),
            status: "active".to_string(),
            role: role.to_string(),
            job_title: None,
            area: None,
        }
    }

    #[test]
    fn only_owner_can_grant_admin() {
        assert!(ensure_role_can_be_granted(&actor("owner"), "admin").is_ok());
        assert!(matches!(
            ensure_role_can_be_granted(&actor("admin"), "admin"),
            Err(ApiError::PermissionDenied)
        ));
    }

    #[test]
    fn rejects_unknown_role() {
        assert!(matches!(
            ensure_role_can_be_granted(&actor("owner"), "superuser"),
            Err(ApiError::InvalidRole)
        ));
    }
}

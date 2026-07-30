use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
};
use chrono::{DateTime, Utc};
use rand::{RngCore, rngs::OsRng};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{FromRow, Postgres, Transaction};
use uuid::Uuid;

use crate::{
    auth::AuthenticatedUser,
    error::ApiError,
    members::{MemberRecord, ensure_role_can_be_granted, require_manager},
    state::AppState,
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateInviteInput {
    #[serde(default = "default_mode")]
    mode: String,
    email: Option<String>,
    name: Option<String>,
    #[serde(default = "default_role")]
    role: String,
    job_title: Option<String>,
    area: Option<String>,
    #[serde(default = "default_valid_hours")]
    valid_for_hours: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedInviteResponse {
    id: Uuid,
    token: String,
    url_path: String,
    mode: String,
    email: Option<String>,
    expires_at: DateTime<Utc>,
    approval_required: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InviteInspectionResponse {
    valid: bool,
    status: String,
    mode: Option<String>,
    email_hint: Option<String>,
    expires_at: Option<DateTime<Utc>>,
    approval_required: Option<bool>,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct InviteListItem {
    id: Uuid,
    mode: String,
    email: Option<String>,
    status: String,
    role: String,
    area: String,
    token_hint: Option<String>,
    approval_required: bool,
    created_at: DateTime<Utc>,
    expires_at: DateTime<Utc>,
    accepted_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AcceptedInviteResponse {
    member: MemberResponse,
    approval_required: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MemberResponse {
    id: Uuid,
    email: String,
    name: String,
    status: String,
    role: String,
    job_title: String,
    area: String,
}

#[derive(Debug, FromRow)]
struct CreatedInviteRow {
    id: Uuid,
    kind: String,
    email: Option<String>,
    expires_at: DateTime<Utc>,
    approval_required: bool,
}

#[derive(Debug, FromRow)]
struct InviteRow {
    id: Uuid,
    email: Option<String>,
    kind: String,
    status: String,
    name: String,
    role: String,
    job_title: String,
    area: String,
    expires_at: DateTime<Utc>,
    approval_required: bool,
    use_count: i32,
    max_uses: i32,
}

pub async fn create(
    State(state): State<AppState>,
    identity: AuthenticatedUser,
    Json(input): Json<CreateInviteInput>,
) -> Result<Json<CreatedInviteResponse>, ApiError> {
    let actor = require_manager(&state.database, &identity).await?;
    let mode = normalize_mode(&input.mode)?;
    let role = input.role.trim().to_ascii_lowercase();
    ensure_role_can_be_granted(&actor, &role)?;

    let email = match mode.as_str() {
        "personal" => Some(normalize_email(
            input.email.as_deref().ok_or(ApiError::InvalidEmail)?,
        )?),
        "quick" => None,
        _ => return Err(ApiError::InvalidInviteKind),
    };

    let valid_for_hours = input.valid_for_hours.clamp(1, 720);
    let name = clean_text(input.name.as_deref().unwrap_or_default(), 100);
    let job_title = clean_text(input.job_title.as_deref().unwrap_or_default(), 120);
    let area = clean_text(input.area.as_deref().unwrap_or_default(), 120);
    let (token, token_hash) = create_token();
    let token_hint = token.chars().take(8).collect::<String>();

    let mut transaction = state
        .database
        .begin()
        .await
        .map_err(|_| ApiError::DatabaseUnavailable)?;

    sqlx::query(
        "update public.member_invites set status = 'expired' where status = 'pending' and expires_at <= now()",
    )
    .execute(&mut *transaction)
    .await
    .map_err(|_| ApiError::DatabaseUnavailable)?;

    if let Some(personal_email) = &email {
        sqlx::query(
            r#"
            update public.member_invites
            set status = 'revoked', revoked_at = now()
            where status = 'pending'
              and kind = 'personal'
              and normalized_email = $1
            "#,
        )
        .bind(personal_email)
        .execute(&mut *transaction)
        .await
        .map_err(|_| ApiError::DatabaseUnavailable)?;
    }

    let row = sqlx::query_as::<_, CreatedInviteRow>(
        r#"
        insert into public.member_invites (
            email,
            name,
            role,
            job_title,
            area,
            status,
            invited_by,
            expires_at,
            token_hash,
            token_hint,
            kind,
            max_uses,
            use_count,
            approval_required
        ) values (
            $1,
            $2,
            $3,
            $4,
            $5,
            'pending',
            $6,
            now() + ($7 * interval '1 hour'),
            $8,
            $9,
            $10,
            1,
            0,
            $11
        )
        returning id, kind, email, expires_at, approval_required
        "#,
    )
    .bind(&email)
    .bind(name)
    .bind(role)
    .bind(job_title)
    .bind(area)
    .bind(actor.id)
    .bind(valid_for_hours)
    .bind(token_hash)
    .bind(token_hint)
    .bind(&mode)
    .bind(mode == "quick")
    .fetch_one(&mut *transaction)
    .await
    .map_err(|_| ApiError::DatabaseUnavailable)?;

    transaction
        .commit()
        .await
        .map_err(|_| ApiError::DatabaseUnavailable)?;

    Ok(Json(CreatedInviteResponse {
        id: row.id,
        url_path: format!("/?invite={token}"),
        token,
        mode: row.kind,
        email: row.email,
        expires_at: row.expires_at,
        approval_required: row.approval_required,
    }))
}

pub async fn inspect(
    State(state): State<AppState>,
    Path(raw_token): Path<String>,
) -> Result<Json<InviteInspectionResponse>, ApiError> {
    let token = match normalize_token(&raw_token) {
        Ok(value) => value,
        Err(_) => return Ok(Json(invalid_inspection())),
    };
    let hash = token_hash(&token);

    let invitation = sqlx::query_as::<_, InviteRow>(
        r#"
        select
            id,
            email,
            kind,
            status,
            name,
            role,
            job_title,
            area,
            expires_at,
            approval_required,
            use_count,
            max_uses
        from public.member_invites
        where token_hash = $1
        limit 1
        "#,
    )
    .bind(hash)
    .fetch_optional(&state.database)
    .await
    .map_err(|_| ApiError::DatabaseUnavailable)?;

    let Some(invitation) = invitation else {
        return Ok(Json(invalid_inspection()));
    };

    let valid = invitation.status == "pending"
        && invitation.expires_at > Utc::now()
        && invitation.use_count < invitation.max_uses;
    let status = if invitation.status == "pending" && invitation.expires_at <= Utc::now() {
        "expired".to_string()
    } else {
        invitation.status.clone()
    };

    Ok(Json(InviteInspectionResponse {
        valid,
        status,
        mode: Some(invitation.kind),
        email_hint: invitation.email.as_deref().map(email_hint),
        expires_at: Some(invitation.expires_at),
        approval_required: Some(invitation.approval_required),
    }))
}

pub async fn accept(
    State(state): State<AppState>,
    identity: AuthenticatedUser,
    Path(raw_token): Path<String>,
) -> Result<Json<AcceptedInviteResponse>, ApiError> {
    if !identity.email_confirmed {
        return Err(ApiError::MemberNotAuthorized);
    }
    let caller_email = normalize_email(
        identity
            .email
            .as_deref()
            .ok_or(ApiError::MemberNotAuthorized)?,
    )?;
    let token = normalize_token(&raw_token)?;
    let hash = token_hash(&token);

    let mut transaction = state
        .database
        .begin()
        .await
        .map_err(|_| ApiError::DatabaseUnavailable)?;

    let invitation = lock_invitation(&mut transaction, &hash).await?;
    if invitation.status != "pending"
        || invitation.expires_at <= Utc::now()
        || invitation.use_count >= invitation.max_uses
    {
        return Err(ApiError::InviteInvalidOrExpired);
    }

    if invitation.kind == "personal" && invitation.email.as_deref() != Some(&caller_email) {
        return Err(ApiError::InviteEmailMismatch);
    }

    let existing = lock_existing_member(&mut transaction, identity.id, &caller_email).await?;
    let desired_status = if invitation.approval_required {
        "pending"
    } else {
        "active"
    };

    let member = match existing {
        Some(existing) => {
            if existing.auth_user_id.is_some_and(|user_id| user_id != identity.id) {
                return Err(ApiError::MemberAlreadyLinked);
            }
            if existing.status == "suspended" {
                return Err(ApiError::MemberSuspended);
            }

            let already_active = existing.status == "active";
            let final_name = if existing.name.trim().len() >= 2 {
                existing.name.clone()
            } else if invitation.name.trim().len() >= 2 {
                invitation.name.clone()
            } else {
                identity.display_name.clone()
            };
            let final_status = if already_active { "active" } else { desired_status };
            let final_role = if already_active || existing.role == "owner" {
                existing.role.clone()
            } else {
                invitation.role.clone()
            };
            let final_job_title = if already_active || invitation.job_title.trim().is_empty() {
                existing.job_title.clone().unwrap_or_default()
            } else {
                invitation.job_title.clone()
            };
            let final_area = if already_active || invitation.area.trim().is_empty() {
                existing.area.clone().unwrap_or_default()
            } else {
                invitation.area.clone()
            };

            sqlx::query_as::<_, MemberRecord>(
                r#"
                update public.members
                set auth_user_id = $2,
                    email = $3,
                    name = $4,
                    status = $5,
                    role = $6,
                    job_title = $7,
                    area = $8,
                    last_seen_at = now()
                where id = $1
                returning
                    id,
                    auth_user_id,
                    lower(trim(email)) as email,
                    name,
                    status::text as status,
                    role::text as role,
                    job_title,
                    area
                "#,
            )
            .bind(existing.id)
            .bind(identity.id)
            .bind(&caller_email)
            .bind(final_name)
            .bind(final_status)
            .bind(final_role)
            .bind(final_job_title)
            .bind(final_area)
            .fetch_one(&mut *transaction)
            .await
            .map_err(|_| ApiError::DatabaseUnavailable)?
        }
        None => {
            let final_name = if invitation.name.trim().len() >= 2 {
                invitation.name.clone()
            } else {
                identity.display_name.clone()
            };

            sqlx::query_as::<_, MemberRecord>(
                r#"
                insert into public.members (
                    auth_user_id,
                    email,
                    name,
                    status,
                    role,
                    job_title,
                    area,
                    last_seen_at
                ) values ($1, $2, $3, $4, $5, $6, $7, now())
                returning
                    id,
                    auth_user_id,
                    lower(trim(email)) as email,
                    name,
                    status::text as status,
                    role::text as role,
                    job_title,
                    area
                "#,
            )
            .bind(identity.id)
            .bind(&caller_email)
            .bind(final_name)
            .bind(desired_status)
            .bind(&invitation.role)
            .bind(&invitation.job_title)
            .bind(&invitation.area)
            .fetch_one(&mut *transaction)
            .await
            .map_err(|_| ApiError::DatabaseUnavailable)?
        }
    };

    sqlx::query(
        r#"
        update public.member_invites
        set status = 'accepted',
            accepted_by = $2,
            accepted_at = now(),
            consumed_at = now(),
            use_count = use_count + 1
        where id = $1
        "#,
    )
    .bind(invitation.id)
    .bind(identity.id)
    .execute(&mut *transaction)
    .await
    .map_err(|_| ApiError::DatabaseUnavailable)?;

    transaction
        .commit()
        .await
        .map_err(|_| ApiError::DatabaseUnavailable)?;

    Ok(Json(AcceptedInviteResponse {
        member: MemberResponse::from(member),
        approval_required: invitation.approval_required,
    }))
}

pub async fn list(
    State(state): State<AppState>,
    identity: AuthenticatedUser,
) -> Result<Json<Vec<InviteListItem>>, ApiError> {
    require_manager(&state.database, &identity).await?;

    sqlx::query(
        "update public.member_invites set status = 'expired' where status = 'pending' and expires_at <= now()",
    )
    .execute(&state.database)
    .await
    .map_err(|_| ApiError::DatabaseUnavailable)?;

    let invitations = sqlx::query_as::<_, InviteListItem>(
        r#"
        select
            id,
            kind as mode,
            email,
            status,
            role,
            area,
            token_hint,
            approval_required,
            created_at,
            expires_at,
            accepted_at
        from public.member_invites
        order by created_at desc
        limit 200
        "#,
    )
    .fetch_all(&state.database)
    .await
    .map_err(|_| ApiError::DatabaseUnavailable)?;

    Ok(Json(invitations))
}

pub async fn revoke(
    State(state): State<AppState>,
    identity: AuthenticatedUser,
    Path(invite_id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    require_manager(&state.database, &identity).await?;

    sqlx::query(
        r#"
        update public.member_invites
        set status = 'revoked', revoked_at = now()
        where id = $1 and status = 'pending'
        "#,
    )
    .bind(invite_id)
    .execute(&state.database)
    .await
    .map_err(|_| ApiError::DatabaseUnavailable)?;

    Ok(StatusCode::NO_CONTENT)
}

async fn lock_invitation(
    transaction: &mut Transaction<'_, Postgres>,
    hash: &str,
) -> Result<InviteRow, ApiError> {
    sqlx::query_as::<_, InviteRow>(
        r#"
        select
            id,
            email,
            kind,
            status,
            name,
            role,
            job_title,
            area,
            expires_at,
            approval_required,
            use_count,
            max_uses
        from public.member_invites
        where token_hash = $1
        for update
        "#,
    )
    .bind(hash)
    .fetch_optional(&mut **transaction)
    .await
    .map_err(|_| ApiError::DatabaseUnavailable)?
    .ok_or(ApiError::InviteInvalidOrExpired)
}

async fn lock_existing_member(
    transaction: &mut Transaction<'_, Postgres>,
    auth_user_id: Uuid,
    email: &str,
) -> Result<Option<MemberRecord>, ApiError> {
    let by_id = sqlx::query_as::<_, MemberRecord>(
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
        for update
        "#,
    )
    .bind(auth_user_id)
    .fetch_optional(&mut **transaction)
    .await
    .map_err(|_| ApiError::DatabaseUnavailable)?;

    if by_id.is_some() {
        return Ok(by_id);
    }

    sqlx::query_as::<_, MemberRecord>(
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
        where lower(trim(email)) = $1
        limit 1
        for update
        "#,
    )
    .bind(email)
    .fetch_optional(&mut **transaction)
    .await
    .map_err(|_| ApiError::DatabaseUnavailable)
}

impl From<MemberRecord> for MemberResponse {
    fn from(member: MemberRecord) -> Self {
        Self {
            id: member.id,
            email: member.email,
            name: member.name,
            status: member.status,
            role: member.role,
            job_title: member.job_title.unwrap_or_default(),
            area: member.area.unwrap_or_default(),
        }
    }
}

fn normalize_mode(value: &str) -> Result<String, ApiError> {
    let mode = value.trim().to_ascii_lowercase();
    if matches!(mode.as_str(), "personal" | "quick") {
        Ok(mode)
    } else {
        Err(ApiError::InvalidInviteKind)
    }
}

fn normalize_email(value: &str) -> Result<String, ApiError> {
    let email = value.trim().to_ascii_lowercase();
    if email.len() < 3 || email.len() > 320 || email.chars().any(char::is_whitespace) {
        return Err(ApiError::InvalidEmail);
    }

    let Some((local, domain)) = email.split_once('@') else {
        return Err(ApiError::InvalidEmail);
    };
    if local.is_empty() || domain.is_empty() || domain.contains('@') || !domain.contains('.') {
        return Err(ApiError::InvalidEmail);
    }

    Ok(email)
}

fn normalize_token(value: &str) -> Result<String, ApiError> {
    let token = value.trim().to_ascii_lowercase();
    if token.len() == 64 && token.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        Ok(token)
    } else {
        Err(ApiError::InviteInvalidOrExpired)
    }
}

fn create_token() -> (String, String) {
    let mut bytes = [0_u8; 32];
    OsRng.fill_bytes(&mut bytes);
    let token = hex::encode(bytes);
    let hash = token_hash(&token);
    (token, hash)
}

fn token_hash(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}

fn clean_text(value: &str, max_chars: usize) -> String {
    value.trim().chars().take(max_chars).collect()
}

fn email_hint(email: &str) -> String {
    let Some((local, domain)) = email.split_once('@') else {
        return "***".to_string();
    };
    let first = local.chars().next().unwrap_or('*');
    format!("{first}***@{domain}")
}

fn invalid_inspection() -> InviteInspectionResponse {
    InviteInspectionResponse {
        valid: false,
        status: "invalid".to_string(),
        mode: None,
        email_hint: None,
        expires_at: None,
        approval_required: None,
    }
}

fn default_mode() -> String {
    "quick".to_string()
}

fn default_role() -> String {
    "member".to_string()
}

const fn default_valid_hours() -> i32 {
    48
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_email_and_token_formats() {
        assert_eq!(
            normalize_email(" Pessoa@Example.com ").unwrap(),
            "pessoa@example.com"
        );
        assert!(normalize_email("sem-dominio").is_err());
        assert!(normalize_token(&"a".repeat(64)).is_ok());
        assert!(normalize_token("token-curto").is_err());
    }

    #[test]
    fn hashes_tokens_without_storing_raw_value() {
        let (token, hash) = create_token();
        assert_eq!(token.len(), 64);
        assert_eq!(hash.len(), 64);
        assert_ne!(token, hash);
        assert_eq!(hash, token_hash(&token));
    }

    #[test]
    fn masks_personal_email() {
        assert_eq!(email_hint("pessoa@example.com"), "p***@example.com");
    }
}

use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{FromRow, Postgres, Transaction};
use uuid::Uuid;

use crate::{
    auth::{AuthenticatedMember, AuthenticatedUser},
    error::ApiError,
    state::AppState,
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateInviteInput {
    #[serde(default = "default_mode")]
    pub mode: String,
    pub email: Option<String>,
    pub name: Option<String>,
    #[serde(default = "default_role")]
    pub role: String,
    pub job_title: Option<String>,
    pub area: Option<String>,
    #[serde(default = "default_valid_hours")]
    pub valid_for_hours: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedInvite {
    pub id: Uuid,
    pub token: String,
    pub url_path: String,
    pub mode: String,
    pub email: Option<String>,
    pub expires_at: DateTime<Utc>,
    pub approval_required: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InviteInspection {
    pub valid: bool,
    pub status: String,
    pub mode: Option<String>,
    pub email_hint: Option<String>,
    pub expires_at: Option<DateTime<Utc>>,
    pub approval_required: Option<bool>,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct InviteListItem {
    pub id: Uuid,
    pub mode: String,
    pub email: Option<String>,
    pub status: String,
    pub role: String,
    pub area: String,
    pub token_hint: Option<String>,
    pub approval_required: bool,
    pub created_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
    pub accepted_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AcceptedInvite {
    pub member: AcceptedMember,
    pub approval_required: bool,
}

#[derive(Debug, Serialize, FromRow, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AcceptedMember {
    pub id: Uuid,
    pub email: String,
    pub name: String,
    pub status: String,
    pub role: String,
    pub job_title: String,
    pub area: String,
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

#[derive(Debug, FromRow)]
struct ExistingMember {
    id: Uuid,
    auth_user_id: Option<Uuid>,
    email: String,
    name: String,
    status: String,
    role: String,
    job_title: String,
    area: String,
}

pub async fn create(
    State(state): State<AppState>,
    actor: AuthenticatedMember,
    Json(input): Json<CreateInviteInput>,
) -> Result<Json<CreatedInvite>, ApiError> {
    actor.require_admin()?;
    let mode = normalize_mode(&input.mode)?;
    let role = normalize_role(&input.role)?;
    if role == "admin" && actor.role != "owner" {
        return Err(ApiError::PermissionDenied);
    }
    let email = if mode == "personal" {
        Some(normalize_email(
            input.email.as_deref().ok_or(ApiError::invalid("email"))?,
        )?)
    } else {
        None
    };
    let (token, token_hash) = create_token();
    let token_hint = token.chars().take(8).collect::<String>();
    let approval_required = mode == "quick";
    let valid_for_hours = input.valid_for_hours.clamp(1, 720);

    let mut tx = state.pool.begin().await?;
    sqlx::query("update public.member_invites set status='expired' where status='pending' and expires_at<=now()")
        .execute(&mut *tx).await?;
    if let Some(email) = &email {
        sqlx::query("update public.member_invites set status='revoked',revoked_at=now() where status='pending' and kind='personal' and normalized_email=$1")
            .bind(email).execute(&mut *tx).await?;
    }
    let id = Uuid::new_v4();
    let expires_at = Utc::now() + chrono::Duration::hours(i64::from(valid_for_hours));
    sqlx::query(
        r#"
        insert into public.member_invites (
          id,email,name,role,job_title,area,status,invited_by,expires_at,
          token_hash,token_hint,kind,max_uses,use_count,approval_required
        ) values ($1,$2,$3,$4,$5,$6,'pending',$7,$8,$9,$10,$11,1,0,$12)
    "#,
    )
    .bind(id)
    .bind(&email)
    .bind(clean_text(input.name.as_deref().unwrap_or_default(), 100))
    .bind(&role)
    .bind(clean_text(
        input.job_title.as_deref().unwrap_or_default(),
        120,
    ))
    .bind(clean_text(input.area.as_deref().unwrap_or_default(), 120))
    .bind(actor.member_id)
    .bind(expires_at)
    .bind(token_hash)
    .bind(token_hint)
    .bind(&mode)
    .bind(approval_required)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    Ok(Json(CreatedInvite {
        id,
        token: token.clone(),
        url_path: format!("/?invite={token}"),
        mode,
        email,
        expires_at,
        approval_required,
    }))
}

pub async fn inspect(
    State(state): State<AppState>,
    Path(raw_token): Path<String>,
) -> Result<Json<InviteInspection>, ApiError> {
    let token = match normalize_token(&raw_token) {
        Ok(value) => value,
        Err(_) => return Ok(Json(invalid_inspection())),
    };
    let invitation = sqlx::query_as::<_, InviteRow>(
        r#"
        select id,email,kind,status,name,role,coalesce(job_title,'') job_title,
               coalesce(area,'') area,expires_at,approval_required,use_count,max_uses
        from public.member_invites where token_hash=$1 limit 1
    "#,
    )
    .bind(token_hash(&token))
    .fetch_optional(&state.pool)
    .await?;
    let Some(invitation) = invitation else {
        return Ok(Json(invalid_inspection()));
    };
    let expired = invitation.status == "pending" && invitation.expires_at <= Utc::now();
    let valid =
        invitation.status == "pending" && !expired && invitation.use_count < invitation.max_uses;
    Ok(Json(InviteInspection {
        valid,
        status: if expired {
            "expired".to_string()
        } else {
            invitation.status
        },
        mode: Some(invitation.kind),
        email_hint: invitation.email.as_deref().map(email_hint),
        expires_at: Some(invitation.expires_at),
        approval_required: Some(invitation.approval_required),
    }))
}

pub async fn accept(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(raw_token): Path<String>,
) -> Result<Json<AcceptedInvite>, ApiError> {
    if !user.email_confirmed {
        return Err(ApiError::InvalidSession);
    }
    let email = normalize_email(&user.email)?;
    let token = normalize_token(&raw_token)?;
    let mut tx = state.pool.begin().await?;
    let invitation = lock_invitation(&mut tx, &token_hash(&token)).await?;
    if invitation.status != "pending"
        || invitation.expires_at <= Utc::now()
        || invitation.use_count >= invitation.max_uses
    {
        return Err(ApiError::Conflict("invite_invalid_or_expired"));
    }
    if invitation.kind == "personal" && invitation.email.as_deref() != Some(&email) {
        return Err(ApiError::PermissionDenied);
    }
    let existing = lock_member(&mut tx, user.id, &email).await?;
    let desired_status = if invitation.approval_required {
        "pending"
    } else {
        "active"
    };
    let member = match existing {
        Some(existing) => {
            if existing.auth_user_id.is_some_and(|id| id != user.id) { return Err(ApiError::Conflict("member_already_linked")); }
            if existing.status == "suspended" { return Err(ApiError::MemberSuspended); }
            let already_active = existing.status == "active";
            sqlx::query_as::<_, AcceptedMember>(r#"
                update public.members set auth_user_id=$2,email=$3,name=$4,status=$5,role=$6,
                job_title=$7,area=$8,last_seen_at=now() where id=$1
                returning id,email,name,status,role,coalesce(job_title,'') job_title,coalesce(area,'') area
            "#)
            .bind(existing.id)
            .bind(user.id)
            .bind(&email)
            .bind(if existing.name.trim().is_empty() { choose_name(&invitation, &user.display_name) } else { existing.name })
            .bind(if already_active { "active" } else { desired_status })
            .bind(if already_active || existing.role == "owner" { existing.role } else { invitation.role.clone() })
            .bind(if already_active || invitation.job_title.is_empty() { existing.job_title } else { invitation.job_title.clone() })
            .bind(if already_active || invitation.area.is_empty() { existing.area } else { invitation.area.clone() })
            .fetch_one(&mut *tx).await?
        }
        None => {
            sqlx::query_as::<_, AcceptedMember>(r#"
                insert into public.members (auth_user_id,email,name,status,role,job_title,area,last_seen_at)
                values ($1,$2,$3,$4,$5,$6,$7,now())
                returning id,email,name,status,role,coalesce(job_title,'') job_title,coalesce(area,'') area
            "#)
            .bind(user.id).bind(&email).bind(choose_name(&invitation, &user.display_name))
            .bind(desired_status).bind(&invitation.role).bind(&invitation.job_title).bind(&invitation.area)
            .fetch_one(&mut *tx).await?
        }
    };
    sqlx::query("update public.member_invites set status='accepted',accepted_by=$2,accepted_at=now(),consumed_at=now(),use_count=use_count+1 where id=$1")
        .bind(invitation.id).bind(user.id).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(Json(AcceptedInvite {
        member,
        approval_required: invitation.approval_required,
    }))
}

pub async fn list(
    State(state): State<AppState>,
    actor: AuthenticatedMember,
) -> Result<Json<Vec<InviteListItem>>, ApiError> {
    actor.require_admin()?;
    sqlx::query("update public.member_invites set status='expired' where status='pending' and expires_at<=now()")
        .execute(&state.pool).await?;
    let rows = sqlx::query_as::<_, InviteListItem>(
        r#"
        select id,kind mode,email,status,role,coalesce(area,'') area,token_hint,
               approval_required,created_at,expires_at,accepted_at
        from public.member_invites order by created_at desc limit 200
    "#,
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(rows))
}

pub async fn revoke(
    State(state): State<AppState>,
    actor: AuthenticatedMember,
    Path(invite_id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    actor.require_admin()?;
    sqlx::query("update public.member_invites set status='revoked',revoked_at=now() where id=$1 and status='pending'")
        .bind(invite_id).execute(&state.pool).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn lock_invitation(
    tx: &mut Transaction<'_, Postgres>,
    hash: &str,
) -> Result<InviteRow, ApiError> {
    sqlx::query_as::<_, InviteRow>(
        r#"
        select id,email,kind,status,name,role,coalesce(job_title,'') job_title,
               coalesce(area,'') area,expires_at,approval_required,use_count,max_uses
        from public.member_invites where token_hash=$1 for update
    "#,
    )
    .bind(hash)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or(ApiError::NotFound("invite"))
}

async fn lock_member(
    tx: &mut Transaction<'_, Postgres>,
    user_id: Uuid,
    email: &str,
) -> Result<Option<ExistingMember>, ApiError> {
    sqlx::query_as::<_, ExistingMember>(r#"
        select id,auth_user_id,email,name,status,role,coalesce(job_title,'') job_title,coalesce(area,'') area
        from public.members where auth_user_id=$1 or lower(email)=$2
        order by (auth_user_id=$1) desc limit 1 for update
    "#).bind(user_id).bind(email).fetch_optional(&mut **tx).await.map_err(ApiError::from)
}

fn create_token() -> (String, String) {
    let bytes: [u8; 32] = rand::random();
    let token = hex::encode(bytes);
    let hash = token_hash(&token);
    (token, hash)
}
fn token_hash(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}
fn normalize_token(value: &str) -> Result<String, ApiError> {
    let token = value.trim().to_ascii_lowercase();
    (token.len() == 64 && token.bytes().all(|byte| byte.is_ascii_hexdigit()))
        .then_some(token)
        .ok_or(ApiError::invalid("inviteToken"))
}
fn normalize_email(value: &str) -> Result<String, ApiError> {
    let email = value.trim().to_ascii_lowercase();
    let valid = email.len() <= 320
        && email
            .split_once('@')
            .is_some_and(|(local, domain)| !local.is_empty() && domain.contains('.'));
    valid.then_some(email).ok_or(ApiError::invalid("email"))
}
fn normalize_mode(value: &str) -> Result<String, ApiError> {
    let value = value.trim().to_ascii_lowercase();
    matches!(value.as_str(), "quick" | "personal")
        .then_some(value)
        .ok_or(ApiError::invalid("mode"))
}
fn normalize_role(value: &str) -> Result<String, ApiError> {
    let value = value.trim().to_ascii_lowercase();
    matches!(value.as_str(), "admin" | "manager" | "member" | "viewer")
        .then_some(value)
        .ok_or(ApiError::invalid("role"))
}
fn choose_name(invite: &InviteRow, fallback: &str) -> String {
    if invite.name.trim().len() >= 2 {
        invite.name.clone()
    } else {
        fallback.to_string()
    }
}
fn clean_text(value: &str, max: usize) -> String {
    value.trim().chars().take(max).collect()
}
fn email_hint(email: &str) -> String {
    email
        .split_once('@')
        .map(|(local, domain)| format!("{}***@{domain}", local.chars().next().unwrap_or('*')))
        .unwrap_or_else(|| "***".to_string())
}
fn invalid_inspection() -> InviteInspection {
    InviteInspection {
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

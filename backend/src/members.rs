use axum::{
    Json,
    extract::{Path, State},
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

use crate::{auth::AuthenticatedMember, error::ApiError, files::signed_asset_url, state::AppState};

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct MemberView {
    pub id: Uuid,
    pub email: String,
    pub name: String,
    pub status: String,
    pub role: String,
    pub job_title: String,
    pub area: String,
    pub assignments: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub last_seen_at: DateTime<Utc>,
    pub avatar_path: String,
    #[sqlx(skip)]
    pub avatar_url: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMemberInput {
    pub name: Option<String>,
    pub status: Option<String>,
    pub role: Option<String>,
    pub job_title: Option<String>,
    pub area: Option<String>,
    pub assignments: Option<Vec<String>>,
}

pub async fn me(member: AuthenticatedMember) -> Json<AuthenticatedMember> {
    Json(member)
}

pub async fn list_members(
    State(state): State<AppState>,
    _member: AuthenticatedMember,
) -> Result<Json<Vec<MemberView>>, ApiError> {
    let mut members = sqlx::query_as::<_, MemberView>(
        r#"
        select id, email, name, status, role,
               coalesce(job_title, '') as job_title,
               coalesce(area, '') as area,
               coalesce(assignments, array[]::text[]) as assignments,
               created_at, last_seen_at,
               coalesce(avatar_path, '') as avatar_path
        from public.members
        order by case status when 'active' then 0 when 'pending' then 1 else 2 end,
                 lower(name), lower(email)
        "#,
    )
    .fetch_all(&state.pool)
    .await?;

    for item in &mut members {
        item.avatar_url = signed_asset_url(&state, &item.avatar_path, 28_800)
            .await
            .unwrap_or_default();
    }
    Ok(Json(members))
}

pub async fn update_member(
    State(state): State<AppState>,
    actor: AuthenticatedMember,
    Path(member_id): Path<Uuid>,
    Json(input): Json<UpdateMemberInput>,
) -> Result<Json<MemberView>, ApiError> {
    actor.require_admin()?;
    if input.role.as_deref() == Some("owner") && actor.role != "owner" {
        return Err(ApiError::PermissionDenied);
    }
    validate_member_input(&input)?;

    let mut member = sqlx::query_as::<_, MemberView>(
        r#"
        update public.members
        set name = coalesce($2, name),
            status = coalesce($3, status),
            role = coalesce($4, role),
            job_title = coalesce($5, job_title),
            area = coalesce($6, area),
            assignments = coalesce($7, assignments),
            updated_at = now()
        where id = $1
        returning id, email, name, status, role,
                  coalesce(job_title, '') as job_title,
                  coalesce(area, '') as area,
                  coalesce(assignments, array[]::text[]) as assignments,
                  created_at, last_seen_at,
                  coalesce(avatar_path, '') as avatar_path
        "#,
    )
    .bind(member_id)
    .bind(
        input
            .name
            .map(|value| value.trim().chars().take(120).collect::<String>()),
    )
    .bind(input.status)
    .bind(input.role)
    .bind(
        input
            .job_title
            .map(|value| value.trim().chars().take(120).collect::<String>()),
    )
    .bind(
        input
            .area
            .map(|value| value.trim().chars().take(120).collect::<String>()),
    )
    .bind(input.assignments)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound("member"))?;

    member.avatar_url = signed_asset_url(&state, &member.avatar_path, 28_800)
        .await
        .unwrap_or_default();
    Ok(Json(member))
}

fn validate_member_input(input: &UpdateMemberInput) -> Result<(), ApiError> {
    if let Some(status) = &input.status
        && !matches!(status.as_str(), "pending" | "active" | "suspended")
    {
        return Err(ApiError::invalid("status"));
    }
    if let Some(role) = &input.role
        && !matches!(
            role.as_str(),
            "owner" | "admin" | "manager" | "member" | "viewer"
        )
    {
        return Err(ApiError::invalid("role"));
    }
    if input
        .name
        .as_ref()
        .is_some_and(|value| value.trim().is_empty())
    {
        return Err(ApiError::invalid("name"));
    }
    Ok(())
}

use axum::{
    Json,
    extract::{Path, State},
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, types::Json as SqlJson};
use uuid::Uuid;

use crate::{auth::AuthenticatedMember, error::ApiError, files::signed_asset_url, state::AppState};

#[derive(Debug, Clone, Serialize)]
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
    pub avatar_url: String,
}

#[derive(Debug, FromRow)]
pub(crate) struct MemberRow {
    id: Uuid,
    email: String,
    name: String,
    status: String,
    role: String,
    job_title: String,
    area: String,
    assignments_json: String,
    created_at: DateTime<Utc>,
    last_seen_at: DateTime<Utc>,
    avatar_path: String,
}

impl MemberRow {
    pub(crate) fn into_view(self) -> MemberView {
        MemberView {
            id: self.id,
            email: self.email,
            name: self.name,
            status: self.status,
            role: self.role,
            job_title: self.job_title,
            area: self.area,
            assignments: serde_json::from_str(&self.assignments_json).unwrap_or_default(),
            created_at: self.created_at,
            last_seen_at: self.last_seen_at,
            avatar_path: self.avatar_path,
            avatar_url: String::new(),
        }
    }
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
    let rows = sqlx::query_as::<_, MemberRow>(
        r#"
        select id, email, name, status::text as status, role::text as role,
               coalesce(job_title, '') as job_title,
               coalesce(area, '') as area,
               coalesce(assignments, '[]'::jsonb)::text as assignments_json,
               created_at, last_seen_at,
               coalesce(avatar_path, '') as avatar_path
        from public.members
        order by case status::text when 'active' then 0 when 'pending' then 1 else 2 end,
                 lower(name), lower(email)
        "#,
    )
    .fetch_all(&state.pool)
    .await?;

    let mut members = rows.into_iter().map(MemberRow::into_view).collect::<Vec<_>>();
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

    let assignments = input.assignments.map(SqlJson);
    let row = sqlx::query_as::<_, MemberRow>(
        r#"
        update public.members
        set name = coalesce($2, name),
            status = coalesce($3, status::text),
            role = coalesce($4, role::text),
            job_title = coalesce($5, job_title),
            area = coalesce($6, area),
            assignments = coalesce($7::jsonb, assignments),
            updated_at = now()
        where id = $1
        returning id, email, name, status::text as status, role::text as role,
                  coalesce(job_title, '') as job_title,
                  coalesce(area, '') as area,
                  coalesce(assignments, '[]'::jsonb)::text as assignments_json,
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
    .bind(assignments)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound("member"))?;

    let mut member = row.into_view();
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

use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

use crate::{auth::AuthenticatedMember, error::ApiError, state::AppState};

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct JobRoleView {
    pub id: Uuid,
    pub name: String,
    pub department: String,
    pub color: String,
    pub icon: String,
    pub position: i32,
    pub permissions: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveRoleInput {
    pub name: String,
    pub department: String,
    pub color: String,
    pub position: i32,
    #[serde(default)]
    pub permissions: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetMemberRolesInput {
    #[serde(default)]
    pub role_ids: Vec<Uuid>,
}

pub async fn list(
    State(state): State<AppState>,
    _member: AuthenticatedMember,
) -> Result<Json<Vec<JobRoleView>>, ApiError> {
    let roles = sqlx::query_as::<_, JobRoleView>(
        r#"
        select id, name, coalesce(department, 'Outros') department,
               coalesce(color, '#8baeff') color,
               coalesce(icon, 'star') icon,
               coalesce(position, 100)::integer position,
               coalesce(permissions, array[]::text[]) permissions
        from public.job_roles
        order by position, lower(name)
        "#,
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(roles))
}

pub async fn create(
    State(state): State<AppState>,
    actor: AuthenticatedMember,
    Json(input): Json<SaveRoleInput>,
) -> Result<Json<JobRoleView>, ApiError> {
    actor.require_admin()?;
    validate(&input)?;
    let role = sqlx::query_as::<_, JobRoleView>(
        r#"
        insert into public.job_roles (name, department, color, icon, position, permissions)
        values ($1, $2, $3, 'star', $4, $5)
        returning id, name, department, color, icon, position::integer, permissions
        "#,
    )
    .bind(clean(&input.name, 100))
    .bind(clean_or(&input.department, 100, "Outros"))
    .bind(clean_or(&input.color, 32, "#8baeff"))
    .bind(input.position.clamp(0, 100_000))
    .bind(sanitize_permissions(input.permissions))
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(role))
}

pub async fn update(
    State(state): State<AppState>,
    actor: AuthenticatedMember,
    Path(role_id): Path<Uuid>,
    Json(input): Json<SaveRoleInput>,
) -> Result<Json<JobRoleView>, ApiError> {
    actor.require_admin()?;
    validate(&input)?;
    let role = sqlx::query_as::<_, JobRoleView>(
        r#"
        update public.job_roles
        set name=$2, department=$3, color=$4, icon='star', position=$5, permissions=$6
        where id=$1
        returning id, name, department, color, icon, position::integer, permissions
        "#,
    )
    .bind(role_id)
    .bind(clean(&input.name, 100))
    .bind(clean_or(&input.department, 100, "Outros"))
    .bind(clean_or(&input.color, 32, "#8baeff"))
    .bind(input.position.clamp(0, 100_000))
    .bind(sanitize_permissions(input.permissions))
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound("job_role"))?;
    Ok(Json(role))
}

pub async fn delete(
    State(state): State<AppState>,
    actor: AuthenticatedMember,
    Path(role_id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    actor.require_admin()?;
    let result = sqlx::query("delete from public.job_roles where id=$1")
        .bind(role_id)
        .execute(&state.pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound("job_role"));
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn list_for_member(
    State(state): State<AppState>,
    _actor: AuthenticatedMember,
    Path(member_id): Path<Uuid>,
) -> Result<Json<Vec<JobRoleView>>, ApiError> {
    let roles = sqlx::query_as::<_, JobRoleView>(
        r#"
        select role.id, role.name, coalesce(role.department, 'Outros') department,
               coalesce(role.color, '#8baeff') color, coalesce(role.icon, 'star') icon,
               coalesce(role.position, 100)::integer position,
               coalesce(role.permissions, array[]::text[]) permissions
        from public.member_job_roles assignment
        join public.job_roles role on role.id = assignment.job_role_id
        where assignment.member_id = $1
        order by assignment.is_primary desc, role.position, lower(role.name)
        "#,
    )
    .bind(member_id)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(roles))
}

pub async fn set_for_member(
    State(state): State<AppState>,
    actor: AuthenticatedMember,
    Path(member_id): Path<Uuid>,
    Json(input): Json<SetMemberRolesInput>,
) -> Result<Json<Vec<JobRoleView>>, ApiError> {
    actor.require_admin()?;
    let mut unique = input.role_ids;
    unique.sort_unstable();
    unique.dedup();
    if unique.len() > 20 {
        return Err(ApiError::invalid("roleIds"));
    }

    let mut tx = state.pool.begin().await?;
    sqlx::query("delete from public.member_job_roles where member_id=$1")
        .bind(member_id)
        .execute(&mut *tx)
        .await?;
    for (index, role_id) in unique.iter().enumerate() {
        sqlx::query(
            r#"
            insert into public.member_job_roles (member_id, job_role_id, is_primary)
            values ($1, $2, $3)
            "#,
        )
        .bind(member_id)
        .bind(role_id)
        .bind(index == 0)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    list_for_member(State(state), actor, Path(member_id)).await
}

fn validate(input: &SaveRoleInput) -> Result<(), ApiError> {
    if input.name.trim().is_empty() {
        return Err(ApiError::invalid("name"));
    }
    if !input.color.trim().starts_with('#') || input.color.trim().len() > 32 {
        return Err(ApiError::invalid("color"));
    }
    Ok(())
}

fn clean(value: &str, limit: usize) -> String {
    value.trim().chars().take(limit).collect()
}

fn clean_or(value: &str, limit: usize, fallback: &str) -> String {
    let value = clean(value, limit);
    if value.is_empty() { fallback.to_string() } else { value }
}

fn sanitize_permissions(values: Vec<String>) -> Vec<String> {
    let mut values = values
        .into_iter()
        .map(|value| clean(&value, 80))
        .filter(|value| !value.is_empty())
        .take(100)
        .collect::<Vec<_>>();
    values.sort();
    values.dedup();
    values
}

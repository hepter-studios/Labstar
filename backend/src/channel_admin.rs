use axum::{
    Json,
    extract::{Path, State},
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{auth::AuthenticatedMember, error::ApiError, state::AppState};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePermissionsInput {
    #[serde(default)]
    pub allowed_roles: Vec<String>,
    #[serde(default)]
    pub allowed_assignments: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelPermissionsView {
    pub id: Uuid,
    pub allowed_roles: Vec<String>,
    pub allowed_assignments: Vec<String>,
}

pub async fn update_permissions(
    State(state): State<AppState>,
    actor: AuthenticatedMember,
    Path(channel_id): Path<Uuid>,
    Json(input): Json<UpdatePermissionsInput>,
) -> Result<Json<ChannelPermissionsView>, ApiError> {
    actor.require_admin()?;
    let requested_roles = sanitize_roles(input.allowed_roles)?;
    let assignments = sanitize(input.allowed_assignments, 50, 100);
    let restricted = !requested_roles.is_empty() || !assignments.is_empty();
    let mut roles = if restricted {
        vec!["owner".to_string(), "admin".to_string()]
    } else {
        Vec::new()
    };
    roles.extend(requested_roles);
    roles.sort();
    roles.dedup();

    let row = sqlx::query_as::<_, (Uuid, Vec<String>, Vec<String>)>(
        r#"
        update public.channels
        set allowed_roles=$2, allowed_assignments=$3
        where id=$1
        returning id,
          coalesce(allowed_roles,array[]::text[]),
          coalesce(allowed_assignments,array[]::text[])
        "#,
    )
    .bind(channel_id)
    .bind(&roles)
    .bind(&assignments)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound("channel"))?;

    Ok(Json(ChannelPermissionsView {
        id: row.0,
        allowed_roles: row.1,
        allowed_assignments: row.2,
    }))
}

fn sanitize_roles(values: Vec<String>) -> Result<Vec<String>, ApiError> {
    let mut result = Vec::new();
    for value in values {
        let value = value.trim().to_ascii_lowercase();
        if !matches!(
            value.as_str(),
            "owner" | "admin" | "manager" | "member" | "viewer"
        ) {
            return Err(ApiError::invalid("allowedRoles"));
        }
        result.push(value);
    }
    result.sort();
    result.dedup();
    Ok(result)
}

fn sanitize(values: Vec<String>, max_items: usize, max_chars: usize) -> Vec<String> {
    let mut result = values
        .into_iter()
        .map(|value| value.trim().chars().take(max_chars).collect::<String>())
        .filter(|value| !value.is_empty())
        .take(max_items)
        .collect::<Vec<_>>();
    result.sort();
    result.dedup();
    result
}

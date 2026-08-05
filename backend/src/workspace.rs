use axum::{Json, extract::State};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{auth::AuthenticatedMember, error::ApiError, state::AppState};

const MAIN_WORKSPACE_ID: &str = "labstar-main";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceResponse {
    pub nodes: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveWorkspaceInput {
    pub nodes: Value,
}

pub async fn load(
    State(state): State<AppState>,
    _member: AuthenticatedMember,
) -> Result<Json<WorkspaceResponse>, ApiError> {
    let nodes = sqlx::query_scalar::<_, Value>(
        "select nodes from public.workspaces where id = $1",
    )
    .bind(MAIN_WORKSPACE_ID)
    .fetch_optional(&state.pool)
    .await?
    .unwrap_or_else(|| Value::Array(Vec::new()));

    Ok(Json(WorkspaceResponse { nodes }))
}

pub async fn save(
    State(state): State<AppState>,
    member: AuthenticatedMember,
    Json(input): Json<SaveWorkspaceInput>,
) -> Result<Json<WorkspaceResponse>, ApiError> {
    member.require_manager()?;
    if !input.nodes.is_array() {
        return Err(ApiError::invalid("nodes"));
    }
    let serialized = serde_json::to_vec(&input.nodes).map_err(|_| ApiError::invalid("nodes"))?;
    if serialized.len() > 2 * 1024 * 1024 {
        return Err(ApiError::PayloadTooLarge);
    }

    sqlx::query(
        r#"
        insert into public.workspaces (id, nodes, updated_at)
        values ($1, $2, now())
        on conflict (id) do update
          set nodes = excluded.nodes,
              updated_at = excluded.updated_at
        "#,
    )
    .bind(MAIN_WORKSPACE_ID)
    .bind(&input.nodes)
    .execute(&state.pool)
    .await?;

    Ok(Json(WorkspaceResponse { nodes: input.nodes }))
}

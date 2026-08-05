use axum::{
    Json,
    extract::{Path, State},
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    auth::AuthenticatedMember,
    error::ApiError,
    state::{AppState, BackendEvent},
};

const WORKSPACE_ID: &str = "labstar-work-items-v1";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkItem {
    pub id: Uuid,
    pub title: String,
    pub details: String,
    pub kind: String,
    pub status: String,
    pub priority: String,
    pub channel_id: Option<Uuid>,
    pub space_id: Option<Uuid>,
    pub assignee_id: Option<Uuid>,
    pub created_by: Uuid,
    pub due_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorkItemInput {
    pub title: String,
    pub details: Option<String>,
    pub kind: String,
    pub priority: String,
    pub channel_id: Option<Uuid>,
    pub space_id: Option<Uuid>,
    pub assignee_id: Option<Uuid>,
    pub due_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateWorkItemInput {
    pub title: Option<String>,
    pub details: Option<String>,
    pub kind: Option<String>,
    pub status: Option<String>,
    pub priority: Option<String>,
    pub channel_id: Option<Option<Uuid>>,
    pub space_id: Option<Option<Uuid>>,
    pub assignee_id: Option<Option<Uuid>>,
    pub due_at: Option<Option<DateTime<Utc>>>,
}

pub async fn list_work_items(
    State(state): State<AppState>,
    _member: AuthenticatedMember,
) -> Result<Json<Vec<WorkItem>>, ApiError> {
    let mut items = load_items(&state).await?;
    sort_items(&mut items);
    Ok(Json(items))
}

pub async fn create_work_item(
    State(state): State<AppState>,
    member: AuthenticatedMember,
    Json(input): Json<CreateWorkItemInput>,
) -> Result<Json<WorkItem>, ApiError> {
    validate_kind(&input.kind)?;
    validate_priority(&input.priority)?;
    let title = clean_required(&input.title, 180, "title")?;
    let now = Utc::now();
    let item = WorkItem {
        id: Uuid::new_v4(),
        title,
        details: clean_optional(input.details, 12_000),
        kind: input.kind,
        status: "open".to_string(),
        priority: input.priority,
        channel_id: input.channel_id,
        space_id: input.space_id,
        assignee_id: input.assignee_id,
        created_by: member.member_id,
        due_at: input.due_at,
        completed_at: None,
        created_at: now,
        updated_at: now,
    };
    mutate_items(&state, |items| items.insert(0, item.clone())).await?;
    state.publish(BackendEvent::WorkItemsChanged);
    Ok(Json(item))
}

pub async fn update_work_item(
    State(state): State<AppState>,
    _member: AuthenticatedMember,
    Path(item_id): Path<Uuid>,
    Json(input): Json<UpdateWorkItemInput>,
) -> Result<Json<WorkItem>, ApiError> {
    if let Some(kind) = &input.kind {
        validate_kind(kind)?;
    }
    if let Some(status) = &input.status {
        validate_status(status)?;
    }
    if let Some(priority) = &input.priority {
        validate_priority(priority)?;
    }
    let mut updated = None;
    mutate_items(&state, |items| {
        if let Some(item) = items.iter_mut().find(|item| item.id == item_id) {
            if let Some(title) = &input.title {
                item.title =
                    clean_required(title, 180, "title").unwrap_or_else(|_| item.title.clone());
            }
            if let Some(details) = &input.details {
                item.details = details.trim().chars().take(12_000).collect();
            }
            if let Some(kind) = &input.kind {
                item.kind = kind.clone();
            }
            if let Some(status) = &input.status {
                item.status = status.clone();
                item.completed_at = if status == "done" {
                    item.completed_at.or(Some(Utc::now()))
                } else {
                    None
                };
            }
            if let Some(priority) = &input.priority {
                item.priority = priority.clone();
            }
            if let Some(value) = input.channel_id {
                item.channel_id = value;
            }
            if let Some(value) = input.space_id {
                item.space_id = value;
            }
            if let Some(value) = input.assignee_id {
                item.assignee_id = value;
            }
            if let Some(value) = input.due_at {
                item.due_at = value;
            }
            item.updated_at = Utc::now();
            updated = Some(item.clone());
        }
    })
    .await?;
    let updated = updated.ok_or(ApiError::NotFound("work_item"))?;
    state.publish(BackendEvent::WorkItemsChanged);
    Ok(Json(updated))
}

pub async fn delete_work_item(
    State(state): State<AppState>,
    member: AuthenticatedMember,
    Path(item_id): Path<Uuid>,
) -> Result<Json<Value>, ApiError> {
    member.require_manager()?;
    let mut removed = false;
    mutate_items(&state, |items| {
        let before = items.len();
        items.retain(|item| item.id != item_id);
        removed = items.len() != before;
    })
    .await?;
    if !removed {
        return Err(ApiError::NotFound("work_item"));
    }
    state.publish(BackendEvent::WorkItemsChanged);
    Ok(Json(serde_json::json!({"ok": true})))
}

async fn load_items(state: &AppState) -> Result<Vec<WorkItem>, ApiError> {
    let value = sqlx::query_scalar::<_, Value>("select nodes from public.workspaces where id=$1")
        .bind(WORKSPACE_ID)
        .fetch_optional(&state.pool)
        .await?;
    match value {
        Some(Value::Array(items)) => Ok(items
            .into_iter()
            .filter_map(|value| serde_json::from_value(value).ok())
            .collect()),
        _ => Ok(Vec::new()),
    }
}

async fn mutate_items<F>(state: &AppState, mutate: F) -> Result<(), ApiError>
where
    F: FnOnce(&mut Vec<WorkItem>),
{
    let mut tx = state.pool.begin().await?;
    let current = sqlx::query_scalar::<_, Value>(
        "select nodes from public.workspaces where id=$1 for update",
    )
    .bind(WORKSPACE_ID)
    .fetch_optional(&mut *tx)
    .await?;
    let mut items = match current {
        Some(Value::Array(values)) => values
            .into_iter()
            .filter_map(|value| serde_json::from_value(value).ok())
            .collect(),
        _ => Vec::new(),
    };
    mutate(&mut items);
    let nodes = serde_json::to_value(items).map_err(|_| ApiError::Internal)?;
    sqlx::query(
        r#"
        insert into public.workspaces (id,nodes,updated_at) values ($1,$2,now())
        on conflict (id) do update set nodes=excluded.nodes, updated_at=excluded.updated_at
    "#,
    )
    .bind(WORKSPACE_ID)
    .bind(nodes)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(())
}

fn sort_items(items: &mut [WorkItem]) {
    items.sort_by(|a, b| {
        let done = (a.status == "done").cmp(&(b.status == "done"));
        if done != std::cmp::Ordering::Equal {
            return done;
        }
        match (a.due_at, b.due_at) {
            (Some(left), Some(right)) => left.cmp(&right),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            _ => b.updated_at.cmp(&a.updated_at),
        }
    });
}

fn validate_kind(value: &str) -> Result<(), ApiError> {
    matches!(value, "task" | "decision" | "follow_up")
        .then_some(())
        .ok_or(ApiError::invalid("kind"))
}
fn validate_status(value: &str) -> Result<(), ApiError> {
    matches!(value, "open" | "in_progress" | "blocked" | "done")
        .then_some(())
        .ok_or(ApiError::invalid("status"))
}
fn validate_priority(value: &str) -> Result<(), ApiError> {
    matches!(value, "low" | "medium" | "high" | "urgent")
        .then_some(())
        .ok_or(ApiError::invalid("priority"))
}
fn clean_required(value: &str, limit: usize, field: &'static str) -> Result<String, ApiError> {
    let value = value.trim().chars().take(limit).collect::<String>();
    if value.is_empty() {
        Err(ApiError::invalid(field))
    } else {
        Ok(value)
    }
}
fn clean_optional(value: Option<String>, limit: usize) -> String {
    value
        .unwrap_or_default()
        .trim()
        .chars()
        .take(limit)
        .collect()
}

use axum::{
    Json,
    extract::{Path, State},
};
use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::FromRow;
use uuid::Uuid;

use crate::{auth::AuthenticatedMember, error::ApiError, state::AppState};

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct NotificationView {
    pub id: Uuid,
    pub title: String,
    pub body: String,
    pub channel_id: Option<Uuid>,
    pub is_read: bool,
    pub created_at: DateTime<Utc>,
}

pub async fn list(
    State(state): State<AppState>,
    member: AuthenticatedMember,
) -> Result<Json<Vec<NotificationView>>, ApiError> {
    let notifications = sqlx::query_as::<_, NotificationView>(
        r#"
        select id,title,body,channel_id,is_read,created_at
        from public.notifications
        where recipient_id=$1
        order by created_at desc
        limit 100
        "#,
    )
    .bind(member.member_id)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(notifications))
}

pub async fn mark_read(
    State(state): State<AppState>,
    member: AuthenticatedMember,
    Path(notification_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let result =
        sqlx::query("update public.notifications set is_read=true where id=$1 and recipient_id=$2")
            .bind(notification_id)
            .bind(member.member_id)
            .execute(&state.pool)
            .await?;
    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound("notification"));
    }
    Ok(Json(serde_json::json!({"ok":true})))
}

pub async fn mark_all_read(
    State(state): State<AppState>,
    member: AuthenticatedMember,
) -> Result<Json<serde_json::Value>, ApiError> {
    sqlx::query(
        "update public.notifications set is_read=true where recipient_id=$1 and is_read=false",
    )
    .bind(member.member_id)
    .execute(&state.pool)
    .await?;
    Ok(Json(serde_json::json!({"ok":true})))
}

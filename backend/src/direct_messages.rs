use axum::{
    Json,
    extract::{Path, State},
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

use crate::{
    auth::AuthenticatedMember,
    error::ApiError,
    files::signed_asset_url,
    state::{AppState, BackendEvent},
};

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ThreadSummary {
    pub thread_id: Uuid,
    pub other_member_id: Uuid,
    pub updated_at: DateTime<Utc>,
    pub last_message_body: String,
    pub last_message_at: Option<DateTime<Utc>>,
    pub unread_count: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateThreadInput {
    pub other_member_id: Uuid,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageInput {
    pub body: String,
    pub reply_to: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMessageInput {
    pub body: Option<String>,
    pub is_pinned: Option<bool>,
}

#[derive(Debug, FromRow)]
struct MessageRow {
    id: Uuid,
    thread_id: Uuid,
    author_id: Uuid,
    body: String,
    created_at: DateTime<Utc>,
    edited_at: Option<DateTime<Utc>>,
    reply_to: Option<Uuid>,
    is_pinned: bool,
    author_name: String,
    author_email: String,
    avatar_path: String,
    job_title: String,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentView {
    pub id: Uuid,
    pub message_id: Uuid,
    pub file_name: String,
    pub file_path: String,
    pub mime_type: String,
    pub size_bytes: i64,
    pub sha256: String,
    #[sqlx(default)]
    pub url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthorView {
    pub id: Uuid,
    pub name: String,
    pub email: String,
    pub avatar_path: String,
    pub avatar_url: String,
    pub job_title: String,
    pub job_roles: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageView {
    pub id: Uuid,
    pub thread_id: Uuid,
    pub author_id: Uuid,
    pub body: String,
    pub created_at: DateTime<Utc>,
    pub edited_at: Option<DateTime<Utc>>,
    pub reply_to: Option<Uuid>,
    pub is_pinned: bool,
    pub author: AuthorView,
    pub attachments: Vec<AttachmentView>,
}

pub async fn list_threads(
    State(state): State<AppState>,
    member: AuthenticatedMember,
) -> Result<Json<Vec<ThreadSummary>>, ApiError> {
    let rows = sqlx::query_as::<_, ThreadSummary>(
        r#"
        select dt.id thread_id, other.member_id other_member_id, dt.updated_at,
               coalesce(last_message.body, '') last_message_body,
               last_message.created_at last_message_at,
               coalesce(unread.total, 0)::bigint unread_count
        from public.direct_thread_members mine
        join public.direct_threads dt on dt.id = mine.thread_id
        join lateral (
          select member_id from public.direct_thread_members
          where thread_id = dt.id and member_id <> $1 order by joined_at limit 1
        ) other on true
        left join lateral (
          select body, created_at from public.direct_messages
          where thread_id = dt.id order by created_at desc limit 1
        ) last_message on true
        left join lateral (
          select count(*)::bigint total from public.direct_messages message
          where message.thread_id = dt.id and message.author_id <> $1
            and message.created_at > mine.last_read_at
        ) unread on true
        where mine.member_id = $1
        order by coalesce(last_message.created_at, dt.updated_at) desc
    "#,
    )
    .bind(member.member_id)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(rows))
}

pub async fn create_thread(
    State(state): State<AppState>,
    member: AuthenticatedMember,
    Json(input): Json<CreateThreadInput>,
) -> Result<Json<serde_json::Value>, ApiError> {
    if input.other_member_id == member.member_id {
        return Err(ApiError::invalid("otherMemberId"));
    }
    let active = sqlx::query_scalar::<_, bool>(
        "select exists(select 1 from public.members where id = $1 and status = 'active')",
    )
    .bind(input.other_member_id)
    .fetch_one(&state.pool)
    .await?;
    if !active {
        return Err(ApiError::NotFound("recipient"));
    }

    let mut tx = state.pool.begin().await?;
    let existing = sqlx::query_scalar::<_, Uuid>(r#"
        select thread.id from public.direct_threads thread
        where exists(select 1 from public.direct_thread_members where thread_id = thread.id and member_id = $1)
          and exists(select 1 from public.direct_thread_members where thread_id = thread.id and member_id = $2)
          and (select count(*) from public.direct_thread_members where thread_id = thread.id) = 2
        order by thread.updated_at desc limit 1
    "#).bind(member.member_id).bind(input.other_member_id).fetch_optional(&mut *tx).await?;

    let thread_id = match existing {
        Some(id) => id,
        None => {
            let id = Uuid::new_v4();
            sqlx::query("insert into public.direct_threads (id) values ($1)")
                .bind(id)
                .execute(&mut *tx)
                .await?;
            sqlx::query("insert into public.direct_thread_members (thread_id, member_id) values ($1,$2),($1,$3)")
                .bind(id).bind(member.member_id).bind(input.other_member_id).execute(&mut *tx).await?;
            id
        }
    };
    tx.commit().await?;
    Ok(Json(serde_json::json!({"threadId": thread_id})))
}

pub async fn list_messages(
    State(state): State<AppState>,
    member: AuthenticatedMember,
    Path(thread_id): Path<Uuid>,
) -> Result<Json<Vec<MessageView>>, ApiError> {
    ensure_member(&state, thread_id, member.member_id).await?;
    let rows = sqlx::query_as::<_, MessageRow>(
        r#"
        select message.id, message.thread_id, message.author_id, message.body,
               message.created_at, message.edited_at, message.reply_to, message.is_pinned,
               author.name author_name, author.email author_email,
               coalesce(author.avatar_path, '') avatar_path,
               coalesce(author.job_title, '') job_title
        from public.direct_messages message
        join public.members author on author.id = message.author_id
        where message.thread_id = $1 order by message.created_at asc limit 500
    "#,
    )
    .bind(thread_id)
    .fetch_all(&state.pool)
    .await?;

    let mut result = Vec::with_capacity(rows.len());
    for row in rows {
        let mut attachments = sqlx::query_as::<_, AttachmentView>(
            r#"
            select id, message_id, file_name, file_path, mime_type, size_bytes,
                   coalesce(sha256, '') sha256
            from public.direct_message_attachments where message_id = $1 order by created_at
        "#,
        )
        .bind(row.id)
        .fetch_all(&state.pool)
        .await?;
        for file in &mut attachments {
            file.url = signed_asset_url(&state, &file.file_path, 3600)
                .await
                .unwrap_or_default();
        }
        let avatar_url = signed_asset_url(&state, &row.avatar_path, 28_800)
            .await
            .unwrap_or_default();
        result.push(MessageView {
            id: row.id,
            thread_id: row.thread_id,
            author_id: row.author_id,
            body: row.body,
            created_at: row.created_at,
            edited_at: row.edited_at,
            reply_to: row.reply_to,
            is_pinned: row.is_pinned,
            author: AuthorView {
                id: row.author_id,
                name: row.author_name,
                email: row.author_email,
                avatar_path: row.avatar_path,
                avatar_url,
                job_title: row.job_title,
                job_roles: Vec::new(),
            },
            attachments,
        });
    }
    Ok(Json(result))
}

pub async fn send_message(
    State(state): State<AppState>,
    member: AuthenticatedMember,
    Path(thread_id): Path<Uuid>,
    Json(input): Json<SendMessageInput>,
) -> Result<Json<serde_json::Value>, ApiError> {
    ensure_member(&state, thread_id, member.member_id).await?;
    let body = input.body.trim().chars().take(12_000).collect::<String>();
    if body.is_empty() {
        return Err(ApiError::invalid("body"));
    }
    let id = Uuid::new_v4();
    sqlx::query("insert into public.direct_messages (id,thread_id,author_id,body,reply_to) values ($1,$2,$3,$4,$5)")
        .bind(id).bind(thread_id).bind(member.member_id).bind(body).bind(input.reply_to)
        .execute(&state.pool).await?;
    state.publish(BackendEvent::DirectMessageCreated {
        thread_id,
        message_id: id,
        author_id: member.member_id,
    });
    Ok(Json(serde_json::json!({"id": id, "threadId": thread_id})))
}

pub async fn update_message(
    State(state): State<AppState>,
    member: AuthenticatedMember,
    Path(message_id): Path<Uuid>,
    Json(input): Json<UpdateMessageInput>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let body = input
        .body
        .map(|value| value.trim().chars().take(12_000).collect::<String>());
    if body.as_ref().is_some_and(String::is_empty) {
        return Err(ApiError::invalid("body"));
    }
    let thread_id = sqlx::query_scalar::<_, Uuid>(r#"
        update public.direct_messages set body = coalesce($2,body), is_pinned = coalesce($3,is_pinned),
        edited_at = case when $2::text is null then edited_at else now() end
        where id = $1 and author_id = $4 returning thread_id
    "#).bind(message_id).bind(body).bind(input.is_pinned).bind(member.member_id)
        .fetch_optional(&state.pool).await?.ok_or(ApiError::NotFound("message"))?;
    state.publish(BackendEvent::DirectMessageUpdated {
        thread_id,
        message_id,
    });
    Ok(Json(serde_json::json!({"ok": true})))
}

pub async fn delete_message(
    State(state): State<AppState>,
    member: AuthenticatedMember,
    Path(message_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let thread_id = sqlx::query_scalar::<_, Uuid>(
        "delete from public.direct_messages where id=$1 and author_id=$2 returning thread_id",
    )
    .bind(message_id)
    .bind(member.member_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound("message"))?;
    state.publish(BackendEvent::DirectMessageDeleted {
        thread_id,
        message_id,
    });
    Ok(Json(serde_json::json!({"ok": true})))
}

pub async fn mark_read(
    State(state): State<AppState>,
    member: AuthenticatedMember,
    Path(thread_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let result = sqlx::query("update public.direct_thread_members set last_read_at=now() where thread_id=$1 and member_id=$2")
        .bind(thread_id).bind(member.member_id).execute(&state.pool).await?;
    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound("thread"));
    }
    Ok(Json(serde_json::json!({"ok": true})))
}

pub async fn ensure_member(
    state: &AppState,
    thread_id: Uuid,
    member_id: Uuid,
) -> Result<(), ApiError> {
    let allowed = sqlx::query_scalar::<_, bool>("select exists(select 1 from public.direct_thread_members where thread_id=$1 and member_id=$2)")
        .bind(thread_id).bind(member_id).fetch_one(&state.pool).await?;
    allowed.then_some(()).ok_or(ApiError::PermissionDenied)
}

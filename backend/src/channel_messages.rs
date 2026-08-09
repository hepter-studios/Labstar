use axum::{
    Json,
    extract::{Multipart, Path, State},
};
use bytes::Bytes;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::FromRow;
use uuid::Uuid;

use crate::{
    auth::AuthenticatedMember,
    error::ApiError,
    files::{
        FileReceipt, detect_mime, record_file_receipt, sanitize_file_name, signed_asset_url,
        upload_storage_object, validate_file_size,
    },
    state::{AppState, BackendEvent},
};

#[derive(Debug, FromRow)]
struct MessageRow {
    id: Uuid,
    channel_id: Uuid,
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthorView {
    id: Uuid,
    name: String,
    email: String,
    avatar_path: String,
    avatar_url: String,
    job_title: String,
    job_roles: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentView {
    id: Uuid,
    message_id: Uuid,
    file_name: String,
    file_path: String,
    mime_type: String,
    size_bytes: i64,
    #[sqlx(skip)]
    url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageView {
    id: Uuid,
    channel_id: Uuid,
    author_id: Uuid,
    body: String,
    created_at: DateTime<Utc>,
    edited_at: Option<DateTime<Utc>>,
    reply_to: Option<Uuid>,
    is_pinned: bool,
    author: AuthorView,
    attachments: Vec<AttachmentView>,
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedMessage {
    pub id: Uuid,
    pub channel_id: Uuid,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadedChannelAttachment {
    id: Uuid,
    message_id: Uuid,
    file_name: String,
    file_path: String,
    mime_type: String,
    size_bytes: i64,
    sha256: String,
    url: String,
}

pub async fn list(
    State(state): State<AppState>,
    member: AuthenticatedMember,
    Path(channel_id): Path<Uuid>,
) -> Result<Json<Vec<MessageView>>, ApiError> {
    ensure_channel_access(&state, &member, channel_id).await?;
    let rows = sqlx::query_as::<_, MessageRow>(
        r#"
        select message.id,message.channel_id,message.author_id,message.body,
               message.created_at,message.edited_at,message.reply_to,message.is_pinned,
               author.name author_name,author.email author_email,
               coalesce(author.avatar_path,'') avatar_path,
               coalesce(author.job_title,'') job_title
        from public.channel_messages message
        join public.members author on author.id=message.author_id
        where message.channel_id=$1
        order by message.created_at asc
        limit 500
        "#,
    )
    .bind(channel_id)
    .fetch_all(&state.pool)
    .await?;

    let mut result = Vec::with_capacity(rows.len());
    for row in rows {
        let mut attachments = sqlx::query_as::<_, AttachmentView>(
            r#"
            select id,message_id,file_name,file_path,mime_type,size_bytes
            from public.channel_message_attachments
            where message_id=$1
            order by created_at
            "#,
        )
        .bind(row.id)
        .fetch_all(&state.pool)
        .await?;
        for attachment in &mut attachments {
            attachment.url = signed_asset_url(&state, &attachment.file_path, 3600)
                .await
                .unwrap_or_default();
        }
        let avatar_url = signed_asset_url(&state, &row.avatar_path, 28_800)
            .await
            .unwrap_or_default();
        result.push(MessageView {
            id: row.id,
            channel_id: row.channel_id,
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

pub async fn send(
    State(state): State<AppState>,
    member: AuthenticatedMember,
    Path(channel_id): Path<Uuid>,
    Json(input): Json<SendMessageInput>,
) -> Result<Json<CreatedMessage>, ApiError> {
    ensure_channel_access(&state, &member, channel_id).await?;
    let body = clean_body(&input.body)?;
    if let Some(reply_id) = input.reply_to {
        let valid = sqlx::query_scalar::<_, bool>(
            "select exists(select 1 from public.channel_messages where id=$1 and channel_id=$2)",
        )
        .bind(reply_id)
        .bind(channel_id)
        .fetch_one(&state.pool)
        .await?;
        if !valid {
            return Err(ApiError::invalid("replyTo"));
        }
    }
    let id = Uuid::new_v4();
    sqlx::query(
        r#"
        insert into public.channel_messages (id,channel_id,author_id,body,reply_to)
        values ($1,$2,$3,$4,$5)
        "#,
    )
    .bind(id)
    .bind(channel_id)
    .bind(member.member_id)
    .bind(body)
    .bind(input.reply_to)
    .execute(&state.pool)
    .await?;
    state.publish(BackendEvent::ChannelMessageChanged {
        channel_id,
        message_id: id,
    });
    Ok(Json(CreatedMessage { id, channel_id }))
}

pub async fn update(
    State(state): State<AppState>,
    member: AuthenticatedMember,
    Path(message_id): Path<Uuid>,
    Json(input): Json<UpdateMessageInput>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let body = input.body.as_deref().map(clean_body).transpose()?;
    let can_moderate = matches!(member.role.as_str(), "owner" | "admin" | "manager");
    let channel_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        update public.channel_messages
        set body=coalesce($2,body),
            is_pinned=coalesce($3,is_pinned),
            edited_at=case when $2::text is null then edited_at else now() end
        where id=$1 and (author_id=$4 or $5)
        returning channel_id
        "#,
    )
    .bind(message_id)
    .bind(body)
    .bind(input.is_pinned)
    .bind(member.member_id)
    .bind(can_moderate)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound("message"))?;
    state.publish(BackendEvent::ChannelMessageChanged {
        channel_id,
        message_id,
    });
    Ok(Json(serde_json::json!({"ok":true})))
}

pub async fn delete(
    State(state): State<AppState>,
    member: AuthenticatedMember,
    Path(message_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let can_moderate = matches!(member.role.as_str(), "owner" | "admin" | "manager");
    let channel_id = sqlx::query_scalar::<_, Uuid>(
        "delete from public.channel_messages where id=$1 and (author_id=$2 or $3) returning channel_id",
    )
    .bind(message_id)
    .bind(member.member_id)
    .bind(can_moderate)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound("message"))?;
    state.publish(BackendEvent::ChannelMessageChanged {
        channel_id,
        message_id,
    });
    Ok(Json(serde_json::json!({"ok":true})))
}

pub async fn upload_attachment(
    State(state): State<AppState>,
    member: AuthenticatedMember,
    mut multipart: Multipart,
) -> Result<Json<UploadedChannelAttachment>, ApiError> {
    let mut space_id = None;
    let mut channel_id = None;
    let mut message_id = None;
    let mut name = None;
    let mut declared_mime = None;
    let mut content: Option<Bytes> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| ApiError::invalid("multipart"))?
    {
        match field.name().unwrap_or_default() {
            "spaceId" => space_id = Some(parse_uuid(field.text().await, "spaceId")?),
            "channelId" => channel_id = Some(parse_uuid(field.text().await, "channelId")?),
            "messageId" => message_id = Some(parse_uuid(field.text().await, "messageId")?),
            "file" => {
                name = field.file_name().map(sanitize_file_name);
                declared_mime = field.content_type().map(ToOwned::to_owned);
                let bytes = field.bytes().await.map_err(|_| ApiError::invalid("file"))?;
                validate_file_size(&state, bytes.len())?;
                content = Some(bytes);
            }
            _ => {}
        }
    }

    let space_id = space_id.ok_or(ApiError::invalid("spaceId"))?;
    let channel_id = channel_id.ok_or(ApiError::invalid("channelId"))?;
    let message_id = message_id.ok_or(ApiError::invalid("messageId"))?;
    let content = content.ok_or(ApiError::invalid("file"))?;
    let size_bytes = i64::try_from(content.len()).map_err(|_| ApiError::PayloadTooLarge)?;
    let file_name = name.unwrap_or_else(|| "arquivo".to_string());
    ensure_message_owner(&state, &member, channel_id, message_id).await?;

    let mime_type = detect_mime(&content, declared_mime.as_deref());
    let sha256 = hex::encode(Sha256::digest(&content));
    let file_path = format!(
        "spaces/{space_id}/channels/{channel_id}/{message_id}/{}-{file_name}",
        Uuid::new_v4()
    );
    upload_storage_object(&state, &file_path, &mime_type, content).await?;

    let id = Uuid::new_v4();
    sqlx::query(
        r#"
        insert into public.channel_message_attachments
          (id,message_id,file_name,file_path,mime_type,size_bytes)
        values ($1,$2,$3,$4,$5,$6)
        "#,
    )
    .bind(id)
    .bind(message_id)
    .bind(&file_name)
    .bind(&file_path)
    .bind(&mime_type)
    .bind(size_bytes)
    .execute(&state.pool)
    .await?;

    record_file_receipt(
        &state,
        FileReceipt {
            actor_member_id: member.member_id,
            attachment_id: None,
            storage_path: &file_path,
            original_name: &file_name,
            detected_mime_type: &mime_type,
            size_bytes,
            sha256: &sha256,
        },
    )
    .await?;
    state.publish(BackendEvent::ChannelMessageChanged {
        channel_id,
        message_id,
    });
    let url = signed_asset_url(&state, &file_path, 3600)
        .await
        .unwrap_or_default();
    Ok(Json(UploadedChannelAttachment {
        id,
        message_id,
        file_name,
        file_path,
        mime_type,
        size_bytes,
        sha256,
        url,
    }))
}

async fn ensure_channel_access(
    state: &AppState,
    member: &AuthenticatedMember,
    channel_id: Uuid,
) -> Result<(), ApiError> {
    let allowed = sqlx::query_scalar::<_, bool>(
        r#"
        select exists(
          select 1
          from public.channels channel
          join public.members stored_member on stored_member.id=$2
          where channel.id=$1 and (
            coalesce(cardinality(channel.allowed_roles),0)=0
            or stored_member.role::text = any(channel.allowed_roles)
            or coalesce(stored_member.assignments,array[]::text[])
               && coalesce(channel.allowed_assignments,array[]::text[])
          )
        )
        "#,
    )
    .bind(channel_id)
    .bind(member.member_id)
    .fetch_one(&state.pool)
    .await?;
    allowed.then_some(()).ok_or(ApiError::PermissionDenied)
}

async fn ensure_message_owner(
    state: &AppState,
    member: &AuthenticatedMember,
    channel_id: Uuid,
    message_id: Uuid,
) -> Result<(), ApiError> {
    ensure_channel_access(state, member, channel_id).await?;
    let allowed = sqlx::query_scalar::<_, bool>(
        "select exists(select 1 from public.channel_messages where id=$1 and channel_id=$2 and author_id=$3)",
    )
    .bind(message_id)
    .bind(channel_id)
    .bind(member.member_id)
    .fetch_one(&state.pool)
    .await?;
    allowed.then_some(()).ok_or(ApiError::PermissionDenied)
}

fn clean_body(value: &str) -> Result<String, ApiError> {
    let body = value.trim().chars().take(12_000).collect::<String>();
    if body.is_empty() {
        Err(ApiError::invalid("body"))
    } else {
        Ok(body)
    }
}

fn parse_uuid(
    value: Result<String, axum::extract::multipart::MultipartError>,
    field: &'static str,
) -> Result<Uuid, ApiError> {
    value
        .map_err(|_| ApiError::invalid(field))?
        .parse::<Uuid>()
        .map_err(|_| ApiError::invalid(field))
}

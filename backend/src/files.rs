use axum::{
    Json,
    extract::{Multipart, State},
};
use bytes::Bytes;
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::{auth::AuthenticatedMember, error::ApiError, state::AppState};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadedAttachment {
    pub id: Uuid,
    pub message_id: Uuid,
    pub file_name: String,
    pub file_path: String,
    pub mime_type: String,
    pub size_bytes: i64,
    pub sha256: String,
    pub url: String,
}

#[derive(Debug, Deserialize)]
struct SignResponse {
    #[serde(alias = "signedURL", alias = "signedUrl")]
    signed_url: String,
}

pub async fn upload_direct_attachment(
    State(state): State<AppState>,
    member: AuthenticatedMember,
    mut multipart: Multipart,
) -> Result<Json<UploadedAttachment>, ApiError> {
    let mut thread_id = None;
    let mut message_id = None;
    let mut file_name = None;
    let mut declared_mime = None;
    let mut bytes = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| ApiError::InvalidInput("multipart"))?
    {
        match field.name().unwrap_or_default() {
            "threadId" => {
                thread_id = Some(
                    field
                        .text()
                        .await
                        .map_err(|_| ApiError::invalid("threadId"))?
                        .parse::<Uuid>()
                        .map_err(|_| ApiError::invalid("threadId"))?,
                );
            }
            "messageId" => {
                message_id = Some(
                    field
                        .text()
                        .await
                        .map_err(|_| ApiError::invalid("messageId"))?
                        .parse::<Uuid>()
                        .map_err(|_| ApiError::invalid("messageId"))?,
                );
            }
            "file" => {
                file_name = field.file_name().map(sanitize_file_name);
                declared_mime = field.content_type().map(ToOwned::to_owned);
                let content = field
                    .bytes()
                    .await
                    .map_err(|_| ApiError::InvalidInput("file"))?;
                if content.len() > state.config.max_file_bytes {
                    return Err(ApiError::PayloadTooLarge);
                }
                bytes = Some(content);
            }
            _ => {}
        }
    }

    let thread_id = thread_id.ok_or(ApiError::invalid("threadId"))?;
    let message_id = message_id.ok_or(ApiError::invalid("messageId"))?;
    let bytes = bytes.ok_or(ApiError::invalid("file"))?;
    let size_bytes = i64::try_from(bytes.len()).map_err(|_| ApiError::PayloadTooLarge)?;
    let file_name = file_name.unwrap_or_else(|| "arquivo".to_string());

    ensure_message_owner(&state, &member, thread_id, message_id).await?;

    let detected_mime = infer::get(&bytes)
        .map(|kind| kind.mime_type().to_string())
        .or(declared_mime)
        .unwrap_or_else(|| "application/octet-stream".to_string());
    let sha256 = hex::encode(Sha256::digest(&bytes));
    let path = format!(
        "direct/{thread_id}/{message_id}/{}-{file_name}",
        Uuid::new_v4()
    );

    upload_storage_object(&state, &path, &detected_mime, bytes).await?;

    let id = Uuid::new_v4();
    sqlx::query(
        r#"
        insert into public.direct_message_attachments
          (id, message_id, file_name, file_path, mime_type, size_bytes, sha256)
        values ($1, $2, $3, $4, $5, $6, $7)
        "#,
    )
    .bind(id)
    .bind(message_id)
    .bind(&file_name)
    .bind(&path)
    .bind(&detected_mime)
    .bind(size_bytes)
    .bind(&sha256)
    .execute(&state.pool)
    .await?;

    let url = signed_asset_url(&state, &path, 3600)
        .await
        .unwrap_or_default();

    Ok(Json(UploadedAttachment {
        id,
        message_id,
        file_name,
        file_path: path,
        mime_type: detected_mime,
        size_bytes,
        sha256,
        url,
    }))
}

async fn ensure_message_owner(
    state: &AppState,
    member: &AuthenticatedMember,
    thread_id: Uuid,
    message_id: Uuid,
) -> Result<(), ApiError> {
    let allowed = sqlx::query_scalar::<_, bool>(
        r#"
        select exists(
          select 1
          from public.direct_messages message
          join public.direct_thread_members membership
            on membership.thread_id = message.thread_id
          where message.id = $1
            and message.thread_id = $2
            and message.author_id = $3
            and membership.member_id = $3
        )
        "#,
    )
    .bind(message_id)
    .bind(thread_id)
    .bind(member.member_id)
    .fetch_one(&state.pool)
    .await?;
    allowed.then_some(()).ok_or(ApiError::PermissionDenied)
}

async fn upload_storage_object(
    state: &AppState,
    path: &str,
    mime_type: &str,
    bytes: Bytes,
) -> Result<(), ApiError> {
    let url = state
        .config
        .storage_object_url(path)
        .map_err(|_| ApiError::Internal)?;
    let response = state
        .http
        .post(url)
        .header("apikey", &state.config.supabase_service_role_key)
        .header(
            AUTHORIZATION,
            format!("Bearer {}", state.config.supabase_service_role_key),
        )
        .header(CONTENT_TYPE, mime_type)
        .header("x-upsert", "false")
        .body(bytes)
        .send()
        .await?;
    if response.status().is_success() {
        Ok(())
    } else if response.status().as_u16() == 409 {
        Err(ApiError::Conflict("storage_object"))
    } else {
        Err(ApiError::UpstreamUnavailable)
    }
}

pub async fn signed_asset_url(
    state: &AppState,
    path: &str,
    expires_in: u64,
) -> Result<String, ApiError> {
    if path.is_empty() {
        return Ok(String::new());
    }
    let url = state
        .config
        .storage_sign_url(path)
        .map_err(|_| ApiError::Internal)?;
    let response = state
        .http
        .post(url)
        .header("apikey", &state.config.supabase_service_role_key)
        .header(
            AUTHORIZATION,
            format!("Bearer {}", state.config.supabase_service_role_key),
        )
        .json(&serde_json::json!({ "expiresIn": expires_in.clamp(60, 86_400) }))
        .send()
        .await?;
    if !response.status().is_success() {
        return Err(ApiError::UpstreamUnavailable);
    }
    let payload = response.json::<SignResponse>().await?;
    if payload.signed_url.starts_with("http") {
        return Ok(payload.signed_url);
    }
    let relative = payload.signed_url.trim_start_matches('/');
    let path = if relative.starts_with("storage/v1/") {
        relative.to_string()
    } else {
        format!("storage/v1/{relative}")
    };
    state
        .config
        .supabase_url
        .join(&path)
        .map(|url| url.to_string())
        .map_err(|_| ApiError::Internal)
}

fn sanitize_file_name(value: &str) -> String {
    let sanitized = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_') {
                character
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .chars()
        .take(120)
        .collect::<String>();
    if sanitized.is_empty() {
        "arquivo".to_string()
    } else {
        sanitized
    }
}

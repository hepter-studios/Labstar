use axum::{
    Json,
    extract::{Multipart, Path, State},
};
use bytes::Bytes;
use serde::Serialize;
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::{
    auth::AuthenticatedMember,
    error::ApiError,
    files::{
        FileReceipt, detect_mime, record_file_receipt, sanitize_file_name, signed_asset_url,
        upload_storage_object, validate_file_size,
    },
    state::AppState,
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadedAsset {
    pub path: String,
    pub url: String,
    pub mime_type: String,
    pub size_bytes: i64,
    pub sha256: String,
}

pub async fn upload_own_avatar(
    State(state): State<AppState>,
    member: AuthenticatedMember,
    multipart: Multipart,
) -> Result<Json<UploadedAsset>, ApiError> {
    let file = read_single_image(&state, multipart).await?;
    let path = format!(
        "avatars/{}/{}-{}",
        member.member_id,
        Uuid::new_v4(),
        file.file_name
    );
    let asset = persist_asset(&state, &member, path, file).await?;
    sqlx::query("update public.members set avatar_path=$2, updated_at=now() where id=$1")
        .bind(member.member_id)
        .bind(&asset.path)
        .execute(&state.pool)
        .await?;
    Ok(Json(asset))
}

pub async fn upload_space_logo(
    State(state): State<AppState>,
    actor: AuthenticatedMember,
    Path(space_id): Path<Uuid>,
    multipart: Multipart,
) -> Result<Json<UploadedAsset>, ApiError> {
    actor.require_admin()?;
    let file = read_single_image(&state, multipart).await?;
    let path = format!(
        "spaces/{space_id}/logo-{}-{}",
        Uuid::new_v4(),
        file.file_name
    );
    let asset = persist_asset(&state, &actor, path, file).await?;
    let result = sqlx::query("update public.collaboration_spaces set logo_path=$2 where id=$1")
        .bind(space_id)
        .bind(&asset.path)
        .execute(&state.pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound("space"));
    }
    Ok(Json(asset))
}

struct PendingFile {
    file_name: String,
    mime_type: String,
    bytes: Bytes,
}

async fn read_single_image(
    state: &AppState,
    mut multipart: Multipart,
) -> Result<PendingFile, ApiError> {
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| ApiError::invalid("multipart"))?
    {
        if field.name() != Some("file") {
            continue;
        }
        let file_name = field
            .file_name()
            .map(sanitize_file_name)
            .unwrap_or_else(|| "imagem".to_string());
        let declared = field.content_type().map(str::to_string);
        let bytes = field.bytes().await.map_err(|_| ApiError::invalid("file"))?;
        validate_file_size(state, bytes.len())?;
        if bytes.len() > 5 * 1024 * 1024 {
            return Err(ApiError::PayloadTooLarge);
        }
        let mime_type = detect_mime(&bytes, declared.as_deref());
        if !mime_type.starts_with("image/") {
            return Err(ApiError::invalid("file"));
        }
        return Ok(PendingFile {
            file_name,
            mime_type,
            bytes,
        });
    }
    Err(ApiError::invalid("file"))
}

async fn persist_asset(
    state: &AppState,
    member: &AuthenticatedMember,
    path: String,
    file: PendingFile,
) -> Result<UploadedAsset, ApiError> {
    let size_bytes = i64::try_from(file.bytes.len()).map_err(|_| ApiError::PayloadTooLarge)?;
    let sha256 = hex::encode(Sha256::digest(&file.bytes));
    upload_storage_object(state, &path, &file.mime_type, file.bytes).await?;
    record_file_receipt(
        state,
        FileReceipt {
            actor_member_id: member.member_id,
            attachment_id: None,
            storage_path: &path,
            original_name: &file.file_name,
            detected_mime_type: &file.mime_type,
            size_bytes,
            sha256: &sha256,
        },
    )
    .await?;
    let url = signed_asset_url(state, &path, 28_800)
        .await
        .unwrap_or_default();
    Ok(UploadedAsset {
        path,
        url,
        mime_type: file.mime_type,
        size_bytes,
        sha256,
    })
}

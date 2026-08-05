use axum::{
    Json,
    extract::{Path, State},
};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

use crate::{auth::AuthenticatedMember, error::ApiError, files::signed_asset_url, state::AppState};

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SpaceView {
    pub id: Uuid,
    pub name: String,
    pub description: String,
    pub kind: String,
    pub color: String,
    pub icon: String,
    pub logo_path: String,
    #[sqlx(skip)]
    pub logo_url: String,
    pub position: i32,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CategoryView {
    pub id: Uuid,
    pub space_id: Uuid,
    pub name: String,
    pub position: i32,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ChannelView {
    pub id: Uuid,
    pub space_id: Uuid,
    pub category_id: Option<Uuid>,
    pub name: String,
    pub description: String,
    #[serde(rename = "type")]
    pub channel_type: String,
    pub allowed_roles: Vec<String>,
    pub allowed_assignments: Vec<String>,
    pub position: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollaborationResponse {
    pub spaces: Vec<SpaceView>,
    pub categories: Vec<CategoryView>,
    pub channels: Vec<ChannelView>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSpaceInput {
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub kind: String,
    #[serde(default = "default_color")]
    pub color: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSpaceInput {
    pub name: Option<String>,
    pub description: Option<String>,
    pub kind: Option<String>,
    pub color: Option<String>,
    pub logo_path: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCategoryInput {
    pub space_id: Uuid,
    pub name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateChannelInput {
    pub space_id: Uuid,
    pub category_id: Option<Uuid>,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(rename = "type")]
    pub channel_type: String,
    #[serde(default)]
    pub allowed_roles: Vec<String>,
    #[serde(default)]
    pub allowed_assignments: Vec<String>,
}

pub async fn load(
    State(state): State<AppState>,
    _member: AuthenticatedMember,
) -> Result<Json<CollaborationResponse>, ApiError> {
    let mut spaces = sqlx::query_as::<_, SpaceView>(
        r#"
        select id, name, coalesce(description,'') description, kind::text kind,
               coalesce(color,'#8baeff') color, coalesce(icon,'★') icon,
               coalesce(logo_path,'') logo_path, coalesce(position,100)::integer position
        from public.collaboration_spaces
        order by position, lower(name)
        "#,
    )
    .fetch_all(&state.pool)
    .await?;
    for space in &mut spaces {
        space.logo_url = signed_asset_url(&state, &space.logo_path, 28_800)
            .await
            .unwrap_or_default();
    }

    let categories = sqlx::query_as::<_, CategoryView>(
        r#"
        select id, space_id, name, coalesce(position,100)::integer position
        from public.channel_categories
        order by position, lower(name)
        "#,
    )
    .fetch_all(&state.pool)
    .await?;

    let channels = sqlx::query_as::<_, ChannelView>(
        r#"
        select id, space_id, category_id, name, coalesce(description,'') description,
               type::text channel_type,
               coalesce(allowed_roles, array[]::text[]) allowed_roles,
               coalesce(allowed_assignments, array[]::text[]) allowed_assignments,
               coalesce(position,100)::integer position
        from public.channels
        order by position, lower(name)
        "#,
    )
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(CollaborationResponse {
        spaces,
        categories,
        channels,
    }))
}

pub async fn create_space(
    State(state): State<AppState>,
    actor: AuthenticatedMember,
    Json(input): Json<CreateSpaceInput>,
) -> Result<Json<SpaceView>, ApiError> {
    actor.require_admin()?;
    validate_space_kind(&input.kind)?;
    let name = required(&input.name, 100, "name")?;
    let mut space = sqlx::query_as::<_, SpaceView>(
        r#"
        insert into public.collaboration_spaces
          (name, description, kind, color, icon, created_by)
        values ($1,$2,$3,$4,'★',$5)
        returning id,name,coalesce(description,'') description,kind::text kind,
                  coalesce(color,'#8baeff') color,coalesce(icon,'★') icon,
                  coalesce(logo_path,'') logo_path,coalesce(position,100)::integer position
        "#,
    )
    .bind(name)
    .bind(clean(&input.description, 500))
    .bind(&input.kind)
    .bind(clean_or(&input.color, 32, "#8baeff"))
    .bind(actor.member_id)
    .fetch_one(&state.pool)
    .await?;
    space.logo_url = String::new();
    Ok(Json(space))
}

pub async fn update_space(
    State(state): State<AppState>,
    actor: AuthenticatedMember,
    Path(space_id): Path<Uuid>,
    Json(input): Json<UpdateSpaceInput>,
) -> Result<Json<SpaceView>, ApiError> {
    actor.require_admin()?;
    if let Some(kind) = input.kind.as_deref() {
        validate_space_kind(kind)?;
    }
    if input
        .name
        .as_ref()
        .is_some_and(|value| value.trim().is_empty())
    {
        return Err(ApiError::invalid("name"));
    }
    let mut space = sqlx::query_as::<_, SpaceView>(
        r#"
        update public.collaboration_spaces
        set name=coalesce($2,name), description=coalesce($3,description),
            kind=coalesce($4,kind::text)::text,
            color=coalesce($5,color), logo_path=coalesce($6,logo_path)
        where id=$1
        returning id,name,coalesce(description,'') description,kind::text kind,
                  coalesce(color,'#8baeff') color,coalesce(icon,'★') icon,
                  coalesce(logo_path,'') logo_path,coalesce(position,100)::integer position
        "#,
    )
    .bind(space_id)
    .bind(input.name.map(|value| clean(&value, 100)))
    .bind(input.description.map(|value| clean(&value, 500)))
    .bind(input.kind)
    .bind(input.color.map(|value| clean(&value, 32)))
    .bind(input.logo_path.map(|value| clean(&value, 500)))
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound("space"))?;
    space.logo_url = signed_asset_url(&state, &space.logo_path, 28_800)
        .await
        .unwrap_or_default();
    Ok(Json(space))
}

pub async fn create_category(
    State(state): State<AppState>,
    actor: AuthenticatedMember,
    Json(input): Json<CreateCategoryInput>,
) -> Result<Json<CategoryView>, ApiError> {
    actor.require_admin()?;
    let category = sqlx::query_as::<_, CategoryView>(
        r#"
        insert into public.channel_categories (space_id,name)
        values ($1,$2)
        returning id,space_id,name,coalesce(position,100)::integer position
        "#,
    )
    .bind(input.space_id)
    .bind(required(&input.name, 100, "name")?)
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(category))
}

pub async fn create_channel(
    State(state): State<AppState>,
    actor: AuthenticatedMember,
    Json(input): Json<CreateChannelInput>,
) -> Result<Json<ChannelView>, ApiError> {
    actor.require_admin()?;
    validate_channel_type(&input.channel_type)?;
    let normalized_name = slug(&input.name)?;
    let channel = sqlx::query_as::<_, ChannelView>(
        r#"
        insert into public.channels
          (space_id,category_id,name,description,type,allowed_roles,allowed_assignments,created_by)
        values ($1,$2,$3,$4,$5,$6,$7,$8)
        returning id,space_id,category_id,name,coalesce(description,'') description,
                  type::text channel_type,
                  coalesce(allowed_roles,array[]::text[]) allowed_roles,
                  coalesce(allowed_assignments,array[]::text[]) allowed_assignments,
                  coalesce(position,100)::integer position
        "#,
    )
    .bind(input.space_id)
    .bind(input.category_id)
    .bind(normalized_name)
    .bind(clean(&input.description, 500))
    .bind(input.channel_type)
    .bind(sanitize_list(input.allowed_roles, 20, 40))
    .bind(sanitize_list(input.allowed_assignments, 50, 100))
    .bind(actor.member_id)
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(channel))
}

fn validate_space_kind(value: &str) -> Result<(), ApiError> {
    matches!(value, "company" | "product" | "project" | "team")
        .then_some(())
        .ok_or(ApiError::invalid("kind"))
}

fn validate_channel_type(value: &str) -> Result<(), ApiError> {
    matches!(
        value,
        "text" | "announcement" | "rules" | "voice" | "social"
    )
    .then_some(())
    .ok_or(ApiError::invalid("type"))
}

fn required(value: &str, limit: usize, field: &'static str) -> Result<String, ApiError> {
    let value = clean(value, limit);
    if value.is_empty() {
        Err(ApiError::invalid(field))
    } else {
        Ok(value)
    }
}

fn clean(value: &str, limit: usize) -> String {
    value.trim().chars().take(limit).collect()
}

fn clean_or(value: &str, limit: usize, fallback: &str) -> String {
    let value = clean(value, limit);
    if value.is_empty() {
        fallback.to_string()
    } else {
        value
    }
}

fn slug(value: &str) -> Result<String, ApiError> {
    let mut result = String::new();
    let mut dash = false;
    for character in value.trim().to_lowercase().chars().take(100) {
        if character.is_ascii_alphanumeric() {
            result.push(character);
            dash = false;
        } else if !dash && !result.is_empty() {
            result.push('-');
            dash = true;
        }
    }
    let result = result.trim_matches('-').to_string();
    if result.is_empty() {
        Err(ApiError::invalid("name"))
    } else {
        Ok(result)
    }
}

fn sanitize_list(values: Vec<String>, max_items: usize, max_chars: usize) -> Vec<String> {
    let mut values = values
        .into_iter()
        .map(|value| clean(&value, max_chars))
        .filter(|value| !value.is_empty())
        .take(max_items)
        .collect::<Vec<_>>();
    values.sort();
    values.dedup();
    values
}

fn default_color() -> String {
    "#8baeff".to_string()
}

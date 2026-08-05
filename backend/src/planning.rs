use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

use crate::{auth::AuthenticatedMember, error::ApiError, state::AppState};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaceQuery {
    pub space_id: Uuid,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelQuery {
    pub channel_id: Uuid,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct IntegrationView {
    pub id: Uuid,
    pub space_id: Uuid,
    pub provider: String,
    pub name: String,
    pub endpoint: String,
    pub channel_id: Option<Uuid>,
    pub events: Vec<String>,
    pub enabled: bool,
    pub renewal_date: Option<chrono::NaiveDate>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveIntegrationInput {
    pub id: Option<Uuid>,
    pub space_id: Uuid,
    pub provider: String,
    pub name: String,
    #[serde(default)]
    pub endpoint: String,
    pub channel_id: Option<Uuid>,
    #[serde(default)]
    pub events: Vec<String>,
    #[serde(default = "default_true")]
    pub enabled: bool,
    pub renewal_date: Option<chrono::NaiveDate>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SocialPostView {
    pub id: Uuid,
    pub space_id: Uuid,
    pub title: String,
    pub content: String,
    pub platforms: Vec<String>,
    pub status: String,
    pub scheduled_for: Option<DateTime<Utc>>,
    pub owner_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveSocialPostInput {
    pub id: Option<Uuid>,
    pub space_id: Uuid,
    pub title: String,
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub platforms: Vec<String>,
    pub status: String,
    pub scheduled_for: Option<DateTime<Utc>>,
    pub owner_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct MeetingView {
    pub id: Uuid,
    pub channel_id: Uuid,
    pub title: String,
    pub agenda: String,
    pub starts_at: DateTime<Utc>,
    pub duration_minutes: i32,
    pub created_by: Option<Uuid>,
    pub attendee_ids: Vec<Uuid>,
    pub status: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMeetingInput {
    pub channel_id: Uuid,
    pub title: String,
    #[serde(default)]
    pub agenda: String,
    pub starts_at: DateTime<Utc>,
    pub duration_minutes: i32,
    #[serde(default)]
    pub attendee_ids: Vec<Uuid>,
}

pub async fn list_integrations(
    State(state): State<AppState>,
    _member: AuthenticatedMember,
    Query(query): Query<SpaceQuery>,
) -> Result<Json<Vec<IntegrationView>>, ApiError> {
    let rows = sqlx::query_as::<_, IntegrationView>(
        r#"
        select id,space_id,provider::text provider,name,coalesce(endpoint,'') endpoint,
               channel_id,coalesce(events,array[]::text[]) events,enabled,renewal_date
        from public.integration_rules
        where space_id=$1
        order by created_at
        "#,
    )
    .bind(query.space_id)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(rows))
}

pub async fn save_integration(
    State(state): State<AppState>,
    actor: AuthenticatedMember,
    Json(input): Json<SaveIntegrationInput>,
) -> Result<Json<IntegrationView>, ApiError> {
    actor.require_admin()?;
    validate_provider(&input.provider)?;
    let name = required(&input.name, 120, "name")?;
    let id = input.id.unwrap_or_else(Uuid::new_v4);
    let events = sanitize_list(input.events, 50, 80);
    let row = sqlx::query_as::<_, IntegrationView>(
        r#"
        insert into public.integration_rules
          (id,space_id,provider,name,endpoint,channel_id,events,enabled,renewal_date,updated_at)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
        on conflict (id) do update set
          space_id=excluded.space_id,provider=excluded.provider,name=excluded.name,
          endpoint=excluded.endpoint,channel_id=excluded.channel_id,events=excluded.events,
          enabled=excluded.enabled,renewal_date=excluded.renewal_date,updated_at=now()
        returning id,space_id,provider::text provider,name,coalesce(endpoint,'') endpoint,
                  channel_id,coalesce(events,array[]::text[]) events,enabled,renewal_date
        "#,
    )
    .bind(id)
    .bind(input.space_id)
    .bind(input.provider)
    .bind(name)
    .bind(clean(&input.endpoint, 1000))
    .bind(input.channel_id)
    .bind(events)
    .bind(input.enabled)
    .bind(input.renewal_date)
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(row))
}

pub async fn delete_integration(
    State(state): State<AppState>,
    actor: AuthenticatedMember,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    actor.require_admin()?;
    delete_by_id(&state, "integration_rules", id).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn list_social_posts(
    State(state): State<AppState>,
    _member: AuthenticatedMember,
    Query(query): Query<SpaceQuery>,
) -> Result<Json<Vec<SocialPostView>>, ApiError> {
    let rows = sqlx::query_as::<_, SocialPostView>(
        r#"
        select id,space_id,title,coalesce(content,'') content,
               coalesce(platforms,array[]::text[]) platforms,status::text status,
               scheduled_for,owner_id,created_at,updated_at
        from public.social_posts
        where space_id=$1
        order by updated_at desc
        "#,
    )
    .bind(query.space_id)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(rows))
}

pub async fn save_social_post(
    State(state): State<AppState>,
    member: AuthenticatedMember,
    Json(input): Json<SaveSocialPostInput>,
) -> Result<Json<SocialPostView>, ApiError> {
    validate_social_status(&input.status)?;
    let id = input.id.unwrap_or_else(Uuid::new_v4);
    let owner_id = input.owner_id.or(Some(member.member_id));
    let row = sqlx::query_as::<_, SocialPostView>(
        r#"
        insert into public.social_posts
          (id,space_id,title,content,platforms,status,scheduled_for,owner_id,updated_at)
        values ($1,$2,$3,$4,$5,$6,$7,$8,now())
        on conflict (id) do update set
          space_id=excluded.space_id,title=excluded.title,content=excluded.content,
          platforms=excluded.platforms,status=excluded.status,
          scheduled_for=excluded.scheduled_for,owner_id=excluded.owner_id,updated_at=now()
        returning id,space_id,title,coalesce(content,'') content,
                  coalesce(platforms,array[]::text[]) platforms,status::text status,
                  scheduled_for,owner_id,created_at,updated_at
        "#,
    )
    .bind(id)
    .bind(input.space_id)
    .bind(required(&input.title, 200, "title")?)
    .bind(clean(&input.content, 20_000))
    .bind(sanitize_list(input.platforms, 20, 60))
    .bind(input.status)
    .bind(input.scheduled_for)
    .bind(owner_id)
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(row))
}

pub async fn delete_social_post(
    State(state): State<AppState>,
    member: AuthenticatedMember,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    let can_manage = matches!(member.role.as_str(), "owner" | "admin" | "manager");
    let result = sqlx::query("delete from public.social_posts where id=$1 and (owner_id=$2 or $3)")
        .bind(id)
        .bind(member.member_id)
        .bind(can_manage)
        .execute(&state.pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound("social_post"));
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn list_meetings(
    State(state): State<AppState>,
    _member: AuthenticatedMember,
    Query(query): Query<ChannelQuery>,
) -> Result<Json<Vec<MeetingView>>, ApiError> {
    let rows = sqlx::query_as::<_, MeetingView>(
        r#"
        select id,channel_id,title,coalesce(agenda,'') agenda,starts_at,
               coalesce(duration_minutes,45)::integer duration_minutes,
               created_by,coalesce(attendee_ids,array[]::uuid[]) attendee_ids,
               status::text status,created_at
        from public.meetings
        where channel_id=$1 and status::text <> 'cancelled'
        order by starts_at
        limit 100
        "#,
    )
    .bind(query.channel_id)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(rows))
}

pub async fn create_meeting(
    State(state): State<AppState>,
    member: AuthenticatedMember,
    Json(input): Json<CreateMeetingInput>,
) -> Result<Json<MeetingView>, ApiError> {
    let row = sqlx::query_as::<_, MeetingView>(
        r#"
        insert into public.meetings
          (channel_id,title,agenda,starts_at,duration_minutes,created_by,attendee_ids)
        values ($1,$2,$3,$4,$5,$6,$7)
        returning id,channel_id,title,coalesce(agenda,'') agenda,starts_at,
                  coalesce(duration_minutes,45)::integer duration_minutes,
                  created_by,coalesce(attendee_ids,array[]::uuid[]) attendee_ids,
                  status::text status,created_at
        "#,
    )
    .bind(input.channel_id)
    .bind(required(&input.title, 200, "title")?)
    .bind(clean(&input.agenda, 10_000))
    .bind(input.starts_at)
    .bind(input.duration_minutes.clamp(5, 1440))
    .bind(member.member_id)
    .bind(sanitize_uuid_list(input.attendee_ids, 200))
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(row))
}

pub async fn cancel_meeting(
    State(state): State<AppState>,
    member: AuthenticatedMember,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let can_manage = matches!(member.role.as_str(), "owner" | "admin" | "manager");
    let result = sqlx::query(
        "update public.meetings set status='cancelled' where id=$1 and (created_by=$2 or $3)",
    )
    .bind(id)
    .bind(member.member_id)
    .bind(can_manage)
    .execute(&state.pool)
    .await?;
    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound("meeting"));
    }
    Ok(Json(serde_json::json!({"ok":true})))
}

async fn delete_by_id(state: &AppState, table: &str, id: Uuid) -> Result<(), ApiError> {
    let statement = match table {
        "integration_rules" => "delete from public.integration_rules where id=$1",
        _ => return Err(ApiError::Internal),
    };
    let result = sqlx::query(statement).bind(id).execute(&state.pool).await?;
    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound("resource"));
    }
    Ok(())
}

fn validate_provider(value: &str) -> Result<(), ApiError> {
    matches!(
        value,
        "github" | "discord" | "monitoring" | "billing" | "support"
    )
    .then_some(())
    .ok_or(ApiError::invalid("provider"))
}

fn validate_social_status(value: &str) -> Result<(), ApiError> {
    matches!(
        value,
        "idea" | "draft" | "review" | "scheduled" | "published"
    )
    .then_some(())
    .ok_or(ApiError::invalid("status"))
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

fn sanitize_uuid_list(mut values: Vec<Uuid>, max_items: usize) -> Vec<Uuid> {
    values.truncate(max_items);
    values.sort_unstable();
    values.dedup();
    values
}

fn default_true() -> bool {
    true
}

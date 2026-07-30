use axum::{
    Json, Router,
    extract::State,
    http::{HeaderValue, Method, StatusCode, header},
    routing::get,
};
use serde::Serialize;
use sqlx::FromRow;
use tower_http::{
    cors::{AllowOrigin, CorsLayer},
    limit::RequestBodyLimitLayer,
    timeout::TimeoutLayer,
    trace::TraceLayer,
};
use uuid::Uuid;

use crate::{
    auth::AuthenticatedUser,
    error::ApiError,
    state::AppState,
};

#[derive(Debug, Serialize)]
struct HealthResponse {
    status: &'static str,
    service: &'static str,
    version: &'static str,
    uptime_seconds: u64,
}

#[derive(Debug, FromRow)]
struct MemberRecord {
    id: Uuid,
    email: String,
    name: String,
    status: String,
    role: String,
    job_title: Option<String>,
    area: Option<String>,
}

#[derive(Debug, Serialize)]
struct MeResponse {
    user_id: Uuid,
    email: String,
    member: MemberResponse,
}

#[derive(Debug, Serialize)]
struct MemberResponse {
    id: Uuid,
    name: String,
    role: String,
    status: String,
    job_title: String,
    area: String,
}

pub fn router(state: AppState) -> Result<Router, http::header::InvalidHeaderValue> {
    let origins = state
        .config
        .allowed_origins
        .iter()
        .map(|origin| HeaderValue::from_str(origin))
        .collect::<Result<Vec<_>, _>>()?;

    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::list(origins))
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE]);

    Ok(Router::new()
        .route("/health/live", get(live))
        .route("/health/ready", get(ready))
        .route("/v1/me", get(me))
        .fallback(not_found)
        .with_state(state.clone())
        .layer(RequestBodyLimitLayer::new(2 * 1024 * 1024))
        .layer(TimeoutLayer::new(state.config.request_timeout))
        .layer(cors)
        .layer(TraceLayer::new_for_http()))
}

async fn live(State(state): State<AppState>) -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        service: "labstar-backend",
        version: env!("CARGO_PKG_VERSION"),
        uptime_seconds: state.started_at.elapsed().as_secs(),
    })
}

async fn ready(State(state): State<AppState>) -> Result<Json<HealthResponse>, ApiError> {
    sqlx::query_scalar::<_, i32>("select 1")
        .fetch_one(&state.database)
        .await
        .map_err(|_| ApiError::DatabaseUnavailable)?;

    Ok(Json(HealthResponse {
        status: "ready",
        service: "labstar-backend",
        version: env!("CARGO_PKG_VERSION"),
        uptime_seconds: state.started_at.elapsed().as_secs(),
    }))
}

async fn me(
    State(state): State<AppState>,
    identity: AuthenticatedUser,
) -> Result<Json<MeResponse>, ApiError> {
    if !identity.email_confirmed {
        return Err(ApiError::MemberNotAuthorized);
    }

    let member = sqlx::query_as::<_, MemberRecord>(
        r#"
        select
            id,
            lower(trim(email)) as email,
            name,
            status::text as status,
            role::text as role,
            job_title,
            area
        from public.members
        where auth_user_id = $1
        limit 1
        "#,
    )
    .bind(identity.id)
    .fetch_optional(&state.database)
    .await
    .map_err(|_| ApiError::DatabaseUnavailable)?
    .ok_or(ApiError::MemberNotAuthorized)?;

    match member.status.as_str() {
        "active" => {}
        "pending" => return Err(ApiError::MemberPending),
        "suspended" => return Err(ApiError::MemberSuspended),
        _ => return Err(ApiError::MemberNotAuthorized),
    }

    let identity_email = identity
        .email
        .as_deref()
        .ok_or(ApiError::MemberNotAuthorized)?;
    if member.email != identity_email {
        return Err(ApiError::MemberNotAuthorized);
    }

    Ok(Json(MeResponse {
        user_id: identity.id,
        email: member.email,
        member: MemberResponse {
            id: member.id,
            name: member.name,
            role: member.role,
            status: member.status,
            job_title: member.job_title.unwrap_or_default(),
            area: member.area.unwrap_or_default(),
        },
    }))
}

async fn not_found() -> (StatusCode, Json<serde_json::Value>) {
    (
        StatusCode::NOT_FOUND,
        Json(serde_json::json!({
            "error": {
                "code": "route_not_found",
                "message": "O recurso solicitado não existe."
            }
        })),
    )
}
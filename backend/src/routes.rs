use axum::{
    Json, Router,
    extract::State,
    http::{HeaderValue, Method, StatusCode, header},
    routing::{get, post},
};
use serde::Serialize;
use tower_http::{
    cors::{AllowOrigin, CorsLayer},
    limit::RequestBodyLimitLayer,
    timeout::TimeoutLayer,
    trace::TraceLayer,
};
use url::Url;
use uuid::Uuid;

use crate::{
    auth::AuthenticatedUser,
    error::ApiError,
    invites,
    members::{MemberRecord, require_active_member},
    state::AppState,
};

#[derive(Debug, Serialize)]
struct HealthResponse {
    status: &'static str,
    service: &'static str,
    version: &'static str,
    uptime_seconds: u64,
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

pub fn router(state: AppState) -> Result<Router, axum::http::header::InvalidHeaderValue> {
    let configured_origins = state
        .config
        .allowed_origins
        .iter()
        .map(|origin| HeaderValue::from_str(origin))
        .collect::<Result<Vec<_>, _>>()?;

    let origins_for_predicate = configured_origins.clone();
    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::predicate(move |origin: &HeaderValue, _| {
            origin_is_allowed(origin, &origins_for_predicate)
        }))
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
        .route("/v1/invites", post(invites::create).get(invites::list))
        .route(
            "/v1/invites/{value}",
            get(invites::inspect).delete(invites::revoke),
        )
        .route("/v1/invites/{token}/accept", post(invites::accept))
        .fallback(not_found)
        .with_state(state.clone())
        .layer(RequestBodyLimitLayer::new(2 * 1024 * 1024))
        .layer(TimeoutLayer::with_status_code(
            StatusCode::REQUEST_TIMEOUT,
            state.config.request_timeout,
        ))
        .layer(cors)
        .layer(TraceLayer::new_for_http()))
}

fn origin_is_allowed(origin: &HeaderValue, configured_origins: &[HeaderValue]) -> bool {
    if configured_origins.iter().any(|allowed| allowed == origin) {
        return true;
    }

    let Ok(origin) = origin.to_str() else {
        return false;
    };
    let Ok(parsed) = Url::parse(origin) else {
        return false;
    };

    if parsed.scheme() != "https" {
        return false;
    }

    let Some(host) = parsed.host_str() else {
        return false;
    };

    host.ends_with(".labstar.pages.dev") && host != "labstar.pages.dev"
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
    let member = require_active_member(&state.database, &identity).await?;
    Ok(Json(MeResponse::from_identity(identity.id, member)))
}

impl MeResponse {
    fn from_identity(user_id: Uuid, member: MemberRecord) -> Self {
        Self {
            user_id,
            email: member.email,
            member: MemberResponse {
                id: member.id,
                name: member.name,
                role: member.role,
                status: member.status,
                job_title: member.job_title.unwrap_or_default(),
                area: member.area.unwrap_or_default(),
            },
        }
    }
}

async fn not_found() -> ApiError {
    ApiError::NotFound
}

#[cfg(test)]
mod tests {
    use super::*;

    fn header(value: &str) -> HeaderValue {
        HeaderValue::from_str(value).unwrap()
    }

    #[test]
    fn accepts_configured_origin() {
        let configured = vec![header("https://labstar.pages.dev")];
        assert!(origin_is_allowed(
            &header("https://labstar.pages.dev"),
            &configured
        ));
    }

    #[test]
    fn accepts_cloudflare_preview_origin() {
        let configured = vec![header("https://labstar.pages.dev")];
        assert!(origin_is_allowed(
            &header("https://99ba6ad0.labstar.pages.dev"),
            &configured
        ));
        assert!(origin_is_allowed(
            &header("https://feat-tauri-auth-rust-integration.labstar.pages.dev"),
            &configured
        ));
    }

    #[test]
    fn rejects_untrusted_origin() {
        let configured = vec![header("https://labstar.pages.dev")];
        assert!(!origin_is_allowed(
            &header("https://example.com"),
            &configured
        ));
        assert!(!origin_is_allowed(
            &header("http://99ba6ad0.labstar.pages.dev"),
            &configured
        ));
        assert!(!origin_is_allowed(
            &header("https://labstar.pages.dev.evil.example"),
            &configured
        ));
    }
}

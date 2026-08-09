use axum::{
    Json, Router,
    extract::State,
    http::{HeaderValue, Method, StatusCode, header},
    routing::{delete, get},
};
use serde::Serialize;
use tower_http::{
    cors::{AllowOrigin, CorsLayer},
    limit::RequestBodyLimitLayer,
    timeout::TimeoutLayer,
    trace::TraceLayer,
};
use url::Url;

use crate::{accounts, error::ApiError, state::AppState};

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    service: &'static str,
    version: &'static str,
}

pub fn router(state: AppState) -> Result<Router, axum::http::header::InvalidHeaderValue> {
    let origins = state
        .config
        .allowed_origins
        .iter()
        .map(|origin| HeaderValue::from_str(origin))
        .collect::<Result<Vec<_>, _>>()?;
    let allowed = origins.clone();
    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::predicate(move |origin: &HeaderValue, _| {
            origin_is_allowed(origin, &allowed)
        }))
        .allow_methods([Method::GET, Method::DELETE, Method::OPTIONS])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE]);

    Ok(Router::new()
        .route("/health/live", get(live))
        .route("/v1/admin/accounts", delete(accounts::delete_account))
        .fallback(not_found)
        .with_state(state.clone())
        .layer(RequestBodyLimitLayer::new(16 * 1024))
        .layer(TimeoutLayer::with_status_code(
            StatusCode::REQUEST_TIMEOUT,
            state.config.request_timeout,
        ))
        .layer(cors)
        .layer(TraceLayer::new_for_http()))
}

fn origin_is_allowed(origin: &HeaderValue, configured: &[HeaderValue]) -> bool {
    if configured.iter().any(|allowed| allowed == origin) {
        return true;
    }
    let Ok(value) = origin.to_str() else {
        return false;
    };
    let Ok(parsed) = Url::parse(value) else {
        return false;
    };
    parsed.scheme() == "https"
        && parsed
            .host_str()
            .is_some_and(|host| host.ends_with(".labstar.pages.dev") && host != "labstar.pages.dev")
}

async fn live(State(_state): State<AppState>) -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        service: "labstar-admin-api",
        version: env!("CARGO_PKG_VERSION"),
    })
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
    fn cors_accepts_official_and_preview_origins_only() {
        let configured = vec![header("https://labstar.pages.dev")];
        assert!(origin_is_allowed(
            &header("https://labstar.pages.dev"),
            &configured
        ));
        assert!(origin_is_allowed(
            &header("https://abc123.labstar.pages.dev"),
            &configured
        ));
        assert!(!origin_is_allowed(
            &header("https://labstar.pages.dev.evil.example"),
            &configured
        ));
        assert!(!origin_is_allowed(
            &header("http://abc123.labstar.pages.dev"),
            &configured
        ));
    }
}

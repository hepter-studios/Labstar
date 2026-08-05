use std::time::{Duration, Instant};

use axum::{
    extract::{Request, State},
    http::{Method, header::AUTHORIZATION},
    middleware::Next,
    response::{IntoResponse, Response},
};
use sha2::{Digest, Sha256};

use crate::{
    error::ApiError,
    state::{AppState, RateWindow},
};

const AUTHENTICATED_REQUESTS_PER_MINUTE: u32 = 360;
const PUBLIC_REQUESTS_PER_MINUTE: u32 = 2_000;

pub async fn enforce(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Response {
    if request.method() == Method::OPTIONS || request.uri().path().starts_with("/health") {
        return next.run(request).await;
    }

    let (key, limit) = request
        .headers()
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|token| {
            let digest = Sha256::digest(token.as_bytes());
            (
                format!("member:{}", hex::encode(&digest[..16])),
                AUTHENTICATED_REQUESTS_PER_MINUTE,
            )
        })
        .unwrap_or_else(|| {
            (
                format!("public:{}", request.uri().path()),
                PUBLIC_REQUESTS_PER_MINUTE,
            )
        });

    let now = Instant::now();
    let limited = {
        let mut window = state.rate_limits.entry(key).or_insert(RateWindow {
            started_at: now,
            count: 0,
        });
        if now.duration_since(window.started_at) >= Duration::from_secs(60) {
            window.started_at = now;
            window.count = 0;
        }
        window.count = window.count.saturating_add(1);
        window.count > limit
    };

    if limited {
        return ApiError::RateLimited.into_response();
    }
    next.run(request).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn configured_limits_are_positive() {
        assert!(AUTHENTICATED_REQUESTS_PER_MINUTE > 0);
        assert!(PUBLIC_REQUESTS_PER_MINUTE >= AUTHENTICATED_REQUESTS_PER_MINUTE);
    }
}

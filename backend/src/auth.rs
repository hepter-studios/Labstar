use std::{future::Future, sync::Arc};

use axum::{
    extract::FromRequestParts,
    http::{header::AUTHORIZATION, request::Parts},
};
use reqwest::{Client, StatusCode};
use serde::Deserialize;
use uuid::Uuid;

use crate::{config::Config, error::ApiError, state::AppState};

#[derive(Debug, Clone)]
pub struct AuthenticatedUser {
    pub id: Uuid,
    pub email: String,
    pub email_confirmed: bool,
}

#[derive(Debug, Deserialize)]
struct SupabaseUser {
    id: Uuid,
    email: Option<String>,
    email_confirmed_at: Option<String>,
}

#[derive(Clone)]
pub struct AuthService {
    client: Client,
    config: Arc<Config>,
}

impl AuthService {
    pub fn new(client: Client, config: Arc<Config>) -> Self {
        Self { client, config }
    }

    pub async fn authenticate(&self, token: &str) -> Result<AuthenticatedUser, ApiError> {
        let url = self
            .config
            .endpoint("auth/v1/user")
            .map_err(|_| ApiError::UpstreamUnavailable)?;
        let response = self
            .client
            .get(url)
            .bearer_auth(token)
            .header("apikey", &self.config.supabase_publishable_key)
            .send()
            .await
            .map_err(|_| ApiError::UpstreamUnavailable)?;

        match response.status() {
            StatusCode::OK => {}
            StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => {
                return Err(ApiError::AuthenticationFailed);
            }
            _ => return Err(ApiError::UpstreamUnavailable),
        }

        let user = response
            .json::<SupabaseUser>()
            .await
            .map_err(|_| ApiError::UpstreamUnavailable)?;
        let email = user
            .email
            .map(|value| value.trim().to_ascii_lowercase())
            .filter(|value| !value.is_empty())
            .ok_or(ApiError::AuthenticationFailed)?;
        Ok(AuthenticatedUser {
            id: user.id,
            email,
            email_confirmed: user.email_confirmed_at.is_some(),
        })
    }
}

impl FromRequestParts<AppState> for AuthenticatedUser {
    type Rejection = ApiError;

    fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> impl Future<Output = Result<Self, Self::Rejection>> + Send {
        let token = bearer_token(parts).map(str::to_owned);
        let auth = state.auth.clone();
        async move {
            let token = token?;
            auth.authenticate(&token).await
        }
    }
}

fn bearer_token(parts: &Parts) -> Result<&str, ApiError> {
    let header = parts
        .headers
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .ok_or(ApiError::AuthenticationFailed)?;
    header
        .strip_prefix("Bearer ")
        .map(str::trim)
        .filter(|value| !value.is_empty() && value.len() <= 16_384)
        .ok_or(ApiError::AuthenticationFailed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::Request;

    #[test]
    fn bearer_token_is_required() {
        let request = Request::builder()
            .header(AUTHORIZATION, "Bearer session-token")
            .body(())
            .unwrap();
        let (parts, _) = request.into_parts();
        assert_eq!(bearer_token(&parts).unwrap(), "session-token");

        let (parts, _) = Request::new(()).into_parts();
        assert!(matches!(
            bearer_token(&parts),
            Err(ApiError::AuthenticationFailed)
        ));
    }
}

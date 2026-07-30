use std::{future::Future, sync::Arc};

use axum::{
    extract::FromRequestParts,
    http::{header::AUTHORIZATION, request::Parts},
};
use reqwest::{Client, StatusCode};
use serde::Deserialize;
use thiserror::Error;
use uuid::Uuid;

use crate::{config::Config, error::ApiError, state::AppState};

#[derive(Debug, Clone)]
pub struct AuthenticatedUser {
    pub id: Uuid,
    pub email: Option<String>,
    pub email_confirmed: bool,
}

#[derive(Debug, Error)]
pub enum AuthError {
    #[error("missing_bearer_token")]
    MissingToken,
    #[error("invalid_bearer_token")]
    InvalidToken,
    #[error("authentication_service_unavailable")]
    ServiceUnavailable,
    #[error("invalid_user_payload")]
    InvalidUserPayload,
}

#[derive(Clone)]
pub struct AuthService {
    client: Client,
    config: Arc<Config>,
}

#[derive(Debug, Deserialize)]
struct SupabaseUser {
    id: Uuid,
    email: Option<String>,
    email_confirmed_at: Option<String>,
}

impl AuthService {
    pub fn new(client: Client, config: Arc<Config>) -> Self {
        Self { client, config }
    }

    pub async fn authenticate(&self, token: &str) -> Result<AuthenticatedUser, AuthError> {
        let url = self
            .config
            .auth_user_url()
            .map_err(|_| AuthError::ServiceUnavailable)?;

        let response = self
            .client
            .get(url)
            .header(AUTHORIZATION, format!("Bearer {token}"))
            .header("apikey", &self.config.supabase_publishable_key)
            .send()
            .await
            .map_err(|_| AuthError::ServiceUnavailable)?;

        match response.status() {
            StatusCode::OK => {}
            StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => {
                return Err(AuthError::InvalidToken);
            }
            _ => return Err(AuthError::ServiceUnavailable),
        }

        let user = response
            .json::<SupabaseUser>()
            .await
            .map_err(|_| AuthError::InvalidUserPayload)?;

        Ok(AuthenticatedUser {
            id: user.id,
            email: user.email.map(|value| value.trim().to_ascii_lowercase()),
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
            let token = token.map_err(ApiError::Authentication)?;
            auth.authenticate(&token)
                .await
                .map_err(ApiError::Authentication)
        }
    }
}

fn bearer_token(parts: &Parts) -> Result<&str, AuthError> {
    let header = parts
        .headers
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .ok_or(AuthError::MissingToken)?;

    let token = header
        .strip_prefix("Bearer ")
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or(AuthError::InvalidToken)?;

    if token.len() > 16_384 {
        return Err(AuthError::InvalidToken);
    }

    Ok(token)
}

#[cfg(test)]
mod tests {
    use axum::http::Request;

    use super::*;

    #[test]
    fn extracts_valid_bearer_token() {
        let request = Request::builder()
            .header(AUTHORIZATION, "Bearer abc.def.ghi")
            .body(())
            .unwrap();
        let (parts, _) = request.into_parts();

        assert_eq!(bearer_token(&parts).unwrap(), "abc.def.ghi");
    }

    #[test]
    fn rejects_missing_or_empty_token() {
        let request = Request::new(());
        let (parts, _) = request.into_parts();
        assert!(matches!(bearer_token(&parts), Err(AuthError::MissingToken)));

        let request = Request::builder()
            .header(AUTHORIZATION, "Bearer   ")
            .body(())
            .unwrap();
        let (parts, _) = request.into_parts();
        assert!(matches!(bearer_token(&parts), Err(AuthError::InvalidToken)));
    }
}
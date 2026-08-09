use std::{future::Future, sync::Arc, time::Duration};

use axum::{
    extract::FromRequestParts,
    http::{header::AUTHORIZATION, request::Parts},
};
use reqwest::{Client, StatusCode};
use serde::Deserialize;
use serde_json::Value;
use thiserror::Error;
use tokio::time::sleep;
use uuid::Uuid;

use crate::{config::Config, error::ApiError, state::AppState};

const AUTH_RETRY_DELAY: Duration = Duration::from_millis(350);

#[derive(Debug, Clone)]
pub struct AuthenticatedUser {
    pub id: Uuid,
    pub email: Option<String>,
    pub email_confirmed: bool,
    pub display_name: String,
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
    #[serde(default)]
    user_metadata: Value,
}

impl AuthService {
    pub fn new(client: Client, config: Arc<Config>) -> Self {
        Self { client, config }
    }

    pub async fn authenticate(&self, token: &str) -> Result<AuthenticatedUser, AuthError> {
        match self.authenticate_once(token).await {
            Ok(user) => Ok(user),
            Err(AuthError::ServiceUnavailable) => {
                sleep(AUTH_RETRY_DELAY).await;
                self.authenticate_once(token).await
            }
            Err(error) => Err(error),
        }
    }

    async fn authenticate_once(&self, token: &str) -> Result<AuthenticatedUser, AuthError> {
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
            StatusCode::TOO_MANY_REQUESTS
            | StatusCode::BAD_GATEWAY
            | StatusCode::SERVICE_UNAVAILABLE
            | StatusCode::GATEWAY_TIMEOUT => return Err(AuthError::ServiceUnavailable),
            status if status.is_server_error() => return Err(AuthError::ServiceUnavailable),
            _ => return Err(AuthError::InvalidUserPayload),
        }

        let user = response
            .json::<SupabaseUser>()
            .await
            .map_err(|_| AuthError::InvalidUserPayload)?;
        let email = user.email.map(|value| value.trim().to_ascii_lowercase());
        let display_name = preferred_display_name(&user.user_metadata, email.as_deref());

        Ok(AuthenticatedUser {
            id: user.id,
            email,
            email_confirmed: user.email_confirmed_at.is_some(),
            display_name,
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

fn preferred_display_name(metadata: &Value, email: Option<&str>) -> String {
    for field in ["full_name", "name", "user_name", "preferred_username"] {
        if let Some(value) = metadata
            .get(field)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| value.len() >= 2)
        {
            return value.chars().take(100).collect();
        }
    }

    email
        .and_then(|value| value.split('@').next())
        .filter(|value| !value.is_empty())
        .unwrap_or("Membro Labstar")
        .chars()
        .take(100)
        .collect()
}

#[cfg(test)]
mod tests {
    use axum::http::Request;
    use serde_json::json;

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

    #[test]
    fn prefers_oauth_name_and_falls_back_to_email() {
        assert_eq!(
            preferred_display_name(&json!({ "full_name": "Bruno Souto" }), None),
            "Bruno Souto"
        );
        assert_eq!(
            preferred_display_name(&json!({}), Some("mackson@example.com")),
            "mackson"
        );
    }
}

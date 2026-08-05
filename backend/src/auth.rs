use std::{future::Future, sync::Arc, time::Duration};

use axum::{
    extract::FromRequestParts,
    http::{header::AUTHORIZATION, request::Parts},
};
use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::FromRow;
use tokio::time::sleep;
use uuid::Uuid;

use crate::{config::Config, error::ApiError, state::AppState};

const AUTH_RETRY_DELAY: Duration = Duration::from_millis(250);

#[derive(Debug, Clone)]
pub struct AuthenticatedUser {
    pub id: Uuid,
    pub email: String,
    pub email_confirmed: bool,
    pub display_name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthenticatedMember {
    pub user_id: Uuid,
    pub member_id: Uuid,
    pub email: String,
    pub name: String,
    pub role: String,
    pub status: String,
    pub job_title: String,
    pub area: String,
}

impl AuthenticatedMember {
    pub fn require_admin(&self) -> Result<(), ApiError> {
        matches!(self.role.as_str(), "owner" | "admin")
            .then_some(())
            .ok_or(ApiError::PermissionDenied)
    }

    pub fn require_manager(&self) -> Result<(), ApiError> {
        matches!(self.role.as_str(), "owner" | "admin" | "manager")
            .then_some(())
            .ok_or(ApiError::PermissionDenied)
    }
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

#[derive(Debug, FromRow)]
struct MemberRow {
    id: Uuid,
    email: String,
    name: String,
    status: String,
    role: String,
    job_title: String,
    area: String,
    auth_user_id: Option<Uuid>,
}

impl AuthService {
    pub fn new(client: Client, config: Arc<Config>) -> Self {
        Self { client, config }
    }

    pub async fn authenticate_user(&self, token: &str) -> Result<AuthenticatedUser, ApiError> {
        if token.len() > 16_384 {
            return Err(ApiError::InvalidSession);
        }
        let request = || async {
            let url = self
                .config
                .auth_user_url()
                .map_err(|_| ApiError::UpstreamUnavailable)?;
            let response = self
                .client
                .get(url)
                .header(AUTHORIZATION, format!("Bearer {token}"))
                .header("apikey", &self.config.supabase_publishable_key)
                .send()
                .await
                .map_err(|_| ApiError::UpstreamUnavailable)?;

            match response.status() {
                StatusCode::OK => response
                    .json::<SupabaseUser>()
                    .await
                    .map_err(|_| ApiError::InvalidSession),
                StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => Err(ApiError::InvalidSession),
                status if status.is_server_error() || status == StatusCode::TOO_MANY_REQUESTS => {
                    Err(ApiError::UpstreamUnavailable)
                }
                _ => Err(ApiError::InvalidSession),
            }
        };

        let user = match request().await {
            Ok(user) => user,
            Err(ApiError::UpstreamUnavailable) => {
                sleep(AUTH_RETRY_DELAY).await;
                request().await?
            }
            Err(error) => return Err(error),
        };
        let email = user
            .email
            .unwrap_or_default()
            .trim()
            .to_ascii_lowercase();
        if email.is_empty() {
            return Err(ApiError::InvalidSession);
        }
        Ok(AuthenticatedUser {
            id: user.id,
            display_name: preferred_display_name(&user.user_metadata, &email),
            email,
            email_confirmed: user.email_confirmed_at.is_some(),
        })
    }

    pub async fn authenticate_member(
        &self,
        token: &str,
        pool: &sqlx::PgPool,
    ) -> Result<AuthenticatedMember, ApiError> {
        let user = self.authenticate_user(token).await?;
        if !user.email_confirmed {
            return Err(ApiError::InvalidSession);
        }

        let row = sqlx::query_as::<_, MemberRow>(
            r#"
            select id, email, name, status, role,
                   coalesce(job_title, '') as job_title,
                   coalesce(area, '') as area,
                   auth_user_id
            from public.members
            where auth_user_id = $1 or lower(email) = $2
            order by (auth_user_id = $1) desc
            limit 1
            "#,
        )
        .bind(user.id)
        .bind(&user.email)
        .fetch_optional(pool)
        .await?;

        let row = row.ok_or(ApiError::MemberNotAuthorized)?;
        match row.status.as_str() {
            "active" => {}
            "pending" => return Err(ApiError::MemberPending),
            "suspended" => return Err(ApiError::MemberSuspended),
            _ => return Err(ApiError::MemberNotAuthorized),
        }

        if row.auth_user_id.is_none() {
            sqlx::query(
                "update public.members set auth_user_id = $1 where id = $2 and auth_user_id is null",
            )
            .bind(user.id)
            .bind(row.id)
            .execute(pool)
            .await?;
        }

        Ok(AuthenticatedMember {
            user_id: user.id,
            member_id: row.id,
            email: row.email,
            name: if row.name.trim().is_empty() {
                user.display_name
            } else {
                row.name
            },
            role: row.role,
            status: row.status,
            job_title: row.job_title,
            area: row.area,
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
            auth.authenticate_user(&token).await
        }
    }
}

impl FromRequestParts<AppState> for AuthenticatedMember {
    type Rejection = ApiError;

    fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> impl Future<Output = Result<Self, Self::Rejection>> + Send {
        let token = bearer_token(parts).map(str::to_owned);
        let auth = state.auth.clone();
        let pool = state.pool.clone();
        async move {
            let token = token?;
            auth.authenticate_member(&token, &pool).await
        }
    }
}

pub fn bearer_token(parts: &Parts) -> Result<&str, ApiError> {
    let header = parts
        .headers
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .ok_or(ApiError::AuthenticationRequired)?;
    header
        .strip_prefix("Bearer ")
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or(ApiError::InvalidSession)
}

fn preferred_display_name(metadata: &Value, email: &str) -> String {
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
        .split('@')
        .next()
        .filter(|value| !value.is_empty())
        .unwrap_or("Membro Labstar")
        .chars()
        .take(100)
        .collect()
}

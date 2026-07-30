use std::{env, net::SocketAddr, str::FromStr, time::Duration};

use thiserror::Error;
use url::Url;

#[derive(Clone)]
pub struct Config {
    pub bind_addr: SocketAddr,
    pub database_url: String,
    pub supabase_url: Url,
    pub supabase_publishable_key: String,
    pub allowed_origins: Vec<String>,
    pub request_timeout: Duration,
    pub database_max_connections: u32,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum ConfigError {
    #[error("missing_environment_variable:{0}")]
    Missing(&'static str),
    #[error("invalid_environment_variable:{0}")]
    Invalid(&'static str),
    #[error("insecure_supabase_url")]
    InsecureSupabaseUrl,
    #[error("empty_allowed_origins")]
    EmptyAllowedOrigins,
}

impl Config {
    pub fn from_env() -> Result<Self, ConfigError> {
        let bind_addr = parse_or_default("LABSTAR_BIND_ADDR", "127.0.0.1:8080")?;
        let database_url = required("DATABASE_URL")?;
        let supabase_url = Url::parse(&required("SUPABASE_URL")?)
            .map_err(|_| ConfigError::Invalid("SUPABASE_URL"))?;
        validate_supabase_url(&supabase_url)?;

        let supabase_publishable_key = required("SUPABASE_PUBLISHABLE_KEY")?;
        let allowed_origins = env::var("LABSTAR_ALLOWED_ORIGINS")
            .unwrap_or_else(|_| {
                "https://labstar.pages.dev,http://localhost:5173,http://127.0.0.1:5173".to_string()
            })
            .split(',')
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
            .collect::<Vec<_>>();

        if allowed_origins.is_empty() {
            return Err(ConfigError::EmptyAllowedOrigins);
        }

        for origin in &allowed_origins {
            let parsed =
                Url::parse(origin).map_err(|_| ConfigError::Invalid("LABSTAR_ALLOWED_ORIGINS"))?;
            if parsed.scheme() != "https" && !is_local_http(&parsed) {
                return Err(ConfigError::Invalid("LABSTAR_ALLOWED_ORIGINS"));
            }
        }

        let request_timeout_seconds =
            parse_or_default::<u64>("LABSTAR_REQUEST_TIMEOUT_SECONDS", "15")?;
        if request_timeout_seconds == 0 || request_timeout_seconds > 120 {
            return Err(ConfigError::Invalid("LABSTAR_REQUEST_TIMEOUT_SECONDS"));
        }

        let database_max_connections =
            parse_or_default::<u32>("LABSTAR_DATABASE_MAX_CONNECTIONS", "10")?;
        if !(1..=100).contains(&database_max_connections) {
            return Err(ConfigError::Invalid("LABSTAR_DATABASE_MAX_CONNECTIONS"));
        }

        Ok(Self {
            bind_addr,
            database_url,
            supabase_url,
            supabase_publishable_key,
            allowed_origins,
            request_timeout: Duration::from_secs(request_timeout_seconds),
            database_max_connections,
        })
    }

    pub fn auth_user_url(&self) -> Result<Url, ConfigError> {
        self.supabase_url
            .join("auth/v1/user")
            .map_err(|_| ConfigError::Invalid("SUPABASE_URL"))
    }
}

fn required(name: &'static str) -> Result<String, ConfigError> {
    env::var(name)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or(ConfigError::Missing(name))
}

fn parse_or_default<T>(name: &'static str, default: &str) -> Result<T, ConfigError>
where
    T: FromStr,
{
    env::var(name)
        .unwrap_or_else(|_| default.to_string())
        .parse::<T>()
        .map_err(|_| ConfigError::Invalid(name))
}

fn validate_supabase_url(url: &Url) -> Result<(), ConfigError> {
    if url.scheme() == "https" || is_local_http(url) {
        Ok(())
    } else {
        Err(ConfigError::InsecureSupabaseUrl)
    }
}

fn is_local_http(url: &Url) -> bool {
    url.scheme() == "http" && matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "::1"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_https_supabase_url() {
        let url = Url::parse("https://example.supabase.co").unwrap();
        assert_eq!(validate_supabase_url(&url), Ok(()));
    }

    #[test]
    fn rejects_insecure_remote_supabase_url() {
        let url = Url::parse("http://example.supabase.co").unwrap();
        assert_eq!(
            validate_supabase_url(&url),
            Err(ConfigError::InsecureSupabaseUrl)
        );
    }

    #[test]
    fn allows_local_http_for_development() {
        let url = Url::parse("http://127.0.0.1:54321").unwrap();
        assert_eq!(validate_supabase_url(&url), Ok(()));
    }
}

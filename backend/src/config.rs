use std::{env, net::SocketAddr, str::FromStr, time::Duration};

use thiserror::Error;
use url::Url;
use uuid::Uuid;

const DEFAULT_ALLOWED_ORIGINS: &str = concat!(
    "https://labstar.pages.dev,",
    "http://tauri.localhost,",
    "https://tauri.localhost,",
    "tauri://localhost,",
    "http://localhost:5173,",
    "http://127.0.0.1:5173"
);

#[derive(Clone)]
pub struct Config {
    pub bind_addr: SocketAddr,
    pub supabase_url: Url,
    pub supabase_publishable_key: String,
    pub supabase_service_role_key: String,
    pub allowed_origins: Vec<String>,
    pub request_timeout: Duration,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum ConfigError {
    #[error("missing_environment_variable:{0}")]
    Missing(&'static str),
    #[error("invalid_environment_variable:{0}")]
    Invalid(&'static str),
    #[error("insecure_supabase_url")]
    InsecureSupabaseUrl,
    #[error("public_and_admin_keys_must_differ")]
    KeysMustDiffer,
}

impl Config {
    pub fn from_env() -> Result<Self, ConfigError> {
        let bind_addr = parse_or_default("LABSTAR_BIND_ADDR", "127.0.0.1:8080")?;
        let supabase_url = Url::parse(&required("SUPABASE_URL")?)
            .map_err(|_| ConfigError::Invalid("SUPABASE_URL"))?;
        validate_supabase_url(&supabase_url)?;
        let supabase_publishable_key = required("SUPABASE_PUBLISHABLE_KEY")?;
        let supabase_service_role_key = required("SUPABASE_SERVICE_ROLE_KEY")?;
        if supabase_publishable_key == supabase_service_role_key {
            return Err(ConfigError::KeysMustDiffer);
        }

        let allowed_origins = env::var("LABSTAR_ALLOWED_ORIGINS")
            .unwrap_or_else(|_| DEFAULT_ALLOWED_ORIGINS.to_string())
            .split(',')
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
            .collect::<Vec<_>>();
        if allowed_origins.is_empty() {
            return Err(ConfigError::Invalid("LABSTAR_ALLOWED_ORIGINS"));
        }
        for origin in &allowed_origins {
            validate_allowed_origin(origin)?;
        }

        let timeout_seconds = parse_or_default::<u64>("LABSTAR_REQUEST_TIMEOUT_SECONDS", "30")?;
        if !(5..=120).contains(&timeout_seconds) {
            return Err(ConfigError::Invalid("LABSTAR_REQUEST_TIMEOUT_SECONDS"));
        }

        Ok(Self {
            bind_addr,
            supabase_url,
            supabase_publishable_key,
            supabase_service_role_key,
            allowed_origins,
            request_timeout: Duration::from_secs(timeout_seconds),
        })
    }

    pub fn endpoint(&self, path: &str) -> Result<Url, ConfigError> {
        self.supabase_url
            .join(path)
            .map_err(|_| ConfigError::Invalid("SUPABASE_URL"))
    }

    pub fn admin_user_endpoint(&self, user_id: Uuid) -> Result<Url, ConfigError> {
        self.endpoint(&format!("auth/v1/admin/users/{user_id}"))
    }

    pub fn storage_object_endpoint(&self, path: &str) -> Result<Url, ConfigError> {
        let mut url = self.endpoint("storage/v1/object/labstar-files/")?;
        url.path_segments_mut()
            .map_err(|_| ConfigError::Invalid("SUPABASE_URL"))?
            .extend(path.split('/').filter(|segment| !segment.is_empty()));
        Ok(url)
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

fn validate_allowed_origin(origin: &str) -> Result<(), ConfigError> {
    let parsed = Url::parse(origin).map_err(|_| ConfigError::Invalid("LABSTAR_ALLOWED_ORIGINS"))?;
    let valid = match parsed.scheme() {
        "https" => true,
        "http" => is_local_http(&parsed) || parsed.host_str() == Some("tauri.localhost"),
        "tauri" => parsed.host_str() == Some("localhost"),
        _ => false,
    };
    valid
        .then_some(())
        .ok_or(ConfigError::Invalid("LABSTAR_ALLOWED_ORIGINS"))
}

fn is_local_http(url: &Url) -> bool {
    url.scheme() == "http" && matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "::1"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_secure_or_local_supabase_urls() {
        assert!(validate_supabase_url(&Url::parse("https://project.supabase.co").unwrap()).is_ok());
        assert!(validate_supabase_url(&Url::parse("http://127.0.0.1:54321").unwrap()).is_ok());
        assert_eq!(
            validate_supabase_url(&Url::parse("http://project.supabase.co").unwrap()),
            Err(ConfigError::InsecureSupabaseUrl)
        );
    }

    #[test]
    fn rejects_untrusted_insecure_origins() {
        assert!(validate_allowed_origin("https://labstar.pages.dev").is_ok());
        assert!(validate_allowed_origin("http://tauri.localhost").is_ok());
        assert_eq!(
            validate_allowed_origin("http://example.com"),
            Err(ConfigError::Invalid("LABSTAR_ALLOWED_ORIGINS"))
        );
    }
}

use std::{env, net::SocketAddr, str::FromStr, time::Duration};

use thiserror::Error;
use url::Url;

const DEFAULT_ALLOWED_ORIGINS: &str = concat!(
    "https://labstar.pages.dev,",
    "http://tauri.localhost,",
    "https://tauri.localhost,",
    "tauri://localhost,",
    "http://localhost:5173,",
    "http://127.0.0.1:5173"
);

#[derive(Clone, Debug)]
pub struct Config {
    pub bind_addr: SocketAddr,
    pub database_url: String,
    pub supabase_url: Url,
    pub supabase_publishable_key: String,
    pub supabase_service_role_key: String,
    pub allowed_origins: Vec<String>,
    pub request_timeout: Duration,
    pub database_max_connections: u32,
    pub max_file_bytes: usize,
    pub storage_bucket: String,
    pub public_base_url: Url,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum ConfigError {
    #[error("missing_environment_variable:{0}")]
    Missing(&'static str),
    #[error("invalid_environment_variable:{0}")]
    Invalid(&'static str),
    #[error("insecure_remote_url:{0}")]
    InsecureUrl(&'static str),
    #[error("empty_allowed_origins")]
    EmptyAllowedOrigins,
}

impl Config {
    pub fn from_env() -> Result<Self, ConfigError> {
        let bind_addr = parse_or_default("LABSTAR_BIND_ADDR", "0.0.0.0:8080")?;
        let database_url = required("DATABASE_URL")?;
        let supabase_url = parse_secure_url("SUPABASE_URL")?;
        let public_base_url = parse_secure_url("LABSTAR_PUBLIC_BASE_URL")?;
        let supabase_publishable_key = required("SUPABASE_PUBLISHABLE_KEY")?;
        let supabase_service_role_key = required("SUPABASE_SERVICE_ROLE_KEY")?;
        let storage_bucket = env::var("LABSTAR_STORAGE_BUCKET")
            .unwrap_or_else(|_| "labstar-files".to_string())
            .trim()
            .to_string();
        if storage_bucket.is_empty() {
            return Err(ConfigError::Invalid("LABSTAR_STORAGE_BUCKET"));
        }

        let allowed_origins = env::var("LABSTAR_ALLOWED_ORIGINS")
            .unwrap_or_else(|_| DEFAULT_ALLOWED_ORIGINS.to_string())
            .split(',')
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
            .collect::<Vec<_>>();
        if allowed_origins.is_empty() {
            return Err(ConfigError::EmptyAllowedOrigins);
        }
        for origin in &allowed_origins {
            validate_allowed_origin(origin)?;
        }

        let request_timeout_seconds =
            parse_or_default::<u64>("LABSTAR_REQUEST_TIMEOUT_SECONDS", "30")?;
        if !(1..=120).contains(&request_timeout_seconds) {
            return Err(ConfigError::Invalid("LABSTAR_REQUEST_TIMEOUT_SECONDS"));
        }

        let database_max_connections =
            parse_or_default::<u32>("LABSTAR_DATABASE_MAX_CONNECTIONS", "20")?;
        if !(2..=100).contains(&database_max_connections) {
            return Err(ConfigError::Invalid("LABSTAR_DATABASE_MAX_CONNECTIONS"));
        }

        let max_file_bytes = parse_or_default::<usize>("LABSTAR_MAX_FILE_BYTES", "52428800")?;
        if !(1024..=104_857_600).contains(&max_file_bytes) {
            return Err(ConfigError::Invalid("LABSTAR_MAX_FILE_BYTES"));
        }

        Ok(Self {
            bind_addr,
            database_url,
            supabase_url,
            supabase_publishable_key,
            supabase_service_role_key,
            allowed_origins,
            request_timeout: Duration::from_secs(request_timeout_seconds),
            database_max_connections,
            max_file_bytes,
            storage_bucket,
            public_base_url,
        })
    }

    pub fn auth_user_url(&self) -> Result<Url, ConfigError> {
        self.supabase_url
            .join("auth/v1/user")
            .map_err(|_| ConfigError::Invalid("SUPABASE_URL"))
    }

    pub fn storage_object_url(&self, path: &str) -> Result<Url, ConfigError> {
        self.supabase_url
            .join(&format!(
                "storage/v1/object/{}/{}",
                self.storage_bucket, path
            ))
            .map_err(|_| ConfigError::Invalid("SUPABASE_URL"))
    }

    pub fn storage_sign_url(&self, path: &str) -> Result<Url, ConfigError> {
        self.supabase_url
            .join(&format!(
                "storage/v1/object/sign/{}/{}",
                self.storage_bucket, path
            ))
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

fn parse_secure_url(name: &'static str) -> Result<Url, ConfigError> {
    let url = Url::parse(&required(name)?).map_err(|_| ConfigError::Invalid(name))?;
    if url.scheme() == "https" || is_local_http(&url) {
        Ok(url)
    } else {
        Err(ConfigError::InsecureUrl(name))
    }
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
    fn accepts_official_tauri_origins() {
        assert_eq!(validate_allowed_origin("http://tauri.localhost"), Ok(()));
        assert_eq!(validate_allowed_origin("https://tauri.localhost"), Ok(()));
        assert_eq!(validate_allowed_origin("tauri://localhost"), Ok(()));
    }

    #[test]
    fn rejects_untrusted_insecure_origin() {
        assert_eq!(
            validate_allowed_origin("http://example.com"),
            Err(ConfigError::Invalid("LABSTAR_ALLOWED_ORIGINS"))
        );
    }
}

use std::{
    sync::Arc,
    time::{Duration, Instant},
};

use reqwest::Client;
use sqlx::{PgPool, postgres::PgPoolOptions};
use thiserror::Error;

use crate::{auth::AuthService, config::Config};

#[derive(Debug, Error)]
pub enum StateBuildError {
    #[error("database_initialization_failed")]
    Database(#[from] sqlx::Error),
    #[error("http_client_initialization_failed")]
    Http(#[from] reqwest::Error),
}

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub database: PgPool,
    pub auth: AuthService,
    pub started_at: Instant,
}

impl AppState {
    pub async fn build(config: Config) -> Result<Self, StateBuildError> {
        let config = Arc::new(config);

        // O processo HTTP precisa continuar vivo mesmo quando o PostgreSQL passa
        // por uma indisponibilidade curta. O pool abre conexões sob demanda e
        // volta a tentar automaticamente nas próximas requisições; /health/ready
        // continua indicando com precisão quando o banco ainda não respondeu.
        let database = PgPoolOptions::new()
            .min_connections(0)
            .max_connections(config.database_max_connections)
            .acquire_timeout(config.request_timeout)
            .idle_timeout(Some(Duration::from_secs(300)))
            .test_before_acquire(true)
            .connect_lazy(&config.database_url)?;

        let http = Client::builder()
            .https_only(true)
            .connect_timeout(Duration::from_secs(10))
            .timeout(config.request_timeout)
            .tcp_keepalive(Duration::from_secs(30))
            .pool_idle_timeout(Duration::from_secs(90))
            .user_agent("labstar-backend/0.1")
            .build()?;
        let auth = AuthService::new(http, Arc::clone(&config));

        Ok(Self {
            config,
            database,
            auth,
            started_at: Instant::now(),
        })
    }
}

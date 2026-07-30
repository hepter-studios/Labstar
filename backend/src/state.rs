use std::{sync::Arc, time::Instant};

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
        let database = PgPoolOptions::new()
            .max_connections(config.database_max_connections)
            .acquire_timeout(config.request_timeout)
            .connect(&config.database_url)
            .await?;

        let http = Client::builder()
            .timeout(config.request_timeout)
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

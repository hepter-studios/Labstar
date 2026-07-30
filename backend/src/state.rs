use std::{sync::Arc, time::Instant};

use reqwest::Client;
use sqlx::{PgPool, postgres::PgPoolOptions};

use crate::{auth::AuthService, config::Config};

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub database: PgPool,
    pub auth: AuthService,
    pub started_at: Instant,
}

impl AppState {
    pub async fn build(config: Config) -> Result<Self, sqlx::Error> {
        let config = Arc::new(config);
        let database = PgPoolOptions::new()
            .max_connections(config.database_max_connections)
            .acquire_timeout(config.request_timeout)
            .connect(&config.database_url)
            .await?;

        let http = Client::builder()
            .timeout(config.request_timeout)
            .user_agent("labstar-backend/0.1")
            .build()
            .map_err(sqlx::Error::Io)?;
        let auth = AuthService::new(http, Arc::clone(&config));

        Ok(Self {
            config,
            database,
            auth,
            started_at: Instant::now(),
        })
    }
}
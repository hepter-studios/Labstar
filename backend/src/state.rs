use std::sync::Arc;

use reqwest::Client;

use crate::{auth::AuthService, config::Config};

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub http: Client,
    pub auth: AuthService,
}

impl AppState {
    pub fn build(config: Config) -> Result<Self, reqwest::Error> {
        let config = Arc::new(config);
        let http = Client::builder()
            .connect_timeout(
                config
                    .request_timeout
                    .min(std::time::Duration::from_secs(10)),
            )
            .timeout(config.request_timeout)
            .user_agent("labstar-admin-api/0.1")
            .build()?;
        let auth = AuthService::new(http.clone(), Arc::clone(&config));
        Ok(Self { config, http, auth })
    }
}

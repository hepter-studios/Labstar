use std::{
    sync::Arc,
    time::{Duration, Instant},
};

use chrono::{DateTime, Utc};
use dashmap::DashMap;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, postgres::PgPoolOptions};
use tokio::sync::broadcast;
use uuid::Uuid;

use crate::{
    auth::{AuthService, AuthenticatedMember},
    config::Config,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type", content = "payload")]
pub enum BackendEvent {
    PresenceSnapshot {
        member_ids: Vec<Uuid>,
    },
    DirectMessageCreated {
        thread_id: Uuid,
        message_id: Uuid,
        author_id: Uuid,
    },
    DirectMessageUpdated {
        thread_id: Uuid,
        message_id: Uuid,
    },
    DirectMessageDeleted {
        thread_id: Uuid,
        message_id: Uuid,
    },
    CallCreated {
        call_id: Uuid,
        recipient_id: Uuid,
    },
    CallUpdated {
        call_id: Uuid,
        status: String,
    },
    CallSignal {
        call_id: Uuid,
        signal_id: i64,
        recipient_id: Uuid,
    },
    WorkItemsChanged,
}

#[derive(Debug, Clone)]
pub struct PresenceEntry {
    pub connected_at: DateTime<Utc>,
    pub active_at: DateTime<Utc>,
    pub connections: usize,
}

#[derive(Debug, Clone)]
pub struct RealtimeTicket {
    pub member: AuthenticatedMember,
    pub expires_at: Instant,
}

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub pool: PgPool,
    pub http: Client,
    pub auth: AuthService,
    pub events: broadcast::Sender<BackendEvent>,
    pub presence: Arc<DashMap<Uuid, PresenceEntry>>,
    pub rate_limits: Arc<DashMap<String, RateWindow>>,
    pub realtime_tickets: Arc<DashMap<String, RealtimeTicket>>,
}

#[derive(Debug, Clone)]
pub struct RateWindow {
    pub started_at: Instant,
    pub count: u32,
}

impl AppState {
    pub async fn build(config: Config) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let config = Arc::new(config);
        let pool = PgPoolOptions::new()
            .max_connections(config.database_max_connections)
            .min_connections(2)
            .acquire_timeout(Duration::from_secs(10))
            .idle_timeout(Some(Duration::from_secs(300)))
            .connect(&config.database_url)
            .await?;

        sqlx::query("select 1").execute(&pool).await?;
        sqlx::migrate!("./migrations").run(&pool).await?;

        let http = Client::builder()
            .connect_timeout(Duration::from_secs(8))
            .timeout(config.request_timeout)
            .user_agent("Labstar-Rust-Backend/1.0")
            .build()?;
        let auth = AuthService::new(http.clone(), config.clone());
        let (events, _) = broadcast::channel(2048);

        Ok(Self {
            config,
            pool,
            http,
            auth,
            events,
            presence: Arc::new(DashMap::new()),
            rate_limits: Arc::new(DashMap::new()),
            realtime_tickets: Arc::new(DashMap::new()),
        })
    }

    pub fn publish(&self, event: BackendEvent) {
        let _ = self.events.send(event);
    }

    pub fn presence_snapshot(&self) -> Vec<Uuid> {
        let mut ids = self
            .presence
            .iter()
            .map(|entry| *entry.key())
            .collect::<Vec<_>>();
        ids.sort_unstable();
        ids
    }
}

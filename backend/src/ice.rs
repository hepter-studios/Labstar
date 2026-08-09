use axum::{Json, extract::State};
use serde::Serialize;

use crate::{auth::AuthenticatedMember, state::AppState};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IceConfiguration {
    pub ice_servers: Vec<IceServer>,
    pub ice_transport_policy: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IceServer {
    pub urls: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub credential: Option<String>,
}

pub async fn configuration(
    State(state): State<AppState>,
    _member: AuthenticatedMember,
) -> Json<IceConfiguration> {
    let mut ice_servers = vec![IceServer {
        urls: state.config.stun_urls.clone(),
        username: None,
        credential: None,
    }];

    if let Some(turn) = &state.config.turn {
        ice_servers.push(IceServer {
            urls: turn.urls.clone(),
            username: Some(turn.username.clone()),
            credential: Some(turn.credential.clone()),
        });
    }

    Json(IceConfiguration {
        ice_servers,
        ice_transport_policy: "all",
    })
}

use std::time::{Duration, Instant};

use axum::{
    Json,
    extract::{
        Query, State, WebSocketUpgrade,
        ws::{Message, WebSocket},
    },
    response::Response,
};
use chrono::Utc;
use futures_util::{SinkExt, StreamExt};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use tokio::time::interval;
use uuid::Uuid;

use crate::{
    auth::AuthenticatedMember,
    error::ApiError,
    state::{AppState, BackendEvent, PresenceEntry, RealtimeTicket},
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TicketResponse {
    pub ticket: String,
    pub expires_in_seconds: u64,
}

#[derive(Debug, Deserialize)]
pub struct RealtimeQuery {
    pub ticket: String,
}

pub async fn create_ticket(
    State(state): State<AppState>,
    member: AuthenticatedMember,
) -> Json<TicketResponse> {
    let mut bytes = [0_u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    let ticket = hex::encode(bytes);
    state.realtime_tickets.insert(
        ticket.clone(),
        RealtimeTicket {
            member,
            expires_at: Instant::now() + Duration::from_secs(30),
        },
    );
    Json(TicketResponse {
        ticket,
        expires_in_seconds: 30,
    })
}

pub async fn websocket(
    State(state): State<AppState>,
    Query(query): Query<RealtimeQuery>,
    upgrade: WebSocketUpgrade,
) -> Result<Response, ApiError> {
    let (_, ticket) = state
        .realtime_tickets
        .remove(&query.ticket)
        .ok_or(ApiError::InvalidSession)?;
    if ticket.expires_at <= Instant::now() {
        return Err(ApiError::InvalidSession);
    }
    Ok(upgrade.on_upgrade(move |socket| handle_socket(state, ticket.member, socket)))
}

async fn handle_socket(state: AppState, member: AuthenticatedMember, socket: WebSocket) {
    connect_presence(&state, member.member_id);
    let mut events = state.events.subscribe();
    let (mut sender, mut receiver) = socket.split();
    let mut heartbeat = interval(Duration::from_secs(20));

    let initial = BackendEvent::PresenceSnapshot {
        member_ids: state.presence_snapshot(),
    };
    if send_event(&mut sender, &initial).await.is_err() {
        disconnect_presence(&state, member.member_id);
        return;
    }

    loop {
        tokio::select! {
            _ = heartbeat.tick() => {
                touch_presence(&state, member.member_id);
                if sender.send(Message::Ping(Vec::new().into())).await.is_err() { break; }
            }
            incoming = receiver.next() => {
                match incoming {
                    Some(Ok(Message::Text(text))) => {
                        if text.contains("heartbeat") { touch_presence(&state, member.member_id); }
                    }
                    Some(Ok(Message::Ping(payload))) => {
                        if sender.send(Message::Pong(payload)).await.is_err() { break; }
                    }
                    Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break,
                    _ => {}
                }
            }
            event = events.recv() => {
                match event {
                    Ok(event) => {
                        if event_visible(&state, member.member_id, &event).await
                            && send_event(&mut sender, &event).await.is_err() { break; }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => {
                        let snapshot = BackendEvent::PresenceSnapshot { member_ids: state.presence_snapshot() };
                        if send_event(&mut sender, &snapshot).await.is_err() { break; }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                }
            }
        }
    }
    disconnect_presence(&state, member.member_id);
}

async fn send_event(
    sender: &mut futures_util::stream::SplitSink<WebSocket, Message>,
    event: &BackendEvent,
) -> Result<(), ()> {
    let text = serde_json::to_string(event).map_err(|_| ())?;
    sender
        .send(Message::Text(text.into()))
        .await
        .map_err(|_| ())
}

fn connect_presence(state: &AppState, member_id: Uuid) {
    let now = Utc::now();
    state
        .presence
        .entry(member_id)
        .and_modify(|entry| {
            entry.connections += 1;
            entry.active_at = now;
        })
        .or_insert(PresenceEntry {
            active_at: now,
            connections: 1,
        });
    publish_presence(state);
}

fn touch_presence(state: &AppState, member_id: Uuid) {
    if let Some(mut entry) = state.presence.get_mut(&member_id) {
        entry.active_at = Utc::now();
    }
}

fn disconnect_presence(state: &AppState, member_id: Uuid) {
    if let Some(mut entry) = state.presence.get_mut(&member_id) {
        if entry.connections > 1 {
            entry.connections -= 1;
            entry.active_at = Utc::now();
        } else {
            drop(entry);
            state.presence.remove(&member_id);
        }
    }
    publish_presence(state);
}

fn publish_presence(state: &AppState) {
    state.publish(BackendEvent::PresenceSnapshot {
        member_ids: state.presence_snapshot(),
    });
}

async fn event_visible(state: &AppState, member_id: Uuid, event: &BackendEvent) -> bool {
    match event {
        BackendEvent::PresenceSnapshot { .. } | BackendEvent::WorkItemsChanged => true,
        BackendEvent::DirectMessageCreated { thread_id, .. }
        | BackendEvent::DirectMessageUpdated { thread_id, .. }
        | BackendEvent::DirectMessageDeleted { thread_id, .. } => {
            sqlx::query_scalar::<_, bool>("select exists(select 1 from public.direct_thread_members where thread_id=$1 and member_id=$2)")
                .bind(thread_id).bind(member_id).fetch_one(&state.pool).await.unwrap_or(false)
        }
        BackendEvent::ChannelMessageChanged { channel_id, .. } => {
            sqlx::query_scalar::<_, bool>(r#"
                select exists(
                  select 1
                  from public.channels channel
                  join public.members member on member.id=$2
                  where channel.id=$1 and (
                    coalesce(cardinality(channel.allowed_roles),0)=0
                    or member.role::text=any(channel.allowed_roles)
                    or coalesce(member.assignments,array[]::text[])
                       && coalesce(channel.allowed_assignments,array[]::text[])
                  )
                )
            "#)
            .bind(channel_id)
            .bind(member_id)
            .fetch_one(&state.pool)
            .await
            .unwrap_or(false)
        }
        BackendEvent::NotificationChanged { member_id: recipient_id } => *recipient_id == member_id,
        BackendEvent::CallCreated { recipient_id, .. } => *recipient_id == member_id,
        BackendEvent::CallSignal { recipient_id, .. } => *recipient_id == member_id,
        BackendEvent::CallUpdated { call_id, .. } => {
            sqlx::query_scalar::<_, bool>("select exists(select 1 from public.direct_call_sessions where id=$1 and $2 in (initiator_id,recipient_id))")
                .bind(call_id).bind(member_id).fetch_one(&state.pool).await.unwrap_or(false)
        }
    }
}

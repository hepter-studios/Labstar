use std::time::{Duration, Instant};

use chrono::{Duration as ChronoDuration, Utc};
use tokio::time::interval;
use tracing::{error, info};

use crate::state::{AppState, BackendEvent};

pub fn spawn_background_tasks(state: AppState) {
    tokio::spawn(async move {
        let mut timer = interval(Duration::from_secs(30));
        loop {
            timer.tick().await;
            if let Err(error) = cleanup_database(&state).await {
                error!(error = %error, "rust_background_cleanup_failed");
            }
            cleanup_memory(&state);
        }
    });
}

async fn cleanup_database(state: &AppState) -> Result<(), sqlx::Error> {
    let missed = sqlx::query(
        "update public.direct_call_sessions set status='missed',ended_at=coalesce(ended_at,now()) where status='ringing' and created_at < now() - interval '60 seconds'",
    )
    .execute(&state.pool)
    .await?
    .rows_affected();
    let ended = sqlx::query(
        "update public.direct_call_sessions set status='ended',ended_at=coalesce(ended_at,now()) where status='accepted' and coalesce(answered_at,created_at) < now() - interval '8 hours'",
    )
    .execute(&state.pool)
    .await?
    .rows_affected();
    let signals = sqlx::query(
        "delete from public.direct_call_signals where created_at < now() - interval '48 hours'",
    )
    .execute(&state.pool)
    .await?
    .rows_affected();
    let invites = sqlx::query(
        "update public.member_invites set status='expired' where status='pending' and expires_at <= now()",
    )
    .execute(&state.pool)
    .await?
    .rows_affected();

    if missed + ended + signals + invites > 0 {
        info!(
            missed,
            ended, signals, invites, "rust_background_cleanup_completed"
        );
    }
    Ok(())
}

fn cleanup_memory(state: &AppState) {
    let now = Instant::now();
    state
        .realtime_tickets
        .retain(|_, ticket| ticket.expires_at > now);
    state
        .rate_limits
        .retain(|_, window| now.duration_since(window.started_at) < Duration::from_secs(120));

    let stale_before = Utc::now() - ChronoDuration::seconds(75);
    let stale = state
        .presence
        .iter()
        .filter_map(|entry| (entry.active_at < stale_before).then_some(*entry.key()))
        .collect::<Vec<_>>();
    if !stale.is_empty() {
        for member_id in stale {
            state.presence.remove(&member_id);
        }
        state.publish(BackendEvent::PresenceSnapshot {
            member_ids: state.presence_snapshot(),
        });
    }
}

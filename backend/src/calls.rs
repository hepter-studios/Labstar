use axum::{extract::{Path, State}, Json};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::FromRow;
use uuid::Uuid;

use crate::{
    auth::AuthenticatedMember,
    direct_messages::ensure_member,
    error::ApiError,
    state::{AppState, BackendEvent},
};

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CallSession {
    pub id: Uuid,
    pub thread_id: Uuid,
    pub initiator_id: Uuid,
    pub recipient_id: Uuid,
    pub kind: String,
    pub status: String,
    pub created_at: DateTime<Utc>,
    pub answered_at: Option<DateTime<Utc>>,
    pub ended_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CallSignal {
    pub id: i64,
    pub call_id: Uuid,
    pub sender_id: Uuid,
    pub recipient_id: Uuid,
    pub signal_type: String,
    pub payload: Value,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCallInput {
    pub thread_id: Uuid,
    pub recipient_id: Uuid,
    pub kind: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetStatusInput { pub status: String }

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendSignalInput {
    pub recipient_id: Uuid,
    pub signal_type: String,
    pub payload: Option<Value>,
}

pub async fn create_call(
    State(state): State<AppState>,
    member: AuthenticatedMember,
    Json(input): Json<CreateCallInput>,
) -> Result<Json<serde_json::Value>, ApiError> {
    if !matches!(input.kind.as_str(), "audio" | "video") {
        return Err(ApiError::invalid("kind"));
    }
    if input.recipient_id == member.member_id {
        return Err(ApiError::invalid("recipientId"));
    }
    ensure_member(&state, input.thread_id, member.member_id).await?;
    ensure_member(&state, input.thread_id, input.recipient_id).await?;

    let mut tx = state.pool.begin().await?;
    sqlx::query("update public.direct_call_sessions set status='missed', ended_at=coalesce(ended_at,now()) where status='ringing' and created_at < now() - interval '60 seconds'")
        .execute(&mut *tx).await?;
    sqlx::query("update public.direct_call_sessions set status='ended', ended_at=coalesce(ended_at,now()) where status='accepted' and coalesce(answered_at,created_at) < now() - interval '8 hours'")
        .execute(&mut *tx).await?;
    sqlx::query("delete from public.direct_call_signals where created_at < now() - interval '48 hours'")
        .execute(&mut *tx).await?;

    let busy = sqlx::query_scalar::<_, bool>(r#"
        select exists(
          select 1 from public.direct_call_sessions
          where status in ('ringing','accepted')
            and ($1 in (initiator_id,recipient_id) or $2 in (initiator_id,recipient_id))
        )
    "#).bind(member.member_id).bind(input.recipient_id).fetch_one(&mut *tx).await?;
    if busy { return Err(ApiError::Conflict("participant_already_in_call")); }

    let id = Uuid::new_v4();
    sqlx::query("insert into public.direct_call_sessions (id,thread_id,initiator_id,recipient_id,kind,status) values ($1,$2,$3,$4,$5,'ringing')")
        .bind(id).bind(input.thread_id).bind(member.member_id).bind(input.recipient_id).bind(input.kind)
        .execute(&mut *tx).await?;
    tx.commit().await?;
    state.publish(BackendEvent::CallCreated { call_id: id, recipient_id: input.recipient_id });
    Ok(Json(serde_json::json!({"callId": id})))
}

pub async fn get_call(
    State(state): State<AppState>,
    member: AuthenticatedMember,
    Path(call_id): Path<Uuid>,
) -> Result<Json<CallSession>, ApiError> {
    let call = load_call(&state, call_id).await?;
    ensure_participant(&call, member.member_id)?;
    Ok(Json(call))
}

pub async fn pending_calls(
    State(state): State<AppState>,
    member: AuthenticatedMember,
) -> Result<Json<Vec<CallSession>>, ApiError> {
    let calls = sqlx::query_as::<_, CallSession>(r#"
        select id,thread_id,initiator_id,recipient_id,kind,status,created_at,answered_at,ended_at
        from public.direct_call_sessions
        where recipient_id=$1 and status='ringing' and created_at >= now() - interval '90 seconds'
        order by created_at desc limit 5
    "#).bind(member.member_id).fetch_all(&state.pool).await?;
    Ok(Json(calls))
}

pub async fn set_status(
    State(state): State<AppState>,
    member: AuthenticatedMember,
    Path(call_id): Path<Uuid>,
    Json(input): Json<SetStatusInput>,
) -> Result<Json<serde_json::Value>, ApiError> {
    if !matches!(input.status.as_str(), "accepted" | "rejected" | "ended" | "missed") {
        return Err(ApiError::invalid("status"));
    }
    let call = load_call(&state, call_id).await?;
    ensure_participant(&call, member.member_id)?;
    if matches!(input.status.as_str(), "accepted" | "rejected") && member.member_id != call.recipient_id {
        return Err(ApiError::PermissionDenied);
    }
    if input.status == "missed" && member.member_id != call.initiator_id {
        return Err(ApiError::PermissionDenied);
    }
    if input.status == "accepted" && call.status != "ringing" {
        return Err(ApiError::Conflict("call_not_ringing"));
    }

    sqlx::query(r#"
        update public.direct_call_sessions
        set status=$2,
            answered_at=case when $2='accepted' then coalesce(answered_at,now()) else answered_at end,
            ended_at=case when $2 in ('rejected','ended','missed') then coalesce(ended_at,now()) else ended_at end
        where id=$1
    "#).bind(call_id).bind(&input.status).execute(&state.pool).await?;
    state.publish(BackendEvent::CallUpdated { call_id, status: input.status });
    Ok(Json(serde_json::json!({"ok": true})))
}

pub async fn send_signal(
    State(state): State<AppState>,
    member: AuthenticatedMember,
    Path(call_id): Path<Uuid>,
    Json(input): Json<SendSignalInput>,
) -> Result<Json<serde_json::Value>, ApiError> {
    if !matches!(input.signal_type.as_str(), "offer" | "answer" | "ice" | "hangup" | "reject") {
        return Err(ApiError::invalid("signalType"));
    }
    let payload = input.payload.unwrap_or_else(|| serde_json::json!({}));
    if serde_json::to_vec(&payload).map_err(|_| ApiError::invalid("payload"))?.len() > 65_536 {
        return Err(ApiError::PayloadTooLarge);
    }
    let call = load_call(&state, call_id).await?;
    ensure_participant(&call, member.member_id)?;
    if input.recipient_id == member.member_id || ![call.initiator_id, call.recipient_id].contains(&input.recipient_id) {
        return Err(ApiError::PermissionDenied);
    }
    if matches!(call.status.as_str(), "rejected" | "ended" | "missed")
        && !matches!(input.signal_type.as_str(), "hangup" | "reject") {
        return Err(ApiError::Conflict("call_finished"));
    }

    let signal_id = sqlx::query_scalar::<_, i64>(r#"
        insert into public.direct_call_signals (call_id,sender_id,recipient_id,signal_type,payload)
        values ($1,$2,$3,$4,$5) returning id
    "#).bind(call_id).bind(member.member_id).bind(input.recipient_id)
        .bind(input.signal_type).bind(payload).fetch_one(&state.pool).await?;
    state.publish(BackendEvent::CallSignal { call_id, signal_id, recipient_id: input.recipient_id });
    Ok(Json(serde_json::json!({"signalId": signal_id})))
}

pub async fn list_signals(
    State(state): State<AppState>,
    member: AuthenticatedMember,
    Path(call_id): Path<Uuid>,
) -> Result<Json<Vec<CallSignal>>, ApiError> {
    let call = load_call(&state, call_id).await?;
    ensure_participant(&call, member.member_id)?;
    let signals = sqlx::query_as::<_, CallSignal>(r#"
        select id,call_id,sender_id,recipient_id,signal_type,payload,created_at
        from public.direct_call_signals where call_id=$1 order by id asc
    "#).bind(call_id).fetch_all(&state.pool).await?;
    Ok(Json(signals))
}

async fn load_call(state: &AppState, call_id: Uuid) -> Result<CallSession, ApiError> {
    sqlx::query_as::<_, CallSession>(r#"
        select id,thread_id,initiator_id,recipient_id,kind,status,created_at,answered_at,ended_at
        from public.direct_call_sessions where id=$1
    "#).bind(call_id).fetch_optional(&state.pool).await?.ok_or(ApiError::NotFound("call"))
}

fn ensure_participant(call: &CallSession, member_id: Uuid) -> Result<(), ApiError> {
    [call.initiator_id, call.recipient_id].contains(&member_id)
        .then_some(()).ok_or(ApiError::PermissionDenied)
}

use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, State},
    http::{
        HeaderValue, Method, StatusCode,
        header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE},
    },
    routing::{delete, get, patch, post, put},
};
use serde::Serialize;
use tower::limit::ConcurrencyLimitLayer;
use tower_http::{
    compression::CompressionLayer,
    cors::{AllowOrigin, CorsLayer},
    request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer},
    sensitive_headers::SetSensitiveHeadersLayer,
    timeout::TimeoutLayer,
    trace::TraceLayer,
};

use crate::{
    calls, channel_messages, collaboration, direct_messages, files, invites, members,
    notifications, planning, profile, realtime, roles, search, state::AppState, uploads,
    work_items, workspace,
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HealthResponse {
    status: &'static str,
    service: &'static str,
    runtime: &'static str,
    version: &'static str,
    database: &'static str,
    realtime: &'static str,
}

pub fn router(state: AppState) -> Result<Router, Box<dyn std::error::Error + Send + Sync>> {
    let allowed_origins = state
        .config
        .allowed_origins
        .iter()
        .map(|origin| origin.parse::<HeaderValue>())
        .collect::<Result<Vec<_>, _>>()?;
    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::list(allowed_origins))
        .allow_credentials(true)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PATCH,
            Method::PUT,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([AUTHORIZATION, CONTENT_TYPE, ACCEPT]);

    let max_body = state.config.max_file_bytes.saturating_add(2 * 1024 * 1024);
    let timeout = state.config.request_timeout;

    Ok(Router::new()
        .route("/health", get(health))
        .route("/health/live", get(health))
        .route("/health/ready", get(ready))
        .route("/v1/me", get(members::me))
        .route("/v1/profile", patch(profile::update))
        .route("/v1/profile/avatar", post(uploads::upload_own_avatar))
        .route("/v1/members", get(members::list_members))
        .route("/v1/members/{member_id}", patch(members::update_member))
        .route("/v1/job-roles", get(roles::list).post(roles::create))
        .route(
            "/v1/job-roles/{role_id}",
            put(roles::update).delete(roles::delete),
        )
        .route(
            "/v1/members/{member_id}/job-roles",
            get(roles::list_for_member).put(roles::set_for_member),
        )
        .route("/v1/invites", get(invites::list).post(invites::create))
        .route("/v1/invites/inspect/{token}", get(invites::inspect))
        .route("/v1/invites/accept/{token}", post(invites::accept))
        .route("/v1/invites/{invite_id}", delete(invites::revoke))
        .route("/v1/workspace", get(workspace::load).put(workspace::save))
        .route("/v1/collaboration", get(collaboration::load))
        .route("/v1/spaces", post(collaboration::create_space))
        .route("/v1/spaces/{space_id}", patch(collaboration::update_space))
        .route("/v1/spaces/{space_id}/logo", post(uploads::upload_space_logo))
        .route("/v1/categories", post(collaboration::create_category))
        .route("/v1/channels", post(collaboration::create_channel))
        .route(
            "/v1/channels/{channel_id}/messages",
            get(channel_messages::list).post(channel_messages::send),
        )
        .route(
            "/v1/channel-messages/{message_id}",
            patch(channel_messages::update).delete(channel_messages::delete),
        )
        .route(
            "/v1/channel-attachments",
            post(channel_messages::upload_attachment),
        )
        .route("/v1/notifications", get(notifications::list))
        .route(
            "/v1/notifications/read-all",
            post(notifications::mark_all_read),
        )
        .route(
            "/v1/notifications/{notification_id}/read",
            post(notifications::mark_read),
        )
        .route(
            "/v1/integrations",
            get(planning::list_integrations).put(planning::save_integration),
        )
        .route(
            "/v1/integrations/{id}",
            delete(planning::delete_integration),
        )
        .route(
            "/v1/social-posts",
            get(planning::list_social_posts).put(planning::save_social_post),
        )
        .route(
            "/v1/social-posts/{id}",
            delete(planning::delete_social_post),
        )
        .route(
            "/v1/meetings",
            get(planning::list_meetings).post(planning::create_meeting),
        )
        .route(
            "/v1/meetings/{id}/cancel",
            post(planning::cancel_meeting),
        )
        .route(
            "/v1/direct/threads",
            get(direct_messages::list_threads).post(direct_messages::create_thread),
        )
        .route(
            "/v1/direct/threads/{thread_id}/messages",
            get(direct_messages::list_messages).post(direct_messages::send_message),
        )
        .route(
            "/v1/direct/threads/{thread_id}/read",
            post(direct_messages::mark_read),
        )
        .route(
            "/v1/direct/messages/{message_id}",
            patch(direct_messages::update_message).delete(direct_messages::delete_message),
        )
        .route(
            "/v1/direct/attachments",
            post(files::upload_direct_attachment),
        )
        .route("/v1/calls", post(calls::create_call))
        .route("/v1/calls/pending", get(calls::pending_calls))
        .route("/v1/calls/{call_id}", get(calls::get_call))
        .route("/v1/calls/{call_id}/status", post(calls::set_status))
        .route(
            "/v1/calls/{call_id}/signals",
            get(calls::list_signals).post(calls::send_signal),
        )
        .route(
            "/v1/work-items",
            get(work_items::list_work_items).post(work_items::create_work_item),
        )
        .route(
            "/v1/work-items/{item_id}",
            patch(work_items::update_work_item).delete(work_items::delete_work_item),
        )
        .route("/v1/search", get(search::global_search))
        .route("/v1/realtime/ticket", post(realtime::create_ticket))
        .route("/v1/realtime", get(realtime::websocket))
        .with_state(state)
        .layer(DefaultBodyLimit::max(max_body))
        .layer(TimeoutLayer::new(timeout))
        .layer(ConcurrencyLimitLayer::new(512))
        .layer(CompressionLayer::new())
        .layer(cors)
        .layer(SetSensitiveHeadersLayer::new(std::iter::once(AUTHORIZATION)))
        .layer(PropagateRequestIdLayer::x_request_id())
        .layer(SetRequestIdLayer::x_request_id(MakeRequestUuid))
        .layer(TraceLayer::new_for_http()))
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        service: "labstar-backend",
        runtime: "rust",
        version: env!("CARGO_PKG_VERSION"),
        database: "postgresql",
        realtime: "rust-websocket",
    })
}

async fn ready(State(state): State<AppState>) -> Result<Json<HealthResponse>, StatusCode> {
    sqlx::query("select 1")
        .execute(&state.pool)
        .await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    Ok(Json(HealthResponse {
        status: "ready",
        service: "labstar-backend",
        runtime: "rust",
        version: env!("CARGO_PKG_VERSION"),
        database: "postgresql",
        realtime: "rust-websocket",
    }))
}

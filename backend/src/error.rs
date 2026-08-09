use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::Serialize;
use thiserror::Error;
use tracing::error;

#[derive(Debug, Error)]
pub enum ApiError {
    #[error("authentication_required")]
    AuthenticationRequired,
    #[error("invalid_session")]
    InvalidSession,
    #[error("member_not_authorized")]
    MemberNotAuthorized,
    #[error("member_pending")]
    MemberPending,
    #[error("member_suspended")]
    MemberSuspended,
    #[error("permission_denied")]
    PermissionDenied,
    #[error("not_found:{0}")]
    NotFound(&'static str),
    #[error("invalid_input:{0}")]
    InvalidInput(&'static str),
    #[error("conflict:{0}")]
    Conflict(&'static str),
    #[error("payload_too_large")]
    PayloadTooLarge,
    #[error("rate_limited")]
    RateLimited,
    #[error("upstream_unavailable")]
    UpstreamUnavailable,
    #[error("database_error")]
    Database(#[from] sqlx::Error),
    #[error("upstream_error")]
    Upstream(#[from] reqwest::Error),
    #[error("internal_error")]
    Internal,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorBody {
    error: ErrorPayload,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorPayload {
    code: &'static str,
    message: &'static str,
}

impl ApiError {
    pub fn invalid(field: &'static str) -> Self {
        Self::InvalidInput(field)
    }

    fn response_parts(&self) -> (StatusCode, &'static str, &'static str) {
        match self {
            Self::AuthenticationRequired => (
                StatusCode::UNAUTHORIZED,
                "authentication_required",
                "Entre novamente para continuar.",
            ),
            Self::InvalidSession => (
                StatusCode::UNAUTHORIZED,
                "invalid_session",
                "A sessão não é mais válida.",
            ),
            Self::MemberNotAuthorized => (
                StatusCode::FORBIDDEN,
                "member_not_authorized",
                "Esta conta não está vinculada à equipe.",
            ),
            Self::MemberPending => (
                StatusCode::FORBIDDEN,
                "member_pending",
                "O acesso ainda aguarda aprovação.",
            ),
            Self::MemberSuspended => (
                StatusCode::FORBIDDEN,
                "member_suspended",
                "O acesso desta conta está suspenso.",
            ),
            Self::PermissionDenied => (
                StatusCode::FORBIDDEN,
                "permission_denied",
                "Você não possui permissão para esta operação.",
            ),
            Self::NotFound(_) => (
                StatusCode::NOT_FOUND,
                "not_found",
                "O recurso solicitado não foi encontrado.",
            ),
            Self::InvalidInput(_) => (
                StatusCode::BAD_REQUEST,
                "invalid_input",
                "Os dados enviados são inválidos.",
            ),
            Self::Conflict(_) => (
                StatusCode::CONFLICT,
                "conflict",
                "A operação conflita com o estado atual.",
            ),
            Self::PayloadTooLarge => (
                StatusCode::PAYLOAD_TOO_LARGE,
                "payload_too_large",
                "O arquivo excede o limite permitido.",
            ),
            Self::RateLimited => (
                StatusCode::TOO_MANY_REQUESTS,
                "rate_limited",
                "Muitas solicitações. Aguarde um instante.",
            ),
            Self::UpstreamUnavailable => (
                StatusCode::SERVICE_UNAVAILABLE,
                "upstream_unavailable",
                "Um serviço necessário está temporariamente indisponível.",
            ),
            Self::Database(_) | Self::Upstream(_) | Self::Internal => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_error",
                "Não foi possível concluir a operação.",
            ),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, code, message) = self.response_parts();
        if status.is_server_error() {
            error!(error = %self, "backend_request_failed");
        }
        (
            status,
            Json(ErrorBody {
                error: ErrorPayload { code, message },
            }),
        )
            .into_response()
    }
}

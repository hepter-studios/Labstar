use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::Serialize;
use thiserror::Error;

use crate::auth::AuthError;

#[derive(Debug, Error)]
pub enum ApiError {
    #[error("authentication_failed")]
    Authentication(#[from] AuthError),
    #[error("member_not_authorized")]
    MemberNotAuthorized,
    #[error("member_pending")]
    MemberPending,
    #[error("member_suspended")]
    MemberSuspended,
    #[error("permission_denied")]
    PermissionDenied,
    #[error("invalid_invite_kind")]
    InvalidInviteKind,
    #[error("invalid_email")]
    InvalidEmail,
    #[error("invalid_role")]
    InvalidRole,
    #[error("invite_invalid_or_expired")]
    InviteInvalidOrExpired,
    #[error("invite_email_mismatch")]
    InviteEmailMismatch,
    #[error("member_already_linked")]
    MemberAlreadyLinked,
    #[error("database_unavailable")]
    DatabaseUnavailable,
    #[error("route_not_found")]
    NotFound,
}

#[derive(Debug, Serialize)]
struct ErrorEnvelope {
    error: ErrorPayload,
}

#[derive(Debug, Serialize)]
struct ErrorPayload {
    code: &'static str,
    message: &'static str,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, code, message) = match self {
            Self::Authentication(AuthError::MissingToken | AuthError::InvalidToken) => (
                StatusCode::UNAUTHORIZED,
                "authentication_failed",
                "A sessão é inválida ou expirou.",
            ),
            Self::Authentication(AuthError::ServiceUnavailable) => (
                StatusCode::SERVICE_UNAVAILABLE,
                "authentication_service_unavailable",
                "O serviço de identidade está temporariamente indisponível.",
            ),
            Self::Authentication(AuthError::InvalidUserPayload) => (
                StatusCode::BAD_GATEWAY,
                "authentication_invalid_response",
                "O serviço de identidade respondeu em um formato inesperado.",
            ),
            Self::MemberNotAuthorized => (
                StatusCode::FORBIDDEN,
                "member_not_authorized",
                "Esta identidade não pertence à equipe Labstar.",
            ),
            Self::MemberPending => (
                StatusCode::FORBIDDEN,
                "member_pending",
                "O acesso ainda aguarda aprovação da equipe.",
            ),
            Self::MemberSuspended => (
                StatusCode::FORBIDDEN,
                "member_suspended",
                "Esta conta está suspensa pela administração.",
            ),
            Self::PermissionDenied => (
                StatusCode::FORBIDDEN,
                "permission_denied",
                "Sua conta não possui permissão para esta ação.",
            ),
            Self::InvalidInviteKind => (
                StatusCode::BAD_REQUEST,
                "invalid_invite_kind",
                "O tipo de convite é inválido.",
            ),
            Self::InvalidEmail => (
                StatusCode::BAD_REQUEST,
                "invalid_email",
                "O e-mail informado é inválido.",
            ),
            Self::InvalidRole => (
                StatusCode::BAD_REQUEST,
                "invalid_role",
                "O nível de acesso informado é inválido.",
            ),
            Self::InviteInvalidOrExpired => (
                StatusCode::BAD_REQUEST,
                "invite_invalid_or_expired",
                "O convite é inválido, já foi usado ou expirou.",
            ),
            Self::InviteEmailMismatch => (
                StatusCode::FORBIDDEN,
                "invite_email_mismatch",
                "O convite pertence a outro e-mail.",
            ),
            Self::MemberAlreadyLinked => (
                StatusCode::CONFLICT,
                "member_already_linked",
                "Este membro já está vinculado a outra identidade.",
            ),
            Self::DatabaseUnavailable => (
                StatusCode::SERVICE_UNAVAILABLE,
                "database_unavailable",
                "O serviço de dados está temporariamente indisponível.",
            ),
            Self::NotFound => (
                StatusCode::NOT_FOUND,
                "route_not_found",
                "O recurso solicitado não existe.",
            ),
        };

        (
            status,
            Json(ErrorEnvelope {
                error: ErrorPayload { code, message },
            }),
        )
            .into_response()
    }
}

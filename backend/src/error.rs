use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ApiError {
    #[error("authentication_failed")]
    AuthenticationFailed,
    #[error("member_not_authorized")]
    MemberNotAuthorized,
    #[error("permission_denied")]
    PermissionDenied,
    #[error("confirmation_email_mismatch")]
    ConfirmationEmailMismatch,
    #[error("account_not_found")]
    AccountNotFound,
    #[error("self_deletion_forbidden")]
    SelfDeletionForbidden,
    #[error("owner_deletion_forbidden")]
    OwnerDeletionForbidden,
    #[error("owner_required")]
    OwnerRequired,
    #[error("member_must_be_suspended")]
    MemberMustBeSuspended,
    #[error("auth_identity_delete_failed")]
    AuthIdentityDeleteFailed,
    #[error("account_cleanup_incomplete")]
    AccountCleanupIncomplete,
    #[error("upstream_unavailable")]
    UpstreamUnavailable,
    #[error("route_not_found")]
    NotFound,
}

#[derive(Serialize)]
struct ErrorEnvelope {
    error: ErrorPayload,
}

#[derive(Serialize)]
struct ErrorPayload {
    code: &'static str,
    message: &'static str,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, code, message) = match self {
            Self::AuthenticationFailed => (
                StatusCode::UNAUTHORIZED,
                "authentication_failed",
                "Sua sessão expirou. Entre novamente.",
            ),
            Self::MemberNotAuthorized => (
                StatusCode::FORBIDDEN,
                "member_not_authorized",
                "Sua sessão não possui autorização administrativa válida.",
            ),
            Self::PermissionDenied => (
                StatusCode::FORBIDDEN,
                "permission_denied",
                "Sua conta não tem permissão para excluir este login.",
            ),
            Self::ConfirmationEmailMismatch => (
                StatusCode::BAD_REQUEST,
                "confirmation_email_mismatch",
                "O e-mail de confirmação não corresponde à conta escolhida.",
            ),
            Self::AccountNotFound => (
                StatusCode::NOT_FOUND,
                "account_not_found",
                "Nenhum membro ou login foi encontrado com este e-mail.",
            ),
            Self::SelfDeletionForbidden => (
                StatusCode::FORBIDDEN,
                "self_deletion_forbidden",
                "Você não pode excluir sua própria conta por esta tela.",
            ),
            Self::OwnerDeletionForbidden => (
                StatusCode::FORBIDDEN,
                "owner_deletion_forbidden",
                "A conta do proprietário não pode ser excluída.",
            ),
            Self::OwnerRequired => (
                StatusCode::FORBIDDEN,
                "owner_required",
                "Somente o proprietário pode concluir esta exclusão.",
            ),
            Self::MemberMustBeSuspended => (
                StatusCode::CONFLICT,
                "member_must_be_suspended",
                "Suspenda este membro antes de excluir permanentemente a conta.",
            ),
            Self::AuthIdentityDeleteFailed => (
                StatusCode::BAD_GATEWAY,
                "auth_identity_delete_failed",
                "O Supabase Auth não concluiu a exclusão. Nenhum cadastro foi anonimizado.",
            ),
            Self::AccountCleanupIncomplete => (
                StatusCode::SERVICE_UNAVAILABLE,
                "account_cleanup_incomplete",
                "O login foi bloqueado, mas a limpeza do cadastro precisa ser repetida.",
            ),
            Self::UpstreamUnavailable => (
                StatusCode::SERVICE_UNAVAILABLE,
                "admin_api_unavailable",
                "A operação administrativa está temporariamente indisponível.",
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

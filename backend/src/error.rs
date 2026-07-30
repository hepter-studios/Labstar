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
    #[error("database_unavailable")]
    DatabaseUnavailable,
    #[error("route_not_found")]
    NotFound,
    #[error("internal_server_error")]
    Internal,
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
            Self::Authentication(_) => (
                StatusCode::UNAUTHORIZED,
                "authentication_failed",
                "A sessão é inválida ou expirou.",
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
            Self::Internal => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_server_error",
                "Ocorreu um erro interno.",
            ),
        };

        (status, Json(ErrorEnvelope { error: ErrorPayload { code, message } })).into_response()
    }
}

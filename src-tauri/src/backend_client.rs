use reqwest::{Client, Method, redirect::Policy};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

const BACKEND_BASE_URL: &str = "https://labstar-api-mackson.fly.dev";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const MAX_RESPONSE_BYTES: usize = 2 * 1024 * 1024;
const MAX_TOKEN_BYTES: usize = 16 * 1024;

#[derive(Clone)]
pub struct NativeBackendClient {
    client: Client,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeBackendRequest {
    pub path: String,
    pub method: String,
    pub access_token: Option<String>,
    pub body: Option<Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeBackendResponse {
    pub status: u16,
    pub body: Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeBackendFailure {
    pub code: &'static str,
    pub message: &'static str,
    pub retryable: bool,
}

impl NativeBackendClient {
    pub fn new() -> Result<Self, String> {
        let client = Client::builder()
            .https_only(true)
            .redirect(Policy::none())
            .connect_timeout(CONNECT_TIMEOUT)
            .timeout(REQUEST_TIMEOUT)
            .user_agent(concat!("LabstarDesktop/", env!("CARGO_PKG_VERSION")))
            .build()
            .map_err(|_| "native_backend_client_init_failed".to_string())?;

        Ok(Self { client })
    }

    pub async fn execute(
        &self,
        input: NativeBackendRequest,
    ) -> Result<NativeBackendResponse, NativeBackendFailure> {
        let method = validate_request(&input)?;
        let url = format!("{BACKEND_BASE_URL}{}", input.path);

        let mut request = self
            .client
            .request(method, url)
            .header("Accept", "application/json");

        if let Some(token) = input.access_token.as_deref() {
            request = request.bearer_auth(token);
        }

        if let Some(body) = input.body.as_ref() {
            request = request.json(body);
        }

        let response = request.send().await.map_err(map_transport_error)?;
        let status = response.status().as_u16();

        if let Some(length) = response.content_length() {
            if length > MAX_RESPONSE_BYTES as u64 {
                return Err(failure(
                    "backend_response_too_large",
                    "A resposta do backend excedeu o limite seguro.",
                    false,
                ));
            }
        }

        let bytes = response.bytes().await.map_err(map_transport_error)?;
        if bytes.len() > MAX_RESPONSE_BYTES {
            return Err(failure(
                "backend_response_too_large",
                "A resposta do backend excedeu o limite seguro.",
                false,
            ));
        }

        let body = if bytes.is_empty() {
            Value::Null
        } else {
            serde_json::from_slice::<Value>(&bytes).unwrap_or_else(|_| {
                Value::String(String::from_utf8_lossy(&bytes).into_owned())
            })
        };

        Ok(NativeBackendResponse { status, body })
    }
}

fn validate_request(input: &NativeBackendRequest) -> Result<Method, NativeBackendFailure> {
    let method = match input.method.trim().to_ascii_uppercase().as_str() {
        "GET" => Method::GET,
        "POST" => Method::POST,
        "DELETE" => Method::DELETE,
        _ => {
            return Err(failure(
                "backend_method_not_allowed",
                "O método solicitado não é permitido pelo núcleo nativo.",
                false,
            ));
        }
    };

    if !path_allows_method(&input.path, &method) {
        return Err(failure(
            "backend_path_not_allowed",
            "O caminho solicitado não é permitido pelo núcleo nativo.",
            false,
        ));
    }

    if let Some(token) = input.access_token.as_deref() {
        let token = token.trim();
        if token.len() < 20
            || token.len() > MAX_TOKEN_BYTES
            || token.chars().any(char::is_whitespace)
            || token.chars().any(char::is_control)
        {
            return Err(failure(
                "backend_invalid_access_token",
                "A sessão local não possui um token de acesso válido.",
                false,
            ));
        }
    }

    if method != Method::POST && input.body.is_some() {
        return Err(failure(
            "backend_body_not_allowed",
            "Este tipo de solicitação não aceita corpo JSON.",
            false,
        ));
    }

    Ok(method)
}

fn path_allows_method(path: &str, method: &Method) -> bool {
    if path.is_empty()
        || path.len() > 512
        || !path.starts_with('/')
        || path.contains('?')
        || path.contains('#')
        || path.contains('%')
        || path.contains('\\')
        || path.contains("..")
        || path.contains("//")
    {
        return false;
    }

    match path {
        "/health/live" | "/health/ready" | "/v1/me" => return *method == Method::GET,
        "/v1/invites" => return matches!(*method, Method::GET | Method::POST),
        _ => {}
    }

    let Some(rest) = path.strip_prefix("/v1/invites/") else {
        return false;
    };
    let segments: Vec<&str> = rest.split('/').collect();

    match segments.as_slice() {
        [value] if valid_invite_reference(value) => matches!(*method, Method::GET | Method::DELETE),
        [token, "accept"] if valid_invite_token(token) => *method == Method::POST,
        _ => false,
    }
}

fn valid_invite_reference(value: &str) -> bool {
    valid_invite_token(value) || valid_uuid(value)
}

fn valid_invite_token(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn valid_uuid(value: &str) -> bool {
    if value.len() != 36 {
        return false;
    }

    value.bytes().enumerate().all(|(index, byte)| {
        if matches!(index, 8 | 13 | 18 | 23) {
            byte == b'-'
        } else {
            byte.is_ascii_hexdigit()
        }
    })
}

fn map_transport_error(error: reqwest::Error) -> NativeBackendFailure {
    if error.is_timeout() {
        return failure(
            "backend_timeout",
            "O backend Rust demorou para responder.",
            true,
        );
    }
    if error.is_connect() {
        return failure(
            "backend_connect_failed",
            "O aplicativo não conseguiu abrir uma conexão segura com o backend Rust.",
            true,
        );
    }
    if error.is_request() {
        return failure(
            "backend_request_failed",
            "O núcleo nativo recusou uma solicitação inválida antes do envio.",
            false,
        );
    }

    failure(
        "backend_transport_failed",
        "A comunicação nativa com o backend Rust foi interrompida.",
        true,
    )
}

fn failure(
    code: &'static str,
    message: &'static str,
    retryable: bool,
) -> NativeBackendFailure {
    NativeBackendFailure {
        code,
        message,
        retryable,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_only_expected_api_routes() {
        assert!(path_allows_method("/v1/me", &Method::GET));
        assert!(path_allows_method("/v1/invites", &Method::POST));
        assert!(path_allows_method(
            "/v1/invites/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef/accept",
            &Method::POST
        ));
        assert!(path_allows_method(
            "/v1/invites/550e8400-e29b-41d4-a716-446655440000",
            &Method::DELETE
        ));

        assert!(!path_allows_method("/v1/me", &Method::POST));
        assert!(!path_allows_method("/admin", &Method::GET));
        assert!(!path_allows_method("//evil.example", &Method::GET));
        assert!(!path_allows_method("/v1/../health/live", &Method::GET));
        assert!(!path_allows_method("/v1/me?next=evil", &Method::GET));
    }

    #[test]
    fn validates_invite_references_without_accepting_arbitrary_path_data() {
        assert!(valid_invite_token(
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
        ));
        assert!(valid_uuid("550e8400-e29b-41d4-a716-446655440000"));
        assert!(!valid_uuid("../../health/live"));
        assert!(!valid_invite_token("not-a-token"));
    }
}

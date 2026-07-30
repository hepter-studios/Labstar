use serde::Serialize;
use std::fmt;
use url::Url;

const INVITE_TOKEN_LENGTH: usize = 64;
const MAX_DEEP_LINK_LENGTH: usize = 4_096;
const MAX_OAUTH_VALUE_LENGTH: usize = 2_048;
const WEB_INVITE_HOST: &str = "labstar.pages.dev";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DeepLinkKind {
    Invite,
    AuthCallback,
    WebInvite,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidatedDeepLink {
    pub kind: DeepLinkKind,
    pub invite_token: Option<String>,
    pub token_hint: Option<String>,
    pub has_authorization_code: bool,
    pub has_provider_error: bool,
    pub normalized_target: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SecurityError {
    EmptyInput,
    InputTooLong,
    InvalidUrl,
    UnsupportedScheme,
    UnsupportedHost,
    UnsupportedPath,
    InvalidInviteToken,
    DuplicateParameter(&'static str),
    UnsupportedParameter,
    InvalidOAuthValue,
}

impl fmt::Display for SecurityError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let message = match self {
            Self::EmptyInput => "deep_link_empty",
            Self::InputTooLong => "deep_link_too_long",
            Self::InvalidUrl => "deep_link_invalid_url",
            Self::UnsupportedScheme => "deep_link_unsupported_scheme",
            Self::UnsupportedHost => "deep_link_unsupported_host",
            Self::UnsupportedPath => "deep_link_unsupported_path",
            Self::InvalidInviteToken => "invite_token_invalid",
            Self::DuplicateParameter(parameter) => {
                return write!(formatter, "deep_link_duplicate_parameter:{parameter}");
            }
            Self::UnsupportedParameter => "deep_link_unsupported_parameter",
            Self::InvalidOAuthValue => "oauth_callback_value_invalid",
        };
        formatter.write_str(message)
    }
}

impl std::error::Error for SecurityError {}

pub fn validate_invite_token(value: &str) -> Result<String, SecurityError> {
    let token = value.trim().to_ascii_lowercase();
    if token.len() != INVITE_TOKEN_LENGTH || !token.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(SecurityError::InvalidInviteToken);
    }
    Ok(token)
}

pub fn build_invite_deep_link(token: &str) -> Result<String, SecurityError> {
    let token = validate_invite_token(token)?;
    Ok(format!("labstar://invite/{token}"))
}

pub fn parse_deep_link(raw: &str) -> Result<ValidatedDeepLink, SecurityError> {
    let input = raw.trim();
    if input.is_empty() {
        return Err(SecurityError::EmptyInput);
    }
    if input.len() > MAX_DEEP_LINK_LENGTH {
        return Err(SecurityError::InputTooLong);
    }

    let url = Url::parse(input).map_err(|_| SecurityError::InvalidUrl)?;
    match url.scheme() {
        "labstar" => parse_native_link(&url),
        "https" => parse_web_invite(&url),
        _ => Err(SecurityError::UnsupportedScheme),
    }
}

fn parse_native_link(url: &Url) -> Result<ValidatedDeepLink, SecurityError> {
    match url.host_str() {
        Some("invite") => parse_native_invite(url),
        Some("auth") => parse_auth_callback(url),
        _ => Err(SecurityError::UnsupportedHost),
    }
}

fn parse_native_invite(url: &Url) -> Result<ValidatedDeepLink, SecurityError> {
    if url.query().is_some() || url.fragment().is_some() {
        return Err(SecurityError::UnsupportedParameter);
    }

    let token = url.path().trim_matches('/');
    if token.is_empty() || token.contains('/') {
        return Err(SecurityError::UnsupportedPath);
    }
    let token = validate_invite_token(token)?;

    Ok(ValidatedDeepLink {
        kind: DeepLinkKind::Invite,
        token_hint: Some(token.chars().take(8).collect()),
        invite_token: Some(token),
        has_authorization_code: false,
        has_provider_error: false,
        normalized_target: "labstar://invite".to_string(),
    })
}

fn parse_auth_callback(url: &Url) -> Result<ValidatedDeepLink, SecurityError> {
    if url.path() != "/callback" || url.fragment().is_some() {
        return Err(SecurityError::UnsupportedPath);
    }

    let mut invite_token = None;
    let mut has_authorization_code = false;
    let mut has_provider_error = false;
    let mut seen_code = false;
    let mut seen_invite = false;

    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "code" => {
                if seen_code {
                    return Err(SecurityError::DuplicateParameter("code"));
                }
                seen_code = true;
                validate_oauth_value(&value)?;
                has_authorization_code = true;
            }
            "invite" => {
                if seen_invite {
                    return Err(SecurityError::DuplicateParameter("invite"));
                }
                seen_invite = true;
                invite_token = Some(validate_invite_token(&value)?);
            }
            "error" | "error_code" | "error_description" => {
                validate_oauth_value(&value)?;
                has_provider_error = true;
            }
            "state" => validate_oauth_value(&value)?,
            _ => return Err(SecurityError::UnsupportedParameter),
        }
    }

    if !has_authorization_code && !has_provider_error {
        return Err(SecurityError::InvalidOAuthValue);
    }

    Ok(ValidatedDeepLink {
        kind: DeepLinkKind::AuthCallback,
        token_hint: invite_token
            .as_ref()
            .map(|token| token.chars().take(8).collect()),
        invite_token,
        has_authorization_code,
        has_provider_error,
        normalized_target: "labstar://auth/callback".to_string(),
    })
}

fn parse_web_invite(url: &Url) -> Result<ValidatedDeepLink, SecurityError> {
    if url.host_str() != Some(WEB_INVITE_HOST) {
        return Err(SecurityError::UnsupportedHost);
    }
    if url.port().is_some() || !matches!(url.path(), "/" | "/invite") || url.fragment().is_some() {
        return Err(SecurityError::UnsupportedPath);
    }

    let mut token = None;
    for (key, value) in url.query_pairs() {
        if key != "invite" {
            return Err(SecurityError::UnsupportedParameter);
        }
        if token.is_some() {
            return Err(SecurityError::DuplicateParameter("invite"));
        }
        token = Some(validate_invite_token(&value)?);
    }

    let token = token.ok_or(SecurityError::InvalidInviteToken)?;
    Ok(ValidatedDeepLink {
        kind: DeepLinkKind::WebInvite,
        token_hint: Some(token.chars().take(8).collect()),
        invite_token: Some(token),
        has_authorization_code: false,
        has_provider_error: false,
        normalized_target: format!("https://{WEB_INVITE_HOST}/?invite=<redacted>"),
    })
}

fn validate_oauth_value(value: &str) -> Result<(), SecurityError> {
    if value.is_empty()
        || value.len() > MAX_OAUTH_VALUE_LENGTH
        || value.chars().any(char::is_control)
    {
        return Err(SecurityError::InvalidOAuthValue);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const TOKEN: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    #[test]
    fn validates_and_normalizes_invite_token() {
        assert_eq!(validate_invite_token(&TOKEN.to_uppercase()).unwrap(), TOKEN);
        assert_eq!(
            validate_invite_token("abc").unwrap_err(),
            SecurityError::InvalidInviteToken
        );
    }

    #[test]
    fn accepts_native_invite() {
        let parsed = parse_deep_link(&format!("labstar://invite/{TOKEN}")).unwrap();
        assert_eq!(parsed.kind, DeepLinkKind::Invite);
        assert_eq!(parsed.invite_token.as_deref(), Some(TOKEN));
    }

    #[test]
    fn accepts_oauth_callback_without_exposing_code() {
        let parsed = parse_deep_link(&format!(
            "labstar://auth/callback?code=secure-code-value&invite={TOKEN}"
        ))
        .unwrap();
        assert_eq!(parsed.kind, DeepLinkKind::AuthCallback);
        assert!(parsed.has_authorization_code);
        assert_eq!(parsed.normalized_target, "labstar://auth/callback");
    }

    #[test]
    fn accepts_only_official_web_host() {
        assert!(parse_deep_link(&format!("https://labstar.pages.dev/?invite={TOKEN}")).is_ok());
        assert_eq!(
            parse_deep_link(&format!("https://evil.example/?invite={TOKEN}")).unwrap_err(),
            SecurityError::UnsupportedHost
        );
    }

    #[test]
    fn rejects_duplicate_and_unknown_parameters() {
        assert!(matches!(
            parse_deep_link(&format!(
                "labstar://auth/callback?code=one&code=two&invite={TOKEN}"
            )),
            Err(SecurityError::DuplicateParameter("code"))
        ));
        assert_eq!(
            parse_deep_link(&format!(
                "https://labstar.pages.dev/?invite={TOKEN}&next=evil"
            ))
            .unwrap_err(),
            SecurityError::UnsupportedParameter
        );
    }
}

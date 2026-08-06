use std::fmt;
use url::Url;

const MAX_URL_LENGTH: usize = 4_096;
const GITHUB_HOST: &str = "github.com";
const GITHUB_AUTHORIZE_PATH: &str = "/login/oauth/authorize";
const SUPABASE_HOST: &str = "pgzwyngxsxnheulvusdq.supabase.co";
const CALLBACK_PATH: &str = "/functions/v1/github-profile-connection";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProfileConnectionError {
    EmptyInput,
    InputTooLong,
    InvalidUrl,
    UnsupportedScheme,
    UnsupportedHost,
    UnsupportedPath,
    UnsupportedParameter,
    MissingParameter(&'static str),
    InvalidCallback,
    InvalidValue,
}

impl fmt::Display for ProfileConnectionError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EmptyInput => formatter.write_str("profile_connection_url_empty"),
            Self::InputTooLong => formatter.write_str("profile_connection_url_too_long"),
            Self::InvalidUrl => formatter.write_str("profile_connection_url_invalid"),
            Self::UnsupportedScheme => formatter.write_str("profile_connection_scheme_invalid"),
            Self::UnsupportedHost => formatter.write_str("profile_connection_host_invalid"),
            Self::UnsupportedPath => formatter.write_str("profile_connection_path_invalid"),
            Self::UnsupportedParameter => formatter.write_str("profile_connection_parameter_invalid"),
            Self::MissingParameter(parameter) => write!(formatter, "profile_connection_missing:{parameter}"),
            Self::InvalidCallback => formatter.write_str("profile_connection_callback_invalid"),
            Self::InvalidValue => formatter.write_str("profile_connection_value_invalid"),
        }
    }
}

impl std::error::Error for ProfileConnectionError {}

pub fn validate_github_authorization_url(raw: &str) -> Result<String, ProfileConnectionError> {
    let input = raw.trim();
    if input.is_empty() {
        return Err(ProfileConnectionError::EmptyInput);
    }
    if input.len() > MAX_URL_LENGTH {
        return Err(ProfileConnectionError::InputTooLong);
    }

    let url = Url::parse(input).map_err(|_| ProfileConnectionError::InvalidUrl)?;
    if url.scheme() != "https" {
        return Err(ProfileConnectionError::UnsupportedScheme);
    }
    if url.host_str() != Some(GITHUB_HOST) || url.port().is_some() {
        return Err(ProfileConnectionError::UnsupportedHost);
    }
    if url.path() != GITHUB_AUTHORIZE_PATH || url.fragment().is_some() {
        return Err(ProfileConnectionError::UnsupportedPath);
    }

    let mut client_id = None;
    let mut state = None;
    let mut redirect_uri = None;
    for (key, value) in url.query_pairs() {
        if value.is_empty() || value.len() > 2_048 || value.chars().any(char::is_control) {
            return Err(ProfileConnectionError::InvalidValue);
        }
        match key.as_ref() {
            "client_id" => client_id = Some(value.into_owned()),
            "state" => state = Some(value.into_owned()),
            "redirect_uri" => redirect_uri = Some(value.into_owned()),
            "scope" | "allow_signup" | "login" => {}
            _ => return Err(ProfileConnectionError::UnsupportedParameter),
        }
    }

    if client_id.is_none() {
        return Err(ProfileConnectionError::MissingParameter("client_id"));
    }
    if state.is_none() {
        return Err(ProfileConnectionError::MissingParameter("state"));
    }
    let callback = redirect_uri.ok_or(ProfileConnectionError::MissingParameter("redirect_uri"))?;
    let callback = Url::parse(&callback).map_err(|_| ProfileConnectionError::InvalidCallback)?;
    if callback.scheme() != "https"
        || callback.host_str() != Some(SUPABASE_HOST)
        || callback.port().is_some()
        || callback.path() != CALLBACK_PATH
        || callback.fragment().is_some()
        || callback.query_pairs().any(|(key, value)| key != "action" || value != "callback")
    {
        return Err(ProfileConnectionError::InvalidCallback);
    }

    Ok(url.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_url() -> String {
        let callback = urlencoding::encode(
            "https://pgzwyngxsxnheulvusdq.supabase.co/functions/v1/github-profile-connection?action=callback",
        );
        format!(
            "https://github.com/login/oauth/authorize?client_id=abc123&redirect_uri={callback}&scope=read%3Auser&state=secure-state&allow_signup=false"
        )
    }

    #[test]
    fn accepts_only_the_profile_connection_flow() {
        assert!(validate_github_authorization_url(&valid_url()).is_ok());
        assert!(validate_github_authorization_url("https://github.com/login").is_err());
        assert!(validate_github_authorization_url("https://evil.example/login/oauth/authorize").is_err());
    }

    #[test]
    fn rejects_a_callback_outside_the_labstar_function() {
        let unsafe_url = "https://github.com/login/oauth/authorize?client_id=abc&state=state&redirect_uri=https%3A%2F%2Fevil.example%2Fcallback";
        assert_eq!(
            validate_github_authorization_url(unsafe_url).unwrap_err(),
            ProfileConnectionError::InvalidCallback
        );
    }
}

use rand::RngCore;
use std::{fs, io::Write, path::Path};
use tauri::{AppHandle, Manager};

const VAULT_PASSWORD_FILE: &str = "mobile-session-vault.key";
const VAULT_PASSWORD_HEX_LENGTH: usize = 64;

fn valid_password(value: &str) -> bool {
    value.len() == VAULT_PASSWORD_HEX_LENGTH && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn encode_hex(bytes: &[u8]) -> String {
    const TABLE: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push(TABLE[(byte >> 4) as usize] as char);
        output.push(TABLE[(byte & 0x0f) as usize] as char);
    }
    output
}

#[cfg(unix)]
fn restrict_permissions(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o600))
        .map_err(|error| format!("secure_vault_permissions_failed:{error}"))
}

#[cfg(not(unix))]
fn restrict_permissions(_path: &Path) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn secure_vault_password(app: AppHandle) -> Result<String, String> {
    let directory = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("secure_vault_directory_unavailable:{error}"))?;
    fs::create_dir_all(&directory)
        .map_err(|error| format!("secure_vault_directory_create_failed:{error}"))?;

    let path = directory.join(VAULT_PASSWORD_FILE);
    if path.exists() {
        let value = fs::read_to_string(&path)
            .map_err(|error| format!("secure_vault_key_read_failed:{error}"))?
            .trim()
            .to_ascii_lowercase();
        if !valid_password(&value) {
            return Err("secure_vault_key_invalid".to_string());
        }
        restrict_permissions(&path)?;
        return Ok(value);
    }

    let mut bytes = [0_u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    let value = encode_hex(&bytes);

    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);
    let mut file = match options.open(&path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            let value = fs::read_to_string(&path)
                .map_err(|read_error| format!("secure_vault_key_read_failed:{read_error}"))?
                .trim()
                .to_ascii_lowercase();
            if !valid_password(&value) {
                return Err("secure_vault_key_invalid".to_string());
            }
            restrict_permissions(&path)?;
            return Ok(value);
        }
        Err(error) => return Err(format!("secure_vault_key_create_failed:{error}")),
    };
    file.write_all(value.as_bytes())
        .map_err(|error| format!("secure_vault_key_write_failed:{error}"))?;
    file.sync_all()
        .map_err(|error| format!("secure_vault_key_sync_failed:{error}"))?;
    restrict_permissions(&path)?;
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generated_hex_encoding_has_expected_shape() {
        let encoded = encode_hex(&[0x00, 0xab, 0xff]);
        assert_eq!(encoded, "00abff");
        assert!(valid_password(&"a".repeat(VAULT_PASSWORD_HEX_LENGTH)));
        assert!(!valid_password("short"));
        assert!(!valid_password(&"z".repeat(VAULT_PASSWORD_HEX_LENGTH)));
    }
}

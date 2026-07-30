use crate::security::{self, ValidatedDeepLink};
use std::sync::Mutex;

#[derive(Default)]
pub struct PendingDeepLinks {
    items: Mutex<Vec<ValidatedDeepLink>>,
}

impl PendingDeepLinks {
    pub fn ingest(&self, raw: &str) -> Result<ValidatedDeepLink, String> {
        let parsed = security::parse_deep_link(raw).map_err(|error| error.to_string())?;
        let mut items = self
            .items
            .lock()
            .map_err(|_| "pending_deep_links_lock_poisoned".to_string())?;

        // Evita processar o mesmo retorno duas vezes quando o sistema operacional
        // e o plugin entregarem o mesmo URL durante a inicialização.
        if !items.contains(&parsed) {
            items.push(parsed.clone());
        }
        Ok(parsed)
    }

    pub fn drain(&self) -> Result<Vec<ValidatedDeepLink>, String> {
        let mut items = self
            .items
            .lock()
            .map_err(|_| "pending_deep_links_lock_poisoned".to_string())?;
        Ok(std::mem::take(&mut *items))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TOKEN: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    #[test]
    fn stores_each_deep_link_only_once() {
        let state = PendingDeepLinks::default();
        let url = format!("labstar://invite/{TOKEN}");
        state.ingest(&url).unwrap();
        state.ingest(&url).unwrap();
        assert_eq!(state.drain().unwrap().len(), 1);
        assert!(state.drain().unwrap().is_empty());
    }
}

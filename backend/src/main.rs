mod auth;
mod calls;
mod config;
mod direct_messages;
mod error;
mod files;
mod invites;
mod jobs;
mod members;
mod realtime;
mod routes;
mod search;
mod state;
mod work_items;

use std::process::ExitCode;

use config::Config;
use state::AppState;
use tracing::{error, info};
use tracing_subscriber::{EnvFilter, fmt};

#[tokio::main]
async fn main() -> ExitCode {
    dotenvy::dotenv().ok();
    init_tracing();
    match run().await {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            error!(error = %error, "backend_initialization_failed");
            ExitCode::FAILURE
        }
    }
}

async fn run() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let config = Config::from_env()?;
    let bind_addr = config.bind_addr;
    let state = AppState::build(config).await?;
    jobs::spawn_background_tasks(state.clone());
    let app = routes::router(state)?;

    let listener = tokio::net::TcpListener::bind(bind_addr).await?;
    info!(address = %bind_addr, runtime = "rust", "labstar_backend_started");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    info!("labstar_backend_stopped");
    Ok(())
}

fn init_tracing() {
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("labstar_backend=info,tower_http=info"));
    fmt()
        .with_env_filter(filter)
        .json()
        .with_target(true)
        .with_current_span(false)
        .init();
}

async fn shutdown_signal() {
    let ctrl_c = async {
        if let Err(error) = tokio::signal::ctrl_c().await {
            error!(error = %error, "ctrl_c_handler_failed");
        }
    };

    #[cfg(unix)]
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut signal) => {
                signal.recv().await;
            }
            Err(error) => {
                error!(error = %error, "terminate_handler_failed");
                std::future::pending::<()>().await;
            }
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        () = ctrl_c => {},
        () = terminate => {},
    }
}

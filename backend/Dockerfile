FROM rust:1.88-bookworm AS builder
WORKDIR /app

COPY Cargo.toml ./Cargo.toml
RUN mkdir -p src && printf 'fn main() {}\n' > src/main.rs
RUN cargo build --release
RUN rm -rf src

COPY src ./src
COPY migrations ./migrations
RUN touch src/main.rs && cargo build --release

FROM debian:bookworm-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --system --uid 10001 --create-home labstar
WORKDIR /opt/labstar
COPY --from=builder /app/target/release/labstar-backend /usr/local/bin/labstar-backend

ENV LABSTAR_BIND_ADDR=0.0.0.0:8080
EXPOSE 8080
USER labstar

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl --fail --silent http://127.0.0.1:8080/health >/dev/null || exit 1

ENTRYPOINT ["/usr/local/bin/labstar-backend"]

FROM rust:1.88-bookworm AS builder

WORKDIR /build

COPY backend/Cargo.toml backend/Cargo.lock ./
RUN mkdir src \
    && printf 'fn main() {}\n' > src/main.rs \
    && cargo build --release --locked \
    && rm -rf src

COPY backend/src ./src
RUN touch src/main.rs \
    && cargo build --release --locked

FROM debian:bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 10001 labstar \
    && useradd --system --uid 10001 --gid labstar --home-dir /nonexistent --shell /usr/sbin/nologin labstar

COPY --from=builder /build/target/release/labstar-backend /usr/local/bin/labstar-backend

ENV LABSTAR_BIND_ADDR=0.0.0.0:8080
ENV RUST_LOG=labstar_backend=info,tower_http=info

EXPOSE 8080

USER labstar

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl --fail --silent http://127.0.0.1:8080/health/live > /dev/null || exit 1

ENTRYPOINT ["/usr/local/bin/labstar-backend"]

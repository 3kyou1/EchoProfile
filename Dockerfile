# syntax=docker/dockerfile:1.7
# Multi-stage build for EchoProfile WebUI server mode.
# The final image runs a single echo-profile binary with embedded frontend assets.

# ---- Shared apt options ------------------------------------------------------
ARG APT_RETRY_OPTIONS="-o Acquire::Retries=5 -o Acquire::http::Timeout=120 -o Acquire::https::Timeout=120"

# ---- Stage 1: Build frontend -------------------------------------------------
FROM node:20-slim AS frontend

ARG PROXY_URL
ENV http_proxy=${PROXY_URL} \
    https_proxy=${PROXY_URL} \
    HTTP_PROXY=${PROXY_URL} \
    HTTPS_PROXY=${PROXY_URL} \
    no_proxy=localhost,127.0.0.1,::1 \
    NO_PROXY=localhost,127.0.0.1,::1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    npm_config_fetch_retries=5 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=120000 \
    npm_config_fetch_timeout=120000

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,target=/root/.cache/node/corepack \
    --mount=type=cache,target=/root/.local/share/pnpm/store \
    corepack enable \
    && corepack prepare pnpm@10.13.1 --activate \
    && pnpm install --frozen-lockfile
COPY . ./
RUN pnpm exec tsc --build . && pnpm exec vite build

# ---- Stage 2: Build Rust server binary --------------------------------------
FROM rust:1-bookworm AS backend

ARG PROXY_URL
ARG APT_RETRY_OPTIONS
ENV http_proxy=${PROXY_URL} \
    https_proxy=${PROXY_URL} \
    HTTP_PROXY=${PROXY_URL} \
    HTTPS_PROXY=${PROXY_URL} \
    no_proxy=localhost,127.0.0.1,::1 \
    NO_PROXY=localhost,127.0.0.1,::1 \
    CARGO_NET_RETRY=5 \
    CARGO_HTTP_TIMEOUT=120

RUN sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources \
    && apt-get ${APT_RETRY_OPTIONS} update \
    && apt-get ${APT_RETRY_OPTIONS} install -y --no-install-recommends \
       libwebkit2gtk-4.1-dev \
       libappindicator3-dev \
       librsvg2-dev \
       patchelf \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY src-tauri/ src-tauri/
COPY --from=frontend /app/dist dist/
WORKDIR /app/src-tauri
RUN cargo build --release --features webui-server

# ---- Stage 3: Runtime image --------------------------------------------------
FROM debian:bookworm-slim

ARG PROXY_URL
ARG APT_RETRY_OPTIONS
ENV http_proxy=${PROXY_URL} \
    https_proxy=${PROXY_URL} \
    HTTP_PROXY=${PROXY_URL} \
    HTTPS_PROXY=${PROXY_URL} \
    no_proxy=localhost,127.0.0.1,::1 \
    NO_PROXY=localhost,127.0.0.1,::1 \
    DEBIAN_FRONTEND=noninteractive

RUN apt-get ${APT_RETRY_OPTIONS} update \
    && apt-get ${APT_RETRY_OPTIONS} install -y --no-install-recommends \
       ca-certificates \
       curl \
       libgtk-3-0 \
       libwebkit2gtk-4.1-0 \
       libjavascriptcoregtk-4.1-0 \
       libappindicator3-1 \
       librsvg2-2 \
    && rm -rf /var/lib/apt/lists/*

ENV http_proxy= \
    https_proxy= \
    HTTP_PROXY= \
    HTTPS_PROXY= \
    PORT=3727

RUN groupadd --system echoprofile \
    && useradd --system --gid echoprofile --home-dir /home/echoprofile --shell /usr/sbin/nologin --create-home echoprofile

COPY --from=backend /app/src-tauri/target/release/echo-profile /usr/local/bin/echo-profile

EXPOSE 3727
USER echoprofile

ENTRYPOINT ["echo-profile", "--serve", "--host", "0.0.0.0"]
CMD ["--port", "3727"]

# Multi-stage build for EchoProfile WebUI server mode.
# The final image runs a single echo-profile binary with embedded frontend assets.

# ---- Stage 1: Build frontend -------------------------------------------------
FROM node:20-slim AS frontend

ARG PROXY_URL
ENV http_proxy=${PROXY_URL} \
    https_proxy=${PROXY_URL}

WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack install && pnpm install --frozen-lockfile
COPY . ./
RUN pnpm exec tsc --build . && pnpm exec vite build

# ---- Stage 2: Build Rust server binary --------------------------------------
FROM rust:1-bookworm AS backend

ARG PROXY_URL
ENV http_proxy=${PROXY_URL} \
    https_proxy=${PROXY_URL}

RUN sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
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
ENV http_proxy=${PROXY_URL}

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
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
    PORT=3727

RUN groupadd --system echoprofile \
    && useradd --system --gid echoprofile --home-dir /home/echoprofile --shell /usr/sbin/nologin --create-home echoprofile

COPY --from=backend /app/src-tauri/target/release/echo-profile /usr/local/bin/echo-profile

EXPOSE 3727
USER echoprofile

ENTRYPOINT ["echo-profile", "--serve", "--host", "0.0.0.0"]
CMD ["--port", "3727"]

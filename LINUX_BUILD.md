# EchoProfile Linux and Server Deployment

EchoProfile can be used on Linux in two different ways:

- Desktop app: a normal Tauri desktop build, usually distributed as an AppImage.
- WebUI server: a headless `echo-profile --serve` binary for VPS, homelab, or remote browser access.

The files in this repository support both source builds and one-command server deployment.

## Install the released server binary

For most server users, install the prebuilt binary from GitHub Releases:

```sh
curl -fsSL https://raw.githubusercontent.com/jhlee0409/echo-profile/main/install-server.sh | sh
```

Install a specific release:

```sh
VERSION=v1.11.0 sh install-server.sh
```

Run locally after installation:

```sh
echo-profile --serve --host 127.0.0.1 --port 3727
```

Use a stable auth token when the service is reachable by other machines:

```sh
ECHOPROFILE_TOKEN='replace-with-a-long-random-token' \
  echo-profile --serve --host 127.0.0.1 --port 3727
```

Bind to `0.0.0.0` only when the host is protected by a firewall or reverse proxy.

## Run with Docker Compose

Docker is the easiest option when you do not want to install Node, Rust, and Tauri build dependencies on the host.

```sh
docker compose up --build -d
```

By default, `docker-compose.yml` binds the service to localhost:

```text
http://127.0.0.1:3727
```

Optional `.env` values:

```env
ECHOPROFILE_PORT=3727
ECHOPROFILE_TOKEN=replace-with-a-long-random-token
PROXY_URL=http://127.0.0.1:7890
```

The compose file mounts these host directories read-only so EchoProfile can scan supported chat histories:

- `~/.claude`
- `~/.codex`
- `~/.local/share/opencode`

Application data is stored in the named Docker volume `echo-profile-data`.

## Run with systemd

Install the server binary first, then install the service template:

```sh
sudo cp contrib/echo-profile.service /etc/systemd/system/echo-profile.service
sudo systemctl edit --full echo-profile.service
```

Create EchoProfile's writable app-data directory and edit these fields before starting the service:

```sh
mkdir -p ~/.echo-profile
```

```ini
User=YOUR_USERNAME_HERE
Group=YOUR_USERNAME_HERE
WorkingDirectory=/home/YOUR_USERNAME_HERE
ReadWritePaths=/home/YOUR_USERNAME_HERE/.echo-profile
Environment=ECHOPROFILE_TOKEN=replace-with-a-long-random-token
```

Start and inspect the service:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now echo-profile.service
sudo systemctl status echo-profile.service
journalctl -u echo-profile.service -f
```

The service binds to `127.0.0.1:3727` by default. Put Nginx, Caddy, Tailscale, SSH tunneling, or another access layer in front of it for remote use.

## Build from source

Install project dependencies:

```sh
pnpm install
```

Build the frontend:

```sh
pnpm run build:web
```

Build the WebUI server binary with embedded frontend assets:

```sh
cd src-tauri
cargo build --release --features webui-server
```

Run the built binary:

```sh
./src-tauri/target/release/echo-profile --serve --host 127.0.0.1 --port 3727
```

You can also use the justfile helpers:

```sh
just serve-build
just serve --host 127.0.0.1 --port 3727
```

## Linux desktop build

Build the normal Tauri desktop app:

```sh
pnpm install
pnpm tauri:build
```

On Debian/Ubuntu, Tauri requires WebKitGTK and related native packages. The CI workflow installs this baseline:

```sh
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libappindicator3-dev \
  librsvg2-dev \
  patchelf
```

## Release artifact names

Server GitHub Releases use this naming convention:

```text
echo-profile-linux-x64.tar.gz
echo-profile-linux-arm64.tar.gz
echo-profile-macos-x64.tar.gz
echo-profile-macos-arm64.tar.gz
CHECKSUMS.sha256
```

Each archive contains one executable named `echo-profile`.

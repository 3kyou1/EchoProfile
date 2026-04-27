#!/bin/sh
# install-server.sh - one-line installer for the EchoProfile WebUI server binary.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/jhlee0409/echo-profile/main/install-server.sh | sh
#
# Environment variables:
#   INSTALL_DIR  Installation directory (default: /usr/local/bin)
#   VERSION      Specific version to install, with or without leading v (default: latest)

set -eu

REPO="jhlee0409/echo-profile"
BINARY_NAME="echo-profile"
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"

info() { printf '  \033[1;34m->\033[0m %s\n' "$1"; }
ok() { printf '  \033[1;32mOK\033[0m %s\n' "$1"; }
err() { printf '  \033[1;31mERROR\033[0m %s\n' "$1" >&2; exit 1; }

need_cmd() {
    if ! command -v "$1" >/dev/null 2>&1; then
        err "Required command not found: $1"
    fi
}

detect_platform() {
    OS="$(uname -s)"
    ARCH="$(uname -m)"

    case "$OS" in
        Linux) OS_TAG="linux" ;;
        Darwin) OS_TAG="macos" ;;
        *) err "Unsupported OS: $OS. EchoProfile server releases support Linux and macOS." ;;
    esac

    case "$ARCH" in
        x86_64|amd64) ARCH_TAG="x64" ;;
        aarch64|arm64) ARCH_TAG="arm64" ;;
        *) err "Unsupported architecture: $ARCH. EchoProfile server releases support x64 and arm64." ;;
    esac

    PLATFORM="${OS_TAG}-${ARCH_TAG}"
}

resolve_version() {
    if [ -n "${VERSION:-}" ]; then
        TAG="v${VERSION#v}"
        return
    fi

    TAG="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
        | grep '"tag_name"' \
        | head -1 \
        | sed 's/.*"tag_name": *"//;s/".*//')"

    if [ -z "$TAG" ]; then
        err "Failed to fetch latest release tag from GitHub. Set VERSION=vX.Y.Z to install a specific version."
    fi
}

checksum_file_contains_artifact() {
    grep "  ${ARTIFACT}$" "${TMPDIR}/${CHECKSUM_FILE}" >/dev/null 2>&1
}

verify_checksum() {
    CHECKSUM_URL="https://github.com/${REPO}/releases/download/${TAG}/${CHECKSUM_FILE}"

    if ! curl -fsSL "$CHECKSUM_URL" -o "${TMPDIR}/${CHECKSUM_FILE}" 2>/dev/null; then
        info "CHECKSUMS.sha256 not found for ${TAG}; skipping checksum verification"
        return
    fi

    if ! checksum_file_contains_artifact; then
        info "${ARTIFACT} is not listed in CHECKSUMS.sha256; skipping checksum verification"
        return
    fi

    EXPECTED="$(grep "  ${ARTIFACT}$" "${TMPDIR}/${CHECKSUM_FILE}" | awk '{print $1}')"
    if command -v sha256sum >/dev/null 2>&1; then
        ACTUAL="$(sha256sum "${TMPDIR}/${ARTIFACT}" | awk '{print $1}')"
    elif command -v shasum >/dev/null 2>&1; then
        ACTUAL="$(shasum -a 256 "${TMPDIR}/${ARTIFACT}" | awk '{print $1}')"
    else
        info "No sha256sum or shasum found; skipping checksum verification"
        return
    fi

    if [ "$ACTUAL" != "$EXPECTED" ]; then
        err "Checksum mismatch for ${ARTIFACT}. Expected ${EXPECTED}, got ${ACTUAL}."
    fi

    ok "Checksum verified"
}

install_binary() {
    ARTIFACT="${BINARY_NAME}-${PLATFORM}.tar.gz"
    CHECKSUM_FILE="CHECKSUMS.sha256"
    URL="https://github.com/${REPO}/releases/download/${TAG}/${ARTIFACT}"
    TMPDIR="$(mktemp -d)"
    trap 'rm -rf "$TMPDIR"' EXIT INT TERM

    info "Downloading ${BINARY_NAME} ${TAG} for ${PLATFORM}"
    curl -fsSL "$URL" -o "${TMPDIR}/${ARTIFACT}" \
        || err "Download failed. Check that ${TAG} includes ${ARTIFACT}."

    verify_checksum

    info "Extracting ${ARTIFACT}"
    tar xzf "${TMPDIR}/${ARTIFACT}" -C "$TMPDIR"

    if [ ! -f "${TMPDIR}/${BINARY_NAME}" ]; then
        err "Archive did not contain ${BINARY_NAME}"
    fi

    info "Installing to ${INSTALL_DIR}/${BINARY_NAME}"
    if [ -w "$INSTALL_DIR" ]; then
        mv "${TMPDIR}/${BINARY_NAME}" "${INSTALL_DIR}/${BINARY_NAME}"
        chmod +x "${INSTALL_DIR}/${BINARY_NAME}"
    else
        need_cmd sudo
        sudo mv "${TMPDIR}/${BINARY_NAME}" "${INSTALL_DIR}/${BINARY_NAME}"
        sudo chmod +x "${INSTALL_DIR}/${BINARY_NAME}"
    fi
}

main() {
    printf '\n\033[1m  EchoProfile WebUI Server Installer\033[0m\n\n'

    need_cmd curl
    need_cmd grep
    need_cmd sed
    need_cmd tar
    need_cmd uname

    detect_platform
    resolve_version
    install_binary

    ok "Installed ${BINARY_NAME} ${TAG} to ${INSTALL_DIR}/${BINARY_NAME}"
    printf '\n'
    info "Quick start:"
    printf '    %s --serve --host 127.0.0.1 --port 3727\n' "$BINARY_NAME"
    printf '\n'
    info "Server options:"
    printf '    --host <address>    Bind address (use 127.0.0.1 behind a reverse proxy)\n'
    printf '    --port <number>     Server port (default: 3727)\n'
    printf '    --token <value>     Require a fixed auth token\n'
    printf '    --no-auth           Disable authentication; not recommended on shared networks\n'
    printf '\n'
    info "systemd service template: https://github.com/${REPO}/blob/main/contrib/echo-profile.service"
    printf '\n'
}

main "$@"

#!/bin/sh
# install-agent.sh - install EchoProfile CLI and agent skills.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/3kyou1/EchoProfile/main/install-agent.sh | sh
#
# Environment variables:
#   INSTALL_DIR      CLI installation directory passed to install-cli.sh
#   VERSION          Specific version to install, with or without leading v (default: latest)
#   SKILLS_DEST      Destination skills directory
#                    (default: $CODEX_HOME/skills or ~/.codex/skills)

set -eu

REPO="3kyou1/EchoProfile"
CLI_INSTALLER_URL="https://raw.githubusercontent.com/${REPO}/main/install-cli.sh"
SKILL_NAMES="echo-profile-user-profile figure-pool-generator"
SKILLS_DEST="${SKILLS_DEST:-${CODEX_HOME:-${HOME}/.codex}/skills}"

info() { printf '  \033[1;34m->\033[0m %s\n' "$1"; }
ok() { printf '  \033[1;32mOK\033[0m %s\n' "$1"; }
err() { printf '  \033[1;31mERROR\033[0m %s\n' "$1" >&2; exit 1; }

need_cmd() {
    if ! command -v "$1" >/dev/null 2>&1; then
        err "Required command not found: $1"
    fi
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

install_cli() {
    info "Installing echo-profile CLI"
    curl -fsSL "$CLI_INSTALLER_URL" | VERSION="${VERSION:-}" INSTALL_DIR="${INSTALL_DIR:-}" sh
}

download_source_archive() {
    ARCHIVE_URL="https://github.com/${REPO}/archive/refs/tags/${TAG}.tar.gz"
    TMPDIR="$(mktemp -d)"
    trap 'rm -rf "$TMPDIR"' EXIT INT TERM

    info "Downloading EchoProfile skills from ${TAG}"
    curl -fsSL "$ARCHIVE_URL" -o "${TMPDIR}/source.tar.gz" \
        || err "Download failed. Check that ${TAG} exists."

    tar xzf "${TMPDIR}/source.tar.gz" -C "$TMPDIR"
    SOURCE_DIR="$(find "$TMPDIR" -mindepth 1 -maxdepth 1 -type d | head -1)"
    if [ -z "$SOURCE_DIR" ]; then
        err "Could not find extracted source directory."
    fi
}

copy_dir() {
    src="$1"
    dest="$2"

    rm -rf "$dest"
    mkdir -p "$(dirname "$dest")"
    cp -R "$src" "$dest"
}

install_skills() {
    mkdir -p "$SKILLS_DEST"

    for skill in $SKILL_NAMES; do
        src="${SOURCE_DIR}/skills/${skill}"
        dest="${SKILLS_DEST}/${skill}"
        if [ ! -f "${src}/SKILL.md" ]; then
            err "Archive does not contain skills/${skill}/SKILL.md"
        fi

        info "Installing skill ${skill} to ${dest}"
        copy_dir "$src" "$dest"
    done
}

main() {
    printf '\n\033[1m  EchoProfile Agent Installer\033[0m\n\n'

    need_cmd curl
    need_cmd grep
    need_cmd sed
    need_cmd tar
    need_cmd find
    need_cmd cp
    need_cmd rm

    resolve_version
    install_cli
    download_source_archive
    install_skills

    ok "Installed EchoProfile agent skills to ${SKILLS_DEST}"
    printf '\n'
    info "Verify CLI:"
    printf '    echo-profile version\n'
    printf '\n'
    info "Discover supported providers:"
    printf '    echo-profile list providers\n'
    printf '\n'
    info "Collect profile input across available providers:"
    printf '    echo-profile profile collect --scope project --current-project\n'
    printf '\n'
    info "Restart agents that load skills at startup so they can pick up the new skills."
    printf '\n'
}

main "$@"

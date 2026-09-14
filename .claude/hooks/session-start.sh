#!/bin/bash
# Installs/updates the gstack Claude Code toolkit (https://github.com/garrytan/gstack)
# into the user's global ~/.claude/skills so it's available in every session,
# without touching this project's own files.
set -euo pipefail

# Only relevant for Claude Code on the web (fresh container per session).
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

GSTACK_SRC="$HOME/.gstack-src"
GSTACK_REPO="https://github.com/garrytan/gstack.git"
MARKER="$GSTACK_SRC/.installed-commit"

# Chromium is already preinstalled in this environment for Playwright;
# skip gstack's own download to keep repeat setup runs fast.
export GSTACK_SKIP_PLAYWRIGHT=1

if [ ! -d "$GSTACK_SRC/.git" ]; then
  git clone --depth 1 "$GSTACK_REPO" "$GSTACK_SRC"
else
  git -C "$GSTACK_SRC" fetch --depth 1 origin
  git -C "$GSTACK_SRC" reset --hard origin/HEAD
fi

REMOTE_COMMIT="$(git -C "$GSTACK_SRC" rev-parse HEAD)"
INSTALLED_COMMIT="$(cat "$MARKER" 2>/dev/null || echo "")"

if [ "$REMOTE_COMMIT" = "$INSTALLED_COMMIT" ] && [ -d "$HOME/.claude/skills/gstack" ]; then
  echo "gstack already up to date (commit ${REMOTE_COMMIT:0:7}), skipping setup."
  exit 0
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "bun not found; cannot install gstack." >&2
  exit 0
fi

(cd "$GSTACK_SRC" && ./setup)

echo "$REMOTE_COMMIT" > "$MARKER"
echo "gstack installed (commit ${REMOTE_COMMIT:0:7})."

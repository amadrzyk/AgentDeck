#!/usr/bin/env bash
# Builds ~/Applications/OpenWarpSlack.app — a no-Terminal-window wrapper that the
# Stream Deck "System -> Open" action can launch.
#
# It runs open-warp-slack.sh via AppleScript's `do shell script`, so NO Terminal
# window appears and NO Accessibility permission is needed (it sends no keystrokes).
#
# Usage: bash scripts/streamdeck-open/build-app.sh
set -euo pipefail

SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_APP="$HOME/Applications/OpenWarpSlack.app"
TMP_SCPT="$(mktemp -t openwarpslack.XXXXXX).applescript"

# The .app calls the repo script by absolute path (resolved at runtime from $HOME).
cat > "$TMP_SCPT" <<'APPLESCRIPT'
do shell script "exec " & quoted form of (POSIX path of (path to home folder)) & "src/AgentDeck/scripts/streamdeck-open/open-warp-slack.sh"
APPLESCRIPT

mkdir -p "$HOME/Applications"
osacompile -o "$OUT_APP" "$TMP_SCPT"
rm -f "$TMP_SCPT"
echo "Built $OUT_APP"

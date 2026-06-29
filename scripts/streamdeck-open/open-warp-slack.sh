#!/usr/bin/env bash
# Opens a NEW Warp window already cd'd into ~/src/slack-github.com/slack.
#
# Uses Warp's launch-configuration + URI scheme instead of synthesized keystrokes,
# so there's no Accessibility permission and no timing guesswork. The window opens
# directly in the target directory.
#
# Stream Deck wiring: this is a bash script, so the "Open" action won't run it
# directly. Use one of:
#   - System -> Open  ->  point at this script IF you wrap it (see README), or
#   - Elgato "BarRaider Advanced Launcher" / a "System -> Run" style action that
#     executes a command:  bash ~/src/AgentDeck/scripts/streamdeck-open/open-warp-slack.sh
# See README.md for the exact recommended setup.
set -euo pipefail

TARGET_DIR="$HOME/src/slack-github.com/slack"
CONFIG_NAME="slack"
CONFIG_DIR="$HOME/.warp/launch_configurations"
CONFIG_FILE="$CONFIG_DIR/$CONFIG_NAME.yaml"

# Write/refresh the launch configuration (idempotent).
mkdir -p "$CONFIG_DIR"
cat > "$CONFIG_FILE" <<YAML
---
name: $CONFIG_NAME
windows:
  - tabs:
      - layout:
          cwd: $TARGET_DIR
YAML

# Open a new Warp window from that configuration.
open "warp://launch/$CONFIG_NAME"

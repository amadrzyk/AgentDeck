#!/usr/bin/env bash
# Rebuild the macOS AgentDeck app locally (ad-hoc signed) and install it to
# /Applications so it can be launched without Xcode. Re-run after code changes.
set -euo pipefail

APPLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APPLE_DIR"

xcodebuild -project AgentDeck.xcodeproj -scheme AgentDeck_macOS -configuration Debug \
  -derivedDataPath build \
  CODE_SIGN_IDENTITY="-" CODE_SIGNING_REQUIRED=NO CODE_SIGNING_ALLOWED=NO \
  build

APP="$APPLE_DIR/build/Build/Products/Debug/AgentDeck.app"
rm -rf /Applications/AgentDeck.app
cp -R "$APP" /Applications/
echo "Installed /Applications/AgentDeck.app"
echo "Launch it from Spotlight/Dock, or run: open /Applications/AgentDeck.app"

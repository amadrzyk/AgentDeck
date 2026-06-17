#!/usr/bin/env bash
# Package the AgentDeck Ulanzi Studio plugin into a self-contained, installable
# `.ulanziPlugin` folder. Ulanzi Studio launches the Node main service from the
# INSTALLED plugin dir (no access to our workspace node_modules), so we:
#   1. esbuild-bundle our TS + @agentdeck/shared + gifenc + vendored SDK → app.js
#      (ESM; @resvg/resvg-js and ws left external — native / optional-native).
#   2. ship a clean npm-layout node_modules with @resvg/resvg-js (+ platform
#      native) and ws, which Studio's node resolves at runtime.
#   3. assemble manifest + en.json + resources (icons + fonts) + plugin/app.js.
#
# Output: plugin-ulanzi/dist/com.ulanzi.ulanzistudio.agentdeck.ulanziPlugin/
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKG="$ROOT/plugin-ulanzi"
NAME="com.ulanzi.ulanzistudio.agentdeck.ulanziPlugin"
SRC_PLUGIN="$PKG/$NAME"
OUT="$PKG/dist/$NAME"

RESVG_VERSION="2.6.2"
WS_VERSION="^8.20.0"

echo "==> clean $OUT"
rm -rf "$PKG/dist"
mkdir -p "$OUT/plugin" "$OUT/resources"

echo "==> bundle main service (esbuild, ESM, external resvg+ws)"
npx --yes esbuild "$PKG/src/app.ts" \
  --bundle --platform=node --format=esm --target=node20 \
  --external:@resvg/resvg-js --external:ws \
  --outfile="$OUT/plugin/app.js" \
  --log-level=warning
# ESM marker so node treats app.js (and import.meta.url) as a module.
printf '{ "type": "module" }\n' > "$OUT/plugin/package.json"

echo "==> copy manifest + localization + resources"
cp "$SRC_PLUGIN/manifest.json" "$OUT/manifest.json"
cp "$SRC_PLUGIN/en.json" "$OUT/en.json" 2>/dev/null || true
cp -R "$SRC_PLUGIN/resources/." "$OUT/resources/"

echo "==> build runtime node_modules (resvg native + ws) via npm"
TMP="$(mktemp -d)"
cat > "$TMP/package.json" <<JSON
{ "name": "agentdeck-ulanzi-runtime", "private": true,
  "dependencies": { "@resvg/resvg-js": "$RESVG_VERSION", "ws": "$WS_VERSION" } }
JSON
( cd "$TMP" && npm install --omit=dev --no-audit --no-fund --silent )
mkdir -p "$OUT/node_modules"
cp -R "$TMP/node_modules/." "$OUT/node_modules/"
rm -rf "$TMP"

echo "==> verify"
node -e "const fs=require('fs');const p='$OUT';
  for (const f of ['manifest.json','plugin/app.js','plugin/package.json']) if(!fs.existsSync(p+'/'+f)) throw new Error('missing '+f);
  const nm=p+'/node_modules';
  if(!fs.existsSync(nm+'/@resvg/resvg-js')) throw new Error('missing resvg');
  if(!fs.existsSync(nm+'/ws')) throw new Error('missing ws');
  const native=require('child_process').execSync('find '+nm+' -name *.node').toString().trim();
  if(!native) throw new Error('missing resvg native .node');
  console.log('OK — bundle '+(fs.statSync(p+'/plugin/app.js').size/1024|0)+'KB, native: '+native.split('/').pop());
"
echo "==> packaged at: $OUT"

# Optional: install into Ulanzi Studio (macOS). `--install` or INSTALL=1.
STUDIO_PLUGINS="$HOME/Library/Application Support/Ulanzi/UlanziDeck/Plugins"
if [ "${1:-}" = "--install" ] || [ "${INSTALL:-}" = "1" ]; then
  if [ -d "$STUDIO_PLUGINS" ]; then
    echo "==> installing into Ulanzi Studio: $STUDIO_PLUGINS"
    rm -rf "$STUDIO_PLUGINS/$NAME"
    cp -R "$OUT" "$STUDIO_PLUGINS/$NAME"
    echo "    Installed. Restart Ulanzi Studio to load the AgentDeck plugin."
  else
    echo "!! Ulanzi Studio plugins dir not found: $STUDIO_PLUGINS"
    echo "   Install Ulanzi Studio and launch it once, then re-run with --install."
  fi
else
  echo "    Install (after Ulanzi Studio is installed + launched once):"
  echo "      cp -R \"$OUT\" \"$STUDIO_PLUGINS/\"   # then restart Ulanzi Studio"
fi

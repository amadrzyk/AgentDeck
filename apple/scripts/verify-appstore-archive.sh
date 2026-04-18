#!/bin/bash
# verify-appstore-archive.sh — Fail-fast check that a built AgentDeck.app
# meets the App Store submission invariants set by the AGENTDECK_APP_STORE
# compile flag. Called from the CI apple-release workflow after `xcodebuild
# archive` completes, and runnable locally against any built .app.
#
# Invariants (per Apple Guideline 2.5.2 and our own APP_REVIEW_NOTES.md):
#   1. No bundled Node.js, bridge CLI, adb binary, or D200H shell helper.
#   2. No embedded executable other than the main AgentDeck Mach-O.
#   3. Shipped Info.plist must not contain `LSRequiresIPhoneOS`.
#   4. Shipped entitlements must not contain the home-relative-path
#      temporary exception.
#   5. No embedded subprocess path string (`/usr/bin/env`, `/bin/sh`,
#      `/usr/bin/security`, `/usr/bin/sqlite3`) in the main binary.
#
# Usage:
#   ./verify-appstore-archive.sh /path/to/AgentDeck.app
#
# Exits 0 on success, non-zero on the first failing invariant.

set -euo pipefail

APP="${1:-}"
if [ -z "$APP" ]; then
    echo "Usage: $0 <AgentDeck.app path>" >&2
    exit 2
fi
if [ ! -d "$APP" ]; then
    echo "error: $APP does not exist or is not a directory" >&2
    exit 2
fi

FAIL=0
fail() {
    FAIL=1
    echo "FAIL: $*" >&2
}

# (1) Forbidden bundled asset paths.
for path in \
    "Contents/Helpers/adb" \
    "Contents/Helpers/node" \
    "Contents/Helpers/agentdeck-d200h-helper" \
    "Contents/Resources/node" \
    "Contents/Resources/agentdeck-runtime" \
    "Contents/Resources/bridge/cli.js" \
    "Contents/Resources/bridge/dist/cli.js"; do
    if [ -e "$APP/$path" ]; then
        fail "bundled asset present: $path"
    fi
done

# (2) No executable files outside the main AgentDeck Mach-O in Contents/MacOS.
# `find -perm` flags differ between BSD (macOS) and GNU; use the BSD form.
EXEC_FILES=$(find "$APP/Contents" -type f -perm +111 2>/dev/null || true)
MAIN_EXEC="$APP/Contents/MacOS/AgentDeck"
while IFS= read -r f; do
    [ -z "$f" ] && continue
    [ "$f" = "$MAIN_EXEC" ] && continue
    # Asset catalogs and plist files can be marked +x on some toolchains;
    # we only flag honest Mach-O / scripts.
    case "$f" in
        *.plist|*.strings|*.car|*.nib|*.icns|*.png|*.jpg|*.ttf|*.otf) continue ;;
    esac
    # Detect Mach-O or shebang scripts. LC_ALL=C silences the
    # "illegal byte sequence" complaint that BSD grep emits when scanning
    # raw Mach-O magic bytes on UTF-8 locales.
    head -c 4 "$f" 2>/dev/null | LC_ALL=C grep -qE $'^(#!|\xcf\xfa\xed\xfe|\xce\xfa\xed\xfe)' \
        && fail "extra executable embedded: ${f#$APP/}"
done <<< "$EXEC_FILES"

# (3) Info.plist must not declare LSRequiresIPhoneOS.
INFO="$APP/Contents/Info.plist"
if [ -f "$INFO" ]; then
    if /usr/libexec/PlistBuddy -c "Print :LSRequiresIPhoneOS" "$INFO" 2>/dev/null; then
        fail "Info.plist contains LSRequiresIPhoneOS (iOS-only key leaked to macOS archive)"
    fi
fi

# (4) Shipped entitlements must not have home-relative-path exception. The
# signed entitlements live in the code signature, not as a file in the
# bundle — extract via `codesign -d --entitlements :-`.
if command -v codesign >/dev/null 2>&1; then
    ENT=$(codesign -d --entitlements :- "$APP" 2>/dev/null || true)
    if echo "$ENT" | grep -q "home-relative-path"; then
        fail "signed entitlements still contain home-relative-path exception"
    fi
fi

# (5) Binary string scan — compile-out guards should have removed all
# references to system interpreters in the AgentDeck Mach-O. We tolerate
# system framework references (which contain these paths internally) by
# filtering to lines that start with the path.
if [ -f "$MAIN_EXEC" ]; then
    LEAK=$(strings "$MAIN_EXEC" 2>/dev/null | grep -E '^/usr/bin/env$|^/bin/sh$|^/usr/bin/security$|^/usr/bin/sqlite3$' || true)
    if [ -n "$LEAK" ]; then
        fail "main binary references subprocess paths: $LEAK"
    fi
fi

if [ "$FAIL" -ne 0 ]; then
    echo ""
    echo "✗ App Store archive verification FAILED. See errors above." >&2
    exit 1
fi

echo "✓ $APP passes App Store archive verification"

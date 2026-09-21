#!/bin/zsh
# Unlocks the local self-signed "Kliq Dev" code-signing identity used for
# development builds. Run this if `npm run build:mac` fails with
# `errSecInternalComponent` (the keychain locked after sleep / timeout).
#
# The password is intentionally NOT stored in this repository. Set it in the
# environment (KLQ_KEYCHAIN_PASSWORD=...) or type it when prompted.
set -e

KEYCHAIN="$HOME/Library/Keychains/kliq-dev.keychain-db"
IDENTITY="Kliq Dev"

if [ ! -f "$KEYCHAIN" ]; then
	echo "No local signing keychain at $KEYCHAIN - see docs/TROUBLESHOOTING.md" >&2
	exit 1
fi

if [ -n "$KLQ_KEYCHAIN_PASSWORD" ]; then
	security unlock-keychain -p "$KLQ_KEYCHAIN_PASSWORD" "$KEYCHAIN"
else
	echo "Unlocking $KEYCHAIN (enter its password when prompted)..."
	security unlock-keychain "$KEYCHAIN"
fi

# Keep it usable across builds: no lock-on-sleep, 24h idle timeout.
security set-keychain-settings -t 86400 "$KEYCHAIN"
security list-keychain -d user -s "$HOME/Library/Keychains/login.keychain-db" "$KEYCHAIN" >/dev/null

if security find-identity -v -p codesigning | grep -q "$IDENTITY"; then
	echo "OK: '$IDENTITY' signing identity is available."
else
	echo "FAILED: '$IDENTITY' identity not found. See docs/TROUBLESHOOTING.md" >&2
	exit 1
fi

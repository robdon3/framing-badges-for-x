#!/bin/bash
# Remove the tone host binary and the Chrome native-messaging manifest.
set -euo pipefail

NAME="com.xframingbadges.tone"
SUPPORT="${HOME}/Library/Application Support/XFramingBadges"
BIN="${SUPPORT}/tone-host"
DEST="${HOME}/Library/Application Support/Google/Chrome/NativeMessagingHosts/${NAME}.json"

rm -f "$BIN" "$DEST"
rmdir "$SUPPORT" 2>/dev/null || true

echo "Removed ${BIN}"
echo "Removed ${DEST}"
echo "Turn Tone check off in the extension, or reload it, so it stops connecting."

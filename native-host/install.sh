#!/bin/bash
# Build the on-device tone host and register it with Google Chrome.
# macOS only. Needs the Xcode command-line tools (xcrun swiftc), not the Xcode app.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$ROOT/.." && pwd)"
SRC="$ROOT/ToneHost.swift"
NAME="com.xframingbadges.tone"
EXPECTED_ID="eadkmedlbenoalongikmdhedfinggpoh"
SUPPORT="${HOME}/Library/Application Support/XFramingBadges"
BIN="${SUPPORT}/tone-host"
DEST_DIR="${HOME}/Library/Application Support/Google/Chrome/NativeMessagingHosts"
DEST="${DEST_DIR}/${NAME}.json"
MANIFEST="${REPO}/extension/manifest.json"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "tone-host installs on macOS only. Apple's Foundation Models framework is not on this machine." >&2
  exit 1
fi

if [[ ! -f "$MANIFEST" ]]; then
  echo "Could not find the extension manifest at ${MANIFEST}." >&2
  exit 1
fi

KEY="$(perl -MJSON::PP -e 'local $/; my $j = decode_json(<>); print $j->{key} // ""' "$MANIFEST")"
if [[ -z "$KEY" ]]; then
  echo "extension/manifest.json has no key, so the extension ID would not stay stable." >&2
  exit 1
fi

ID="$(perl -MMIME::Base64=decode_base64 -MDigest::SHA=sha256 -e '
  my $der = decode_base64(shift);
  my $hex = substr(unpack("H*", sha256($der)), 0, 32);
  my $id = "";
  $id .= chr(ord("a") + hex($_)) for split //, $hex;
  print $id;
' "$KEY")"

if [[ "$ID" != "$EXPECTED_ID" ]]; then
  echo "Extension ID mismatch. The manifest key produced ${ID}, expected ${EXPECTED_ID}." >&2
  exit 1
fi

mkdir -p "$SUPPORT" "$DEST_DIR"

echo "Compiling tone-host…"
echo "xcrun --sdk macosx swiftc -parse-as-library -O -o tone-host ToneHost.swift"
if ! xcrun --sdk macosx swiftc -parse-as-library -O -o "$BIN" "$SRC"; then
  echo "Retrying with an explicit FoundationModels link…" >&2
  xcrun --sdk macosx swiftc -parse-as-library -O -framework FoundationModels -o "$BIN" "$SRC"
fi
chmod 755 "$BIN"

perl -MJSON::PP -e '
  my ($path, $name, $origin, $dest) = @ARGV;
  my $json = JSON::PP->new->ascii->pretty->canonical->encode({
    name => $name,
    description => "On-device tone labels for Framing Badges for X. Post text is not written to disk.",
    path => $path,
    type => "stdio",
    allowed_origins => [$origin],
  });
  open my $out, ">", $dest or die $!;
  print $out $json;
' "$BIN" "$NAME" "chrome-extension://${ID}/" "$DEST"

echo "Extension ID: ${ID}"
echo "Allowed origin: chrome-extension://${ID}/"
echo "Binary: ${BIN}"
echo "Host manifest: ${DEST}"
echo "Reload the extension on chrome://extensions, then turn on Tone check."

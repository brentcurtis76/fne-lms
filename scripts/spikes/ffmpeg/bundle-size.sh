#!/usr/bin/env bash
#
# Z0B ffmpeg spike — step 4: how big would shipping ffmpeg actually be?
#
# Measures WITHOUT installing anything. `ffmpeg-static` is deliberately NOT
# added to package.json in this phase (Z0B adds zero dependencies); this script
# reads registry metadata and the published release asset headers instead, so
# the number is real without the dependency landing.
#
# Usage: ./bundle-size.sh
set -euo pipefail

PKG=ffmpeg-static

echo "## npm registry metadata — $PKG"
VERSION=$(npm view "$PKG" version 2>/dev/null)
TARBALL_BYTES=$(npm view "$PKG" dist.unpackedSize 2>/dev/null || echo 0)
echo "latest version:            $VERSION"
echo "npm tarball unpacked:      $(python3 -c "print(f'{$TARBALL_BYTES/1_000_000:.2f} MB')")"
echo "  (the tarball is only the installer — the binary is fetched in postinstall,"
echo "   so this number is NOT what lands in a deployment bundle)"
echo

echo "## published binary assets (release metadata — nothing downloaded)"
# The release tag tracks the bundled ffmpeg version (e.g. b6.1.1), NOT the npm
# package version, so it has to be resolved rather than guessed.
curl -s "https://api.github.com/repos/eugeneware/ffmpeg-static/releases/latest" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print('release tag:              ', data.get('tag_name'))
print()
print(f\"{'asset':<28} {'size':>10}\")
for asset in data.get('assets', []):
    if asset['name'].startswith('ffmpeg-') and not asset['name'].endswith('.sha256'):
        print(f\"{asset['name']:<28} {asset['size']/1_000_000:>7.1f} MB\")
"
echo
echo "linux-x64 is the one that matters: that is the Vercel Function runtime target."
echo

echo "## local reference"
LOCAL=$(command -v ffmpeg || true)
if [ -n "$LOCAL" ]; then
  LOCAL_REAL=$(readlink -f "$LOCAL" 2>/dev/null || python3 -c "import os,sys; print(os.path.realpath(sys.argv[1]))" "$LOCAL")
  LOCAL_BYTES=$(stat -f%z "$LOCAL_REAL" 2>/dev/null || stat -c%s "$LOCAL_REAL")
  echo "system ffmpeg:             $(python3 -c "print(f'{$LOCAL_BYTES/1_000_000:.1f} MB')") ($LOCAL_REAL)"
  echo "  (Homebrew builds link most codecs dynamically, so this understates a"
  echo "   self-contained static build — use the release-asset figure above.)"
fi

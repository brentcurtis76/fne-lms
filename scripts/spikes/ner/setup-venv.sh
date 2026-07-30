#!/usr/bin/env bash
#
# Reproduces the local environment used for the Z0B NER measurements.
#
# Deliberately a throwaway venv outside the repo: phase Z0B adds zero
# dependencies to the project, and nothing here is installed by `npm install`.
#
# Usage: ./setup-venv.sh [VENV_DIR]
set -euo pipefail

VENV_DIR="${1:-${TMPDIR:-/tmp}/zoom-ner-venv}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 3.12 is Vercel's default Python runtime (docs verified 2026-07-29), so the
# local measurement runs on the same major version the function would.
PYTHON="${PYTHON:-python3.12}"
command -v "$PYTHON" >/dev/null || {
  echo "$PYTHON not found. Install it, or set PYTHON=<interpreter>." >&2
  exit 1
}

echo "==> Creating venv at $VENV_DIR ($($PYTHON --version))"
"$PYTHON" -m venv "$VENV_DIR"
"$VENV_DIR/bin/pip" install --quiet --upgrade pip

echo "==> Installing $HERE/requirements.txt"
"$VENV_DIR/bin/pip" install --quiet -r "$HERE/requirements.txt"

echo "==> Installed:"
"$VENV_DIR/bin/pip" list --format=columns | grep -Ei "spacy|es-core-news|click|numpy|thinc"

echo
echo "Next:"
echo "  npx tsx scripts/spikes/ner/measure-node.ts > /tmp/node-results.json"
echo "  $VENV_DIR/bin/python scripts/spikes/ner/measure_ner.py /tmp/node-results.json"

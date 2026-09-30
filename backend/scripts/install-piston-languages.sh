#!/usr/bin/env sh
# One-time setup for the local Piston sandbox: installs the language runtimes
# the code runner supports. Packages live in the piston-packages volume, so
# this only needs re-running if that volume is deleted.
#
# Usage (with Piston running — docker compose --profile local up -d piston):
#   sh backend/scripts/install-piston-languages.sh

PISTON_URL="${PISTON_URL:-http://localhost:2000}"

for pkg in "node 20.11.1" "python 3.12.0" "gcc 10.2.0" "java 15.0.2"; do
  set -- $pkg
  echo "Installing $1 $2..."
  curl -sf -X POST "$PISTON_URL/api/v2/packages" \
    -H "Content-Type: application/json" \
    -d "{\"language\":\"$1\",\"version\":\"$2\"}" || echo "  failed (already installed?)"
  echo
done

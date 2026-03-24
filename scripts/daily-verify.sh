#!/bin/bash
set -euo pipefail

# Lock file — prevent concurrent runs
LOCKFILE="/tmp/ksa-verify.lock"
if [ -f "$LOCKFILE" ]; then
    PID=$(cat "$LOCKFILE")
    if kill -0 "$PID" 2>/dev/null; then
        echo "Another run is active (PID $PID). Exiting."
        exit 0
    fi
    rm -f "$LOCKFILE"
fi
echo $$ > "$LOCKFILE"
trap 'rm -f "$LOCKFILE"' EXIT INT TERM

# Source credentials from dedicated env file
source ~/.config/ksa-verify/env

# Run orchestrator
cd /Users/mikes/ksa-data
npx tsx scripts/daily-verify.ts "$@"

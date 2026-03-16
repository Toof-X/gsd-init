#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PROJECT_NAME="$(basename "$PROJECT_DIR")"

export GSD_OBSERVER_SESSION="gsd-observer-${PROJECT_NAME}"
export GSD_WORKER_SESSION="gsd-worker-${PROJECT_NAME}"

"$SCRIPT_DIR/start-observer.sh"
"$SCRIPT_DIR/start-worker.sh" "$PROJECT_DIR"

# Open Terminal windows attached to each session
osascript <<EOF 2>/dev/null || true
tell application "Terminal"
  do script "tmux attach -t ${GSD_OBSERVER_SESSION}"
  do script "tmux attach -t ${GSD_WORKER_SESSION}"
  activate
end tell
EOF

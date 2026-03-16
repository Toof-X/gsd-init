#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="${1:-$(pwd)}"
SESSION="${GSD_WORKER_SESSION:-gsd-worker}"
if [ ! -d "$PROJECT_DIR" ]; then
  echo "ERROR: project directory not found: $PROJECT_DIR" >&2
  exit 1
fi
echo "[gsd-worker] Cleaning up stale temp files..."
rm -f /tmp/gsd-event-*.json /tmp/gsd-response-*.json /tmp/gsd-last-event-phase
tmux kill-session -t "$SESSION" 2>/dev/null || true
tmux new-session -d -s "$SESSION"
tmux send-keys -t "${SESSION}:0.0" "cd \"$PROJECT_DIR\" && GSD_OBSERVER_ENABLED=1 claude" Enter
echo "[gsd-worker] Worker ready in session: $SESSION"
echo "[gsd-worker] Project: $PROJECT_DIR"
echo ""
echo "Next steps:"
echo "  1. Attach to worker:   tmux attach -t $SESSION"
echo "  2. Attach to observer: tmux attach -t ${GSD_OBSERVER_SESSION:-gsd-observer}"
echo "  3. Begin GSD workflow in the worker session"

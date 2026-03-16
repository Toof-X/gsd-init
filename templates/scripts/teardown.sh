#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PROJECT_NAME="$(basename "$PROJECT_DIR")"

WORKER_SESSION="${GSD_WORKER_SESSION:-gsd-worker-${PROJECT_NAME}}"
OBSERVER_SESSION="${GSD_OBSERVER_SESSION:-gsd-observer-${PROJECT_NAME}}"

echo "[gsd] Closing Terminal windows..."
osascript <<EOF 2>/dev/null || true
tell application "Terminal"
  set wins to every window
  repeat with w in wins
    try
      set cmd to custom title of w
    on error
      set cmd to ""
    end try
    if cmd contains "$WORKER_SESSION" or cmd contains "$OBSERVER_SESSION" then
      close w
    end if
  end repeat
end tell
EOF

# Also close by matching the tmux attach command in the tab
osascript <<EOF 2>/dev/null || true
tell application "Terminal"
  set wins to every window
  repeat with w in wins
    repeat with t in every tab of w
      set p to processes of t
      repeat with proc in p
        if proc contains "$WORKER_SESSION" or proc contains "$OBSERVER_SESSION" then
          close w
          exit repeat
        end if
      end repeat
    end repeat
  end repeat
end tell
EOF

echo "[gsd] Tearing down sessions..."
tmux kill-session -t "$WORKER_SESSION" 2>/dev/null && echo "  Killed: $WORKER_SESSION" || echo "  Not running: $WORKER_SESSION"
tmux kill-session -t "$OBSERVER_SESSION" 2>/dev/null && echo "  Killed: $OBSERVER_SESSION" || echo "  Not running: $OBSERVER_SESSION"

echo "[gsd] Cleaning up temp files..."
rm -f /tmp/gsd-event-*.json /tmp/gsd-response-*.json /tmp/gsd-last-event-phase

echo "  Done."

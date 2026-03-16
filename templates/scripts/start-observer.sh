#!/usr/bin/env bash
set -euo pipefail
SESSION="${GSD_OBSERVER_SESSION:-gsd-observer}"
SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

tmux kill-session -t "$SESSION" 2>/dev/null || true
tmux new-session -d -s "$SESSION"

# Pane 0.0 — Observer Claude
tmux send-keys -t "${SESSION}:0.0" "claude --allowedTools 'Bash,Read,Write,Glob,Grep'" Enter

# Pane 0.1 — Listener daemon (split horizontally, small strip at bottom)
tmux split-window -t "${SESSION}:0" -v -l 6
tmux send-keys -t "${SESSION}:0.1" "GSD_OBSERVER_SESSION=${SESSION} \"${SCRIPTS_DIR}/listen.sh\"" Enter

# Focus Claude pane
tmux select-pane -t "${SESSION}:0.0"

echo "[gsd-observer] Waiting for Observer Claude to start..."
for i in $(seq 1 30); do
  pane=$(tmux capture-pane -pt "${SESSION}:0.0" 2>/dev/null || echo "")
  if echo "$pane" | grep -qE '❯|>|\$|✓|claude>'; then
    echo "[gsd-observer] Observer ready in session: $SESSION"
    exit 0
  fi
  sleep 1
done
echo "[gsd-observer] WARNING: Observer may not be ready — prompt not detected after 30s"
echo "[gsd-observer] Check: tmux attach -t $SESSION"

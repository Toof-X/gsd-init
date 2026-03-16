#!/usr/bin/env bash
set -euo pipefail
SESSION="${GSD_OBSERVER_SESSION:-gsd-observer}"
tmux kill-session -t "$SESSION" 2>/dev/null || true
tmux new-session -d -s "$SESSION"
tmux send-keys -t "${SESSION}:0.0" "claude --allowedTools 'Bash,Read,Write,Glob,Grep'" Enter
echo "[gsd-observer] Waiting for Observer Claude to start..."
for i in $(seq 1 30); do
  pane=$(tmux capture-pane -pt "${SESSION}:0.0" -l 5 2>/dev/null || echo "")
  if echo "$pane" | grep -qE '❯|>|\$|✓|claude>'; then
    echo "[gsd-observer] Observer ready in session: $SESSION"
    exit 0
  fi
  sleep 1
done
echo "[gsd-observer] WARNING: Observer may not be ready — prompt not detected after 30s"
echo "[gsd-observer] Check: tmux attach -t $SESSION"

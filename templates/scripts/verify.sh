#!/usr/bin/env bash
WORKER_SESSION="${GSD_WORKER_SESSION:-gsd-worker}"
OBSERVER_SESSION="${GSD_OBSERVER_SESSION:-gsd-observer}"
PASS=0; FAIL=0

check() {
  local desc="$1"; shift
  if "$@" &>/dev/null; then
    echo "  OK: $desc"; PASS=$((PASS+1))
  else
    echo "  MISSING: $desc"; FAIL=$((FAIL+1))
  fi
}

echo "=== GSD Observer System Check ==="
echo ""
echo "--- Prerequisites ---"
check "jq installed" command -v jq
check "tmux installed" command -v tmux
check "claude CLI installed" command -v claude

echo ""
echo "--- Scripts ---"
check "gsd-stop-hook.sh executable" test -x "$HOME/.claude/gsd-observer/hooks/gsd-stop-hook.sh"
check "wake-observer.sh executable" test -x "$HOME/.claude/gsd-observer/scripts/wake-observer.sh"
check "notify-worker.sh executable" test -x "$HOME/.claude/gsd-observer/scripts/notify-worker.sh"
check "start-observer.sh executable" test -x "$HOME/.claude/gsd-observer/scripts/start-observer.sh"
check "start-worker.sh executable" test -x "$HOME/.claude/gsd-observer/scripts/start-worker.sh"

echo ""
echo "--- Sessions ---"
check "gsd-observer tmux session running" tmux has-session -t "$OBSERVER_SESSION"
check "gsd-worker tmux session running" tmux has-session -t "$WORKER_SESSION"

if tmux has-session -t "$OBSERVER_SESSION" 2>/dev/null; then
  pane_content=$(tmux capture-pane -pt "${OBSERVER_SESSION}:0.0" -l 5 2>/dev/null || echo "")
  if echo "$pane_content" | grep -qE '❯|>|\$|✓|claude>'; then
    echo "  OK: Observer Claude at prompt"; PASS=$((PASS+1))
  else
    echo "  MISSING: Observer Claude not at prompt (may still be starting)"; FAIL=$((FAIL+1))
  fi
fi

echo ""
echo "--- Project hook (run from project dir) ---"
if [ -f ".claude/settings.json" ]; then
  hook_registered=$(python3 -c "
import sys, json
with open('.claude/settings.json') as f:
    s = json.load(f)
hooks = s.get('hooks', {}).get('Stop', [])
print('yes' if hooks else 'no')
" 2>/dev/null || echo "no")
  check "Stop hook registered in .claude/settings.json" [ "$hook_registered" = "yes" ]
else
  echo "  MISSING: .claude/settings.json (copy from ~/.claude/gsd-observer/templates/settings.json)"
  FAIL=$((FAIL+1))
fi

echo ""
echo "Results: ${PASS} OK, ${FAIL} missing"
[ "$FAIL" -eq 0 ]

#!/usr/bin/env bash
WORKER_SESSION="${GSD_WORKER_SESSION:-gsd-worker}"
OBSERVER_SESSION="${GSD_OBSERVER_SESSION:-gsd-observer}"
echo "[gsd-observer] Tearing down sessions..."
tmux kill-session -t "$WORKER_SESSION" 2>/dev/null && echo "  Killed: $WORKER_SESSION" || echo "  Not running: $WORKER_SESSION"
tmux kill-session -t "$OBSERVER_SESSION" 2>/dev/null && echo "  Killed: $OBSERVER_SESSION" || echo "  Not running: $OBSERVER_SESSION"
echo "[gsd-observer] Cleaning up temp files..."
rm -f /tmp/gsd-event-*.json /tmp/gsd-response-*.json /tmp/gsd-last-event-phase
echo "  Done."

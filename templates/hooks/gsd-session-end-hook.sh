#!/usr/bin/env bash
# GSD Session End Hook — fires when Worker Claude session terminates.
# Sends a session_end event to the Observer so it can do a final review.
# Does NOT block — session is ending, fire-and-forget only.
#
# Environment variables (all optional, have defaults):
#   GSD_OBSERVER_ENABLED     — set to 1 to activate (default: off)
#   GSD_OBSERVER_SESSION     — tmux session name for Observer (default: gsd-observer)
#   GSD_OBSERVER_PANE        — pane id for Observer (default: 0.0)
#   GSD_PROJECT_DIR          — project directory (default: pwd)
#   GSD_WORKER_SESSION       — worker tmux session (default: gsd-worker)
#   GSD_WORKER_PANE          — worker pane id (default: 0.0)

set -euo pipefail
SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../scripts"

OBSERVER_ENABLED="${GSD_OBSERVER_ENABLED:-}"
OBSERVER_SESSION="${GSD_OBSERVER_SESSION:-gsd-observer}"
OBSERVER_PANE="${GSD_OBSERVER_PANE:-0.0}"
PROJECT_DIR="${GSD_PROJECT_DIR:-$(pwd)}"
WORKER_SESSION="${GSD_WORKER_SESSION:-gsd-worker}"
WORKER_PANE="${GSD_WORKER_PANE:-0.0}"

# --- Guard: disabled ---
if [ -z "$OBSERVER_ENABLED" ]; then
  exit 0
fi

log() { echo "[gsd-session-end] $*" >&2; }

# --- Generate event_id ---
event_id=$(uuidgen 2>/dev/null || date +%s%N | md5sum | cut -c1-8)

# --- Write session_end event JSON ---
event_file="/tmp/gsd-event-${event_id}.json"
timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

cat > "${event_file}.tmp" <<EOF
{
  "event_id": "${event_id}",
  "event_type": "session_end",
  "gsd_phase": "session_end",
  "observer_mode": "audit",
  "context_summary": "Worker Claude session ended — final review opportunity",
  "artifacts": {
    "plan": null,
    "research": null,
    "changed_files": [],
    "test_results": null
  },
  "worker_session": "${WORKER_SESSION}",
  "worker_pane": "${WORKER_SESSION}:${WORKER_PANE}",
  "project_dir": "${PROJECT_DIR}",
  "timestamp": "${timestamp}"
}
EOF
mv "${event_file}.tmp" "$event_file"
log "Session-end event written: $event_file"

# --- Wake Observer (fire-and-forget, no polling) ---
"$SCRIPTS_DIR/wake-observer.sh" "$event_id" "$OBSERVER_SESSION" "$OBSERVER_PANE" || \
  log "WARNING: wake-observer.sh failed — Observer not notified of session end"

exit 0

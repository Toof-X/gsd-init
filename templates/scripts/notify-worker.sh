#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: notify-worker.sh <event_id>" >&2
  exit 1
fi

event_id="$1"
response_file="/tmp/gsd-response-${event_id}.json"
event_file="/tmp/gsd-event-${event_id}.json"

# Verify response file exists
if [ ! -f "$response_file" ]; then
  echo "[notify-worker] ERROR: response file missing: $response_file" >&2
  exit 1
fi

# Read worker_pane from event file (not response file)
if [ ! -f "$event_file" ]; then
  echo "[notify-worker] ERROR: event file missing: $event_file" >&2
  exit 1
fi

worker_pane=$(jq -r '.worker_pane // empty' "$event_file" 2>/dev/null)
if [ -z "$worker_pane" ]; then
  echo "[notify-worker] ERROR: worker_pane not found in event file" >&2
  exit 1
fi

# Parse response fields
decision=$(jq -r '.decision' "$response_file")
message=$(jq -r '.message' "$response_file")
revision=$(jq -r '.revision_instructions // ""' "$response_file")

# Build injection message
injection="[GSD Observer] Decision: ${decision}. ${message}"
if [ -n "$revision" ] && [ "$revision" != "null" ]; then
  injection="${injection} Instructions: ${revision}"
fi

# Inject into Worker pane
# Worker Claude is blocked by the Stop hook polling loop.
# This text queues in the terminal buffer and appears when the hook exits.
tmux send-keys -t "$worker_pane" "$injection" Enter

echo "[notify-worker] Response injected into Worker pane (${worker_pane})" >&2

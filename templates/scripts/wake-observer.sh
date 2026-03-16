#!/usr/bin/env bash
set -euo pipefail
SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ $# -lt 3 ]; then
  echo "Usage: wake-observer.sh <event_id> <observer_session> <observer_pane>" >&2
  exit 1
fi

event_id="$1"
observer_session="$2"
observer_pane="$3"
full_target="${observer_session}:${observer_pane}"
event_path="/tmp/gsd-event-${event_id}.json"

# Verify event file exists before waking Observer
if [ ! -f "$event_path" ]; then
  echo "[wake-observer] ERROR: event file not found: $event_path" >&2
  exit 1
fi

# Wait up to 15s for Observer pane to be at prompt
echo "[wake-observer] Waiting for Observer pane to be ready..." >&2
ready=0
for i in $(seq 1 15); do
  pane_content=$(tmux capture-pane -pt "$full_target" 2>/dev/null || echo "")
  if echo "$pane_content" | grep -qE '❯|>|\$|✓|claude'; then
    ready=1
    break
  fi
  sleep 1
done

if [ "$ready" -eq 0 ]; then
  echo "[wake-observer] WARNING: Observer pane not at prompt after 15s — injecting anyway" >&2
fi

# Inject task into Observer pane
# Quote the notify script path to handle spaces in SCRIPTS_DIR
notify_cmd="'${SCRIPTS_DIR}/notify-worker.sh'"
tmux send-keys -t "$full_target" \
  "Read ${event_path} and respond as GSD Observer. Write response to /tmp/gsd-response-${event_id}.json then run ${notify_cmd} ${event_id}" \
  Enter

echo "[wake-observer] Observer woken for event ${event_id}" >&2

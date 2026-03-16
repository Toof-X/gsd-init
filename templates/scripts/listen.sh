#!/usr/bin/env bash
# GSD Listener — runs in observer session, polls for new events and wakes Observer Claude.
OBSERVER_SESSION="${GSD_OBSERVER_SESSION:-gsd-observer}"
OBSERVER_PANE="${GSD_OBSERVER_PANE:-0.0}"
SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
POLL_INTERVAL=2

log() { echo "[gsd-listener] $*"; }

log "Listening for GSD events... (session: ${OBSERVER_SESSION}, pane: ${OBSERVER_PANE})"

declare -A seen

while true; do
  for event_file in /tmp/gsd-event-*.json; do
    [ -f "$event_file" ] || continue
    event_id="${event_file#/tmp/gsd-event-}"
    event_id="${event_id%.json}"

    # Skip already seen or already responded
    [ -n "${seen[$event_id]+_}" ] && continue
    if [ -f "/tmp/gsd-response-${event_id}.json" ]; then
      seen[$event_id]=1
      continue
    fi

    log "New event: $event_id — waking Observer Claude"
    seen[$event_id]=1
    "$SCRIPTS_DIR/wake-observer.sh" "$event_id" "$OBSERVER_SESSION" "$OBSERVER_PANE" || \
      log "WARNING: wake-observer.sh failed for $event_id"
  done

  sleep "$POLL_INTERVAL"
done

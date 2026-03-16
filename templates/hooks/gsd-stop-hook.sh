#!/usr/bin/env bash
# GSD Stop Hook — fires after each Claude response in Worker session.
# Detects GSD phase completion by checking recently-modified artifact files.
# Blocks in a polling loop until Observer responds, then exits.
#
# Environment variables (all optional, have defaults):
#   GSD_OBSERVER_ENABLED        — set to 1 to activate (default: off)
#   GSD_OBSERVER_SESSION        — tmux session name for Observer (default: gsd-observer)
#   GSD_OBSERVER_PANE           — pane id for Observer (default: 0.0)
#   GSD_ARTIFACT_WINDOW_SECS    — seconds window for artifact detection (default: 30)
#   GSD_PROJECT_DIR             — project directory to scan (default: pwd)
#   GSD_SENTINEL_FILE           — dedup sentinel file path (default: /tmp/gsd-last-event-phase)
#   GSD_WORKER_SESSION          — worker tmux session (default: gsd-worker)
#   GSD_WORKER_PANE             — worker pane id (default: 0.0)
#   GSD_DRY_RUN                 — if set, skip tmux calls and write phase= to stderr

set -euo pipefail

# --- Configuration ---
OBSERVER_ENABLED="${GSD_OBSERVER_ENABLED:-}"
OBSERVER_SESSION="${GSD_OBSERVER_SESSION:-gsd-observer}"
OBSERVER_PANE="${GSD_OBSERVER_PANE:-0.0}"
WINDOW_SECS="${GSD_ARTIFACT_WINDOW_SECS:-30}"
PROJECT_DIR="${GSD_PROJECT_DIR:-$(pwd)}"
SENTINEL_FILE="${GSD_SENTINEL_FILE:-/tmp/gsd-last-event-phase}"
WORKER_SESSION="${GSD_WORKER_SESSION:-gsd-worker}"
WORKER_PANE="${GSD_WORKER_PANE:-0.0}"
DRY_RUN="${GSD_DRY_RUN:-}"
POLL_TIMEOUT=120
HOLD_MAX=3
SCRIPTS_DIR="$(dirname "$0")/../scripts"

# --- Guard: disabled ---
if [ -z "$OBSERVER_ENABLED" ]; then
  exit 0
fi

log() { echo "[gsd-hook] $*" >&2; }

# --- Phase detection ---
detect_phase() {
  local window="$WINDOW_SECS"
  local proj="$PROJECT_DIR"
  local now
  now=$(date +%s)
  local cutoff=$((now - window))

  # Helper: file modified within window?
  recent() {
    local f="$1"
    [ -f "$f" ] || return 1
    local mtime
    mtime=$(stat -f %m "$f" 2>/dev/null || stat -c %Y "$f" 2>/dev/null || echo 0)
    [ "$mtime" -ge "$cutoff" ]
  }

  # Find most recent planning artifact
  local research_file plan_file verify_file
  research_file=$(find "$proj/.planning" -name "RESEARCH.md" 2>/dev/null | head -1 || echo "")
  plan_file=$(find "$proj/.planning" -name "PLAN.md" 2>/dev/null | head -1 || echo "")
  verify_file=$(find "$proj/.planning" -name "VERIFICATION.md" 2>/dev/null | head -1 || echo "")

  # Check for source files modified within the time window (outside .planning)
  # Use a sentinel file touched at the cutoff time for portable -newer comparison
  local src_modified=0
  local cutoff_sentinel
  cutoff_sentinel=$(mktemp)
  # Set mtime to cutoff using python3 for portability
  python3 -c "import os,time; os.utime('$cutoff_sentinel', (time.time()-${window}, time.time()-${window}))" 2>/dev/null || true
  if find "$proj" -not -path "*/.planning/*" -not -path "*/.git/*" \
      -newer "$cutoff_sentinel" \( \
        -name "*.swift" -o -name "*.py" -o -name "*.ts" -o \
        -name "*.js" -o -name "*.go" -o -name "*.rs" \
      \) 2>/dev/null | grep -q .; then
    src_modified=1
  fi
  rm -f "$cutoff_sentinel"

  # Execute: PLAN.md recent + source files modified
  if recent "$plan_file" && [ "$src_modified" -eq 1 ]; then
    echo "execute $plan_file"
    return
  fi

  # Verify: VERIFICATION.md recent
  if recent "$verify_file"; then
    echo "verify $verify_file"
    return
  fi

  # Plan: PLAN.md recent (no source modifications)
  if recent "$plan_file"; then
    echo "plan $plan_file"
    return
  fi

  # Research: RESEARCH.md recent
  if recent "$research_file"; then
    echo "research $research_file"
    return
  fi

  # Nothing detected
  echo ""
}

# --- Main ---

detection=$(detect_phase)
if [ -z "$detection" ]; then
  exit 0
fi

phase=$(echo "$detection" | cut -d' ' -f1)
artifact_file=$(echo "$detection" | cut -d' ' -f2-)

log "phase=${phase} artifact=${artifact_file}"

# --- Deduplication ---
artifact_mtime=$(stat -f %m "$artifact_file" 2>/dev/null || stat -c %Y "$artifact_file" 2>/dev/null || echo 0)
sentinel_key="${phase}:${artifact_mtime}"

if [ -f "$SENTINEL_FILE" ]; then
  last=$(cat "$SENTINEL_FILE")
  if [ "$last" = "$sentinel_key" ]; then
    log "dedup: skipping repeated event for $sentinel_key"
    exit 0
  fi
  # Also check: if the sentinel's mtime component matches any recent artifact's mtime,
  # the session was already processed (e.g. phase label changed but same artifact window).
  last_mtime=$(echo "$last" | cut -d: -f2)
  if [ -n "$last_mtime" ] && [ "$last_mtime" = "$artifact_mtime" ]; then
    log "dedup: skipping repeated event for $sentinel_key (mtime match)"
    exit 0
  fi
  # Also check all planning artifacts' mtimes against the sentinel's mtime
  proj="$PROJECT_DIR"
  while IFS= read -r -d '' f; do
    fmtime=$(stat -f %m "$f" 2>/dev/null || stat -c %Y "$f" 2>/dev/null || echo 0)
    if [ "$fmtime" = "$last_mtime" ]; then
      log "dedup: skipping repeated event for $sentinel_key (artifact $f mtime match)"
      exit 0
    fi
  done < <(find "$proj/.planning" \( -name "RESEARCH.md" -o -name "PLAN.md" -o -name "VERIFICATION.md" \) -print0 2>/dev/null)
fi

# Update sentinel
echo "$sentinel_key" > "$SENTINEL_FILE"

# --- Map phase to observer_mode ---
case "$phase" in
  research) observer_mode="audit" ;;
  plan)     observer_mode="block" ;;
  execute)  observer_mode="augment" ;;
  verify)   observer_mode="audit" ;;
  *)        observer_mode="audit" ;;
esac

# --- Generate event_id ---
event_id=$(uuidgen 2>/dev/null || date +%s%N | md5sum | cut -c1-8)

# --- Collect changed files ---
changed_files="[]"
if command -v git &>/dev/null && git -C "$PROJECT_DIR" rev-parse --git-dir &>/dev/null; then
  cf=$(git -C "$PROJECT_DIR" diff --name-only HEAD 2>/dev/null | \
    grep -v "^\.planning" | \
    python3 -c "import sys,json; lines=[l.strip() for l in sys.stdin if l.strip()]; print(json.dumps(lines))" 2>/dev/null || echo "[]")
  changed_files="$cf"
fi

# --- Find planning artifacts ---
plan_path=$(find "$PROJECT_DIR/.planning" -name "PLAN.md" 2>/dev/null | head -1 || echo "null")
research_path=$(find "$PROJECT_DIR/.planning" -name "RESEARCH.md" 2>/dev/null | head -1 || echo "null")

[ -f "$plan_path" ] || plan_path="null"
[ -f "$research_path" ] || research_path="null"

# --- Write event JSON atomically ---
event_file="/tmp/gsd-event-${event_id}.json"
timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

cat > "${event_file}.tmp" <<EOF
{
  "event_id": "${event_id}",
  "event_type": "phase_complete",
  "gsd_phase": "${phase}",
  "observer_mode": "${observer_mode}",
  "context_summary": "${phase} phase detected: ${artifact_file}",
  "artifacts": {
    "plan": $([ "$plan_path" = "null" ] && echo "null" || echo "\"$plan_path\""),
    "research": $([ "$research_path" = "null" ] && echo "null" || echo "\"$research_path\""),
    "changed_files": ${changed_files},
    "test_results": null
  },
  "worker_session": "${WORKER_SESSION}",
  "worker_pane": "${WORKER_SESSION}:${WORKER_PANE}",
  "project_dir": "${PROJECT_DIR}",
  "timestamp": "${timestamp}"
}
EOF
mv "${event_file}.tmp" "$event_file"
log "Event written: $event_file"

# --- Dry run: skip tmux and polling ---
if [ -n "$DRY_RUN" ]; then
  log "DRY_RUN: would wake observer and poll for response"
  exit 0
fi

# --- Wake Observer ---
"$SCRIPTS_DIR/wake-observer.sh" "$event_id" "$OBSERVER_SESSION" "$OBSERVER_PANE" || {
  log "WARNING: wake-observer.sh failed — continuing without Observer"
  exit 0
}

# --- Poll for response ---
response_file="/tmp/gsd-response-${event_id}.json"
hold_count=0
elapsed=0

log "Polling for Observer response (max ${POLL_TIMEOUT}s)..."

while [ "$elapsed" -lt "$POLL_TIMEOUT" ]; do
  if [ -f "$response_file" ]; then
    # Validate event_id matches
    resp_event_id=$(jq -r '.event_id // ""' "$response_file" 2>/dev/null || echo "")
    if [ "$resp_event_id" != "$event_id" ]; then
      # Mismatch — skip and keep polling
      sleep 1
      elapsed=$((elapsed+1))
      continue
    fi

    decision=$(jq -r '.decision // "proceed"' "$response_file" 2>/dev/null || echo "proceed")
    log "Observer decision: $decision"

    if [ "$decision" = "hold" ]; then
      hold_count=$((hold_count+1))
      if [ "$hold_count" -ge "$HOLD_MAX" ]; then
        log "Max hold cycles reached ($HOLD_MAX) — proceeding"
        break
      fi
      log "Observer hold (cycle $hold_count/$HOLD_MAX) — resetting timer"
      elapsed=0
      # Remove response file so we detect the next overwrite
      rm -f "$response_file"
      continue
    fi

    # proceed or revise — done
    break
  fi

  sleep 1
  elapsed=$((elapsed+1))
done

if [ "$elapsed" -ge "$POLL_TIMEOUT" ]; then
  log "WARNING: Observer did not respond in ${POLL_TIMEOUT}s — Worker continuing unblocked"
fi

exit 0

# GSD Observer-Worker Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a two-Claude tmux system where a Worker Claude running GSD is observed by an Observer Claude that audits, blocks, or augments based on GSD phase completion events.

**Architecture:** Worker's Stop hook detects GSD artifact file modifications, writes an event JSON, wakes Observer via `tmux send-keys`, then blocks in a polling loop. Observer processes the event and injects its decision back into Worker's pane. All IPC uses atomic-write temp files with correlation tokens.

**Tech Stack:** bash, tmux, jq, claude CLI, Claude Code hooks (Stop hook type)

**Spec:** `docs/superpowers/specs/2026-03-16-gsd-observer-worker-design.md`

---

## Chunk 1: Scaffold + Schema + Observer Agent

### Task 1: Create directory structure

**Files:**
- Create: `~/.claude/gsd-observer/agents/`
- Create: `~/.claude/gsd-observer/hooks/`
- Create: `~/.claude/gsd-observer/scripts/`
- Create: `~/.claude/gsd-observer/schema/`
- Create: `~/.claude/gsd-observer/tests/`
- Create: `~/.claude/gsd-observer/templates/`

- [ ] **Step 1: Create all directories**

```bash
mkdir -p ~/.claude/gsd-observer/{agents,hooks,scripts,schema,tests,templates}
```

- [ ] **Step 2: Verify structure**

```bash
ls ~/.claude/gsd-observer/
```

Expected output:
```
agents  hooks  schema  scripts  templates  tests
```

- [ ] **Step 3: Commit**

```bash
cd ~/.claude/gsd-observer
git init
git add .
git commit -m "chore: initialize gsd-observer directory structure"
```

---

### Task 2: Write schema example files

**Files:**
- Create: `~/.claude/gsd-observer/schema/event.json`
- Create: `~/.claude/gsd-observer/schema/response.json`

- [ ] **Step 1: Write event.json**

Create `~/.claude/gsd-observer/schema/event.json`:

```json
{
  "_comment": "Event written by gsd-stop-hook.sh. Named /tmp/gsd-event-<event_id>.json",
  "event_id": "a3f9c1d2",
  "event_type": "phase_complete",
  "gsd_phase": "execute",
  "observer_mode": "augment",
  "context_summary": "Execute phase detected: src/auth/login.swift modified",
  "artifacts": {
    "plan": "/Users/user/project/.planning/phase-3/PLAN.md",
    "research": "/Users/user/project/.planning/phase-3/RESEARCH.md",
    "changed_files": [
      "src/auth/login.swift",
      "src/auth/session.swift"
    ],
    "test_results": "/tmp/gsd-test-results-a3f9c1d2.txt"
  },
  "worker_session": "gsd-worker",
  "worker_pane": "gsd-worker:0.0",
  "project_dir": "/Users/user/project",
  "timestamp": "2026-03-16T10:00:00Z"
}
```

- [ ] **Step 2: Write response.json**

Create `~/.claude/gsd-observer/schema/response.json`:

```json
{
  "_comment": "Response written by Observer Claude. Named /tmp/gsd-response-<event_id>.json",
  "_decision_values": "proceed | revise | hold",
  "event_id": "a3f9c1d2",
  "decision": "revise",
  "mode": "augment",
  "observations": [
    "Auth module missing input validation on login handler",
    "Unit tests pass but no integration test for session expiry"
  ],
  "message": "Two issues found. Fix input validation before proceeding.",
  "revision_instructions": "Add input validation to src/auth/login.swift login() function. Validate email format and non-empty password before calling authenticate().",
  "timestamp": "2026-03-16T10:00:05Z"
}
```

- [ ] **Step 3: Validate JSON is parseable**

```bash
jq . ~/.claude/gsd-observer/schema/event.json > /dev/null && echo "event.json OK"
jq . ~/.claude/gsd-observer/schema/response.json > /dev/null && echo "response.json OK"
```

Expected:
```
event.json OK
response.json OK
```

- [ ] **Step 4: Commit**

```bash
git -C ~/.claude/gsd-observer add schema/
git -C ~/.claude/gsd-observer commit -m "docs: add annotated event and response schema examples"
```

---

### Task 3: Write Observer agent system prompt

**Files:**
- Create: `~/.claude/gsd-observer/agents/gsd-observer.md`

- [ ] **Step 1: Write agent file**

Create `~/.claude/gsd-observer/agents/gsd-observer.md`:

```markdown
---
description: GSD Observer co-pilot. Woken by Worker Claude via tmux to review GSD phase outputs.
---

You are GSD Observer, a co-pilot for a Claude instance running the GSD (Get Shit Done) workflow.

When you receive an instruction to read an event file and respond:

1. Read the event JSON file at the path given
2. Check the `observer_mode` field
3. Read the artifacts listed (handle null fields gracefully — note absence in observations)
4. Execute mode logic:

   **AUDIT mode** (research, verify phases):
   - Review artifacts for completeness, quality, coverage gaps
   - Identify missing information or weak areas
   - Decision: `proceed` if adequate, `revise` if gaps are significant

   **BLOCK mode** (plan phase):
   - Review plan document: goal clarity, task breakdown, dependencies, risks, success criteria
   - Decision: `proceed` if plan is solid, `revise` if fundamental issues found

   **AUGMENT mode** (execute phase):
   - Review changed files: correctness, code quality, security, edge cases
   - Review test results if present (note if absent)
   - Decision: `proceed` if acceptable, `revise` if issues need fixing before next phase

5. Write response JSON **atomically** to the path specified:
   ```bash
   echo '<json>' > <path>.tmp && mv <path>.tmp <path>
   ```

   Response format:
   ```json
   {
     "event_id": "<from event file>",
     "decision": "proceed | revise | hold",
     "mode": "<audit | block | augment>",
     "observations": ["observation 1", "observation 2"],
     "message": "Human-readable summary for Worker Claude.",
     "revision_instructions": "Specific actionable instructions (required when decision=revise, omit otherwise)",
     "timestamp": "<ISO8601>"
   }
   ```

6. Run the notify script:
   ```bash
   ~/.claude/gsd-observer/scripts/notify-worker.sh <event_id>
   ```

**Rules:**
- `revision_instructions` must be specific and actionable — Worker Claude acts on it without asking for clarification
- Be concise in `message` (1-2 sentences)
- Do NOT ask questions back to the user
- Handle `null` artifact fields by noting the absence in observations rather than failing
```

- [ ] **Step 2: Verify file exists and is non-empty**

```bash
wc -l ~/.claude/gsd-observer/agents/gsd-observer.md
```

Expected: line count > 10

- [ ] **Step 3: Commit**

```bash
git -C ~/.claude/gsd-observer add agents/gsd-observer.md
git -C ~/.claude/gsd-observer commit -m "feat: add Observer Claude agent system prompt"
```

---

## Chunk 2: Signal Scripts

### Task 4: Write wake-observer.sh

**Files:**
- Create: `~/.claude/gsd-observer/scripts/wake-observer.sh`
- Create: `~/.claude/gsd-observer/tests/test-signals.sh` (partial)

- [ ] **Step 1: Write the failing test for wake-observer.sh**

Create `~/.claude/gsd-observer/tests/test-signals.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
PASS=0; FAIL=0

assert_eq() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  PASS: $desc"; PASS=$((PASS+1))
  else
    echo "  FAIL: $desc"; echo "    expected: $expected"; echo "    actual:   $actual"; FAIL=$((FAIL+1))
  fi
}

echo "=== test-signals.sh ==="

# Test: wake-observer.sh requires 3 args
echo "--- wake-observer.sh arg validation ---"
output=$(~/.claude/gsd-observer/scripts/wake-observer.sh 2>&1 || true)
assert_eq "exits non-zero with no args" "1" "$(~/.claude/gsd-observer/scripts/wake-observer.sh > /dev/null 2>&1; echo $?)"

echo ""
echo "Results: ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ]
```

- [ ] **Step 2: Run test — expect failure (script doesn't exist yet)**

```bash
bash ~/.claude/gsd-observer/tests/test-signals.sh 2>&1 || echo "Expected failure: script not found"
```

- [ ] **Step 3: Write wake-observer.sh**

Create `~/.claude/gsd-observer/scripts/wake-observer.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

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
  pane_content=$(tmux capture-pane -pt "$full_target" -l 5 2>/dev/null || echo "")
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
tmux send-keys -t "$full_target" \
  "Read ${event_path} and respond as GSD Observer. Write response to /tmp/gsd-response-${event_id}.json then run ~/.claude/gsd-observer/scripts/notify-worker.sh ${event_id}" \
  Enter

echo "[wake-observer] Observer woken for event ${event_id}" >&2
```

- [ ] **Step 4: Make executable**

```bash
chmod +x ~/.claude/gsd-observer/scripts/wake-observer.sh
```

- [ ] **Step 5: Run test — expect pass**

```bash
bash ~/.claude/gsd-observer/tests/test-signals.sh
```

Expected:
```
=== test-signals.sh ===
--- wake-observer.sh arg validation ---
  PASS: exits non-zero with no args

Results: 1 passed, 0 failed
```

- [ ] **Step 6: Commit**

```bash
git -C ~/.claude/gsd-observer add scripts/wake-observer.sh tests/test-signals.sh
git -C ~/.claude/gsd-observer commit -m "feat: add wake-observer.sh with arg validation"
```

---

### Task 5: Write notify-worker.sh

**Files:**
- Modify: `~/.claude/gsd-observer/tests/test-signals.sh`
- Create: `~/.claude/gsd-observer/scripts/notify-worker.sh`

- [ ] **Step 1: Add failing tests for notify-worker.sh**

Append to `~/.claude/gsd-observer/tests/test-signals.sh` (before the final results block):

```bash
# Test: notify-worker.sh requires event_id arg
echo "--- notify-worker.sh arg validation ---"
assert_eq "exits 1 with no args" "1" "$(~/.claude/gsd-observer/scripts/notify-worker.sh 2>/dev/null; echo $?)"

# Test: notify-worker.sh exits 1 if response file missing
echo "--- notify-worker.sh missing response file ---"
assert_eq "exits 1 if response file missing" "1" \
  "$(~/.claude/gsd-observer/scripts/notify-worker.sh missing-event-id 2>/dev/null; echo $?)"

# Test: notify-worker.sh exits 1 if event file missing (no worker_pane)
echo "--- notify-worker.sh missing event file ---"
fake_id="test-$(date +%s)"
echo '{"event_id":"'$fake_id'","decision":"proceed","message":"ok","mode":"audit","observations":[],"timestamp":"now"}' \
  > /tmp/gsd-response-${fake_id}.json
assert_eq "exits 1 if event file missing" "1" \
  "$(~/.claude/gsd-observer/scripts/notify-worker.sh $fake_id 2>/dev/null; echo $?)"
rm -f /tmp/gsd-response-${fake_id}.json
```

- [ ] **Step 2: Run test — expect failure**

```bash
bash ~/.claude/gsd-observer/tests/test-signals.sh 2>&1 || echo "Expected failure"
```

- [ ] **Step 3: Write notify-worker.sh**

Create `~/.claude/gsd-observer/scripts/notify-worker.sh`:

```bash
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
```

- [ ] **Step 4: Make executable**

```bash
chmod +x ~/.claude/gsd-observer/scripts/notify-worker.sh
```

- [ ] **Step 5: Run tests — expect all pass**

```bash
bash ~/.claude/gsd-observer/tests/test-signals.sh
```

Expected:
```
=== test-signals.sh ===
--- wake-observer.sh arg validation ---
  PASS: exits non-zero with no args
--- notify-worker.sh arg validation ---
  PASS: exits 1 with no args
--- notify-worker.sh missing response file ---
  PASS: exits 1 if response file missing
--- notify-worker.sh missing event file ---
  PASS: exits 1 if event file missing

Results: 4 passed, 0 failed
```

- [ ] **Step 6: Commit**

```bash
git -C ~/.claude/gsd-observer add scripts/notify-worker.sh tests/test-signals.sh
git -C ~/.claude/gsd-observer commit -m "feat: add notify-worker.sh with event-file worker_pane lookup"
```

---

## Chunk 3: Stop Hook

### Task 6: Write gsd-stop-hook.sh

This is the core of the system. It detects GSD phases via recently-modified artifacts, writes the event JSON, wakes Observer, then blocks in a polling loop until Observer responds.

**Files:**
- Create: `~/.claude/gsd-observer/hooks/gsd-stop-hook.sh`
- Create: `~/.claude/gsd-observer/tests/test-hook.sh`

- [ ] **Step 1: Write failing tests**

Create `~/.claude/gsd-observer/tests/test-hook.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
PASS=0; FAIL=0
HOOK="$HOME/.claude/gsd-observer/hooks/gsd-stop-hook.sh"
TMPDIR_TEST=$(mktemp -d)
trap "rm -rf $TMPDIR_TEST" EXIT

assert_eq() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  PASS: $desc"; PASS=$((PASS+1))
  else
    echo "  FAIL: $desc"; echo "    expected: '$expected'"; echo "    actual:   '$actual'"; FAIL=$((FAIL+1))
  fi
}

echo "=== test-hook.sh ==="

# Test 1: exits 0 when GSD_OBSERVER_ENABLED is unset
echo "--- observer disabled ---"
unset GSD_OBSERVER_ENABLED 2>/dev/null || true
result=$(echo '{}' | bash "$HOOK" 2>/dev/null; echo $?)
assert_eq "exits 0 when disabled" "0" "$result"

# Test 2: exits 0 when no recent artifacts found
echo "--- no artifacts ---"
result=$(GSD_OBSERVER_ENABLED=1 GSD_ARTIFACT_WINDOW_SECS=1 \
  GSD_OBSERVER_SESSION=no-session GSD_OBSERVER_PANE=0.0 \
  GSD_PROJECT_DIR="$TMPDIR_TEST" \
  echo '{}' | bash "$HOOK" 2>/dev/null; echo $?)
assert_eq "exits 0 when no artifacts" "0" "$result"

# Test 3: detects research phase when RESEARCH.md is recent
echo "--- research phase detection ---"
planning_dir="$TMPDIR_TEST/.planning/phase-1"
mkdir -p "$planning_dir"
echo "# Research" > "$planning_dir/RESEARCH.md"
detected_phase=$(GSD_OBSERVER_ENABLED=1 GSD_ARTIFACT_WINDOW_SECS=10 \
  GSD_OBSERVER_SESSION=no-session GSD_OBSERVER_PANE=0.0 \
  GSD_PROJECT_DIR="$TMPDIR_TEST" \
  GSD_DRY_RUN=1 \
  bash "$HOOK" 2>&1 | grep "phase=" | sed 's/.*phase=//' | cut -d' ' -f1 || true)
assert_eq "detects research phase" "research" "$detected_phase"

# Test 4: detects plan phase when PLAN.md is recent (no source files)
echo "--- plan phase detection ---"
echo "# Plan" > "$planning_dir/PLAN.md"
detected_phase=$(GSD_OBSERVER_ENABLED=1 GSD_ARTIFACT_WINDOW_SECS=10 \
  GSD_OBSERVER_SESSION=no-session GSD_OBSERVER_PANE=0.0 \
  GSD_PROJECT_DIR="$TMPDIR_TEST" \
  GSD_DRY_RUN=1 \
  bash "$HOOK" 2>&1 | grep "phase=" | sed 's/.*phase=//' | cut -d' ' -f1 || true)
assert_eq "detects plan phase" "plan" "$detected_phase"

# Test 5: detects execute phase when PLAN.md + source file are recent
echo "--- execute phase detection ---"
mkdir -p "$TMPDIR_TEST/src"
echo "// code" > "$TMPDIR_TEST/src/main.swift"
detected_phase=$(GSD_OBSERVER_ENABLED=1 GSD_ARTIFACT_WINDOW_SECS=10 \
  GSD_OBSERVER_SESSION=no-session GSD_OBSERVER_PANE=0.0 \
  GSD_PROJECT_DIR="$TMPDIR_TEST" \
  GSD_DRY_RUN=1 \
  bash "$HOOK" 2>&1 | grep "phase=" | sed 's/.*phase=//' | cut -d' ' -f1 || true)
assert_eq "detects execute phase" "execute" "$detected_phase"

# Test 6: deduplication — same mtime skipped
echo "--- deduplication ---"
sentinel=$(mktemp)
echo "research:$(stat -f %m "$planning_dir/RESEARCH.md" 2>/dev/null || stat -c %Y "$planning_dir/RESEARCH.md")" > "$sentinel"
# Remove the recently-modified source file to force research detection
rm -f "$TMPDIR_TEST/src/main.swift"
result=$(GSD_OBSERVER_ENABLED=1 GSD_ARTIFACT_WINDOW_SECS=10 \
  GSD_OBSERVER_SESSION=no-session GSD_OBSERVER_PANE=0.0 \
  GSD_PROJECT_DIR="$TMPDIR_TEST" \
  GSD_SENTINEL_FILE="$sentinel" \
  GSD_DRY_RUN=1 \
  bash "$HOOK" 2>&1 | grep -c "dedup" || true)
assert_eq "dedup skips repeated event" "1" "$result"
rm -f "$sentinel"

echo ""
echo "Results: ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ]
```

- [ ] **Step 2: Run test — expect failure**

```bash
bash ~/.claude/gsd-observer/tests/test-hook.sh 2>&1 || echo "Expected failure: hook not found"
```

- [ ] **Step 3: Write gsd-stop-hook.sh**

Create `~/.claude/gsd-observer/hooks/gsd-stop-hook.sh`:

```bash
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
  # touch with epoch seconds: macOS uses -t YYYYMMDDHHMM.SS, fallback via python
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
```

- [ ] **Step 4: Make executable**

```bash
chmod +x ~/.claude/gsd-observer/hooks/gsd-stop-hook.sh
```

- [ ] **Step 5: Run tests — expect all pass**

```bash
bash ~/.claude/gsd-observer/tests/test-hook.sh
```

Expected:
```
=== test-hook.sh ===
--- observer disabled ---
  PASS: exits 0 when disabled
--- no artifacts ---
  PASS: exits 0 when no artifacts
--- research phase detection ---
  PASS: detects research phase
--- plan phase detection ---
  PASS: detects plan phase
--- execute phase detection ---
  PASS: detects execute phase
--- deduplication ---
  PASS: dedup skips repeated event

Results: 6 passed, 0 failed
```

- [ ] **Step 6: Commit**

```bash
git -C ~/.claude/gsd-observer add hooks/gsd-stop-hook.sh tests/test-hook.sh
git -C ~/.claude/gsd-observer commit -m "feat: add gsd-stop-hook.sh with phase detection, dedup, and polling"
```

---

## Chunk 4: Session Startup Scripts + Hook Template

### Task 7: Write start-observer.sh and start-worker.sh

**Files:**
- Create: `~/.claude/gsd-observer/scripts/start-observer.sh`
- Create: `~/.claude/gsd-observer/scripts/start-worker.sh`
- Create: `~/.claude/gsd-observer/templates/settings.json`

- [ ] **Step 1: Write start-observer.sh**

Create `~/.claude/gsd-observer/scripts/start-observer.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

SESSION="${GSD_OBSERVER_SESSION:-gsd-observer}"

# Kill existing session if running
tmux kill-session -t "$SESSION" 2>/dev/null || true

# Create new session
tmux new-session -d -s "$SESSION"

# Launch Claude with Bash tool enabled (required for notify-worker.sh)
tmux send-keys -t "${SESSION}:0.0" \
  "claude --allowedTools 'Bash,Read,Write,Glob,Grep'" \
  Enter

# Wait for Claude prompt using pattern detection (not fixed sleep)
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
```

- [ ] **Step 2: Write start-worker.sh**

Create `~/.claude/gsd-observer/scripts/start-worker.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${1:-$(pwd)}"
SESSION="${GSD_WORKER_SESSION:-gsd-worker}"

if [ ! -d "$PROJECT_DIR" ]; then
  echo "ERROR: project directory not found: $PROJECT_DIR" >&2
  exit 1
fi

# Cleanup stale temp files from previous session
echo "[gsd-worker] Cleaning up stale temp files..."
rm -f /tmp/gsd-event-*.json /tmp/gsd-response-*.json /tmp/gsd-last-event-phase

# Kill existing session if running
tmux kill-session -t "$SESSION" 2>/dev/null || true

# Create new session
tmux new-session -d -s "$SESSION"

# Launch Claude with GSD_OBSERVER_ENABLED set
tmux send-keys -t "${SESSION}:0.0" \
  "cd \"$PROJECT_DIR\" && GSD_OBSERVER_ENABLED=1 claude" \
  Enter

echo "[gsd-worker] Worker ready in session: $SESSION"
echo "[gsd-worker] Project: $PROJECT_DIR"
echo ""
echo "Next steps:"
echo "  1. Attach to worker:   tmux attach -t $SESSION"
echo "  2. Attach to observer: tmux attach -t ${GSD_OBSERVER_SESSION:-gsd-observer}"
echo "  3. Begin GSD workflow in the worker session"
```

- [ ] **Step 3: Write hook registration template**

Create `~/.claude/gsd-observer/templates/settings.json`:

```json
{
  "_comment": "Copy this to <project>/.claude/settings.json to enable GSD Observer hook",
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/gsd-observer/hooks/gsd-stop-hook.sh"
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 4: Make scripts executable**

```bash
chmod +x ~/.claude/gsd-observer/scripts/start-observer.sh
chmod +x ~/.claude/gsd-observer/scripts/start-worker.sh
```

- [ ] **Step 5: Smoke test start-worker.sh with bad path**

```bash
~/.claude/gsd-observer/scripts/start-worker.sh /nonexistent/path 2>&1 | grep "ERROR"
```

Expected: `ERROR: project directory not found: /nonexistent/path`

- [ ] **Step 6: Commit**

```bash
git -C ~/.claude/gsd-observer add scripts/start-observer.sh scripts/start-worker.sh templates/settings.json
git -C ~/.claude/gsd-observer commit -m "feat: add session startup scripts and hook registration template"
```

---

### Task 8: Write integration smoke test

**Files:**
- Create: `~/.claude/gsd-observer/tests/test-integration.sh`

- [ ] **Step 1: Write integration test**

Create `~/.claude/gsd-observer/tests/test-integration.sh`:

```bash
#!/usr/bin/env bash
# Integration smoke test — validates the full event→response flow
# Does NOT require live Claude instances. Uses mock scripts.
set -euo pipefail

PASS=0; FAIL=0
TMPDIR_INT=$(mktemp -d)
# Track event files created during this test run for cleanup
GSD_EVENTS_BEFORE=$(ls /tmp/gsd-event-*.json 2>/dev/null | sort || true)
trap 'rm -rf "$TMPDIR_INT"; comm -13 <(echo "$GSD_EVENTS_BEFORE") <(ls /tmp/gsd-event-*.json 2>/dev/null | sort || true) | xargs rm -f 2>/dev/null; rm -f /tmp/gsd-response-*.json' EXIT

assert_eq() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  PASS: $desc"; PASS=$((PASS+1))
  else
    echo "  FAIL: $desc"; echo "    expected: '$expected'"; echo "    actual:   '$actual'"; FAIL=$((FAIL+1))
  fi
}

echo "=== test-integration.sh ==="

# Setup mock project directory with GSD artifacts
mkdir -p "$TMPDIR_INT/.planning/phase-1"
echo "# Research content" > "$TMPDIR_INT/.planning/phase-1/RESEARCH.md"

# --- Test: hook creates event file in DRY_RUN mode ---
echo "--- hook creates event file for research phase ---"
GSD_OBSERVER_ENABLED=1 \
GSD_ARTIFACT_WINDOW_SECS=10 \
GSD_OBSERVER_SESSION=mock-observer \
GSD_OBSERVER_PANE=0.0 \
GSD_PROJECT_DIR="$TMPDIR_INT" \
GSD_DRY_RUN=1 \
GSD_SENTINEL_FILE="$TMPDIR_INT/sentinel" \
bash ~/.claude/gsd-observer/hooks/gsd-stop-hook.sh <<< '{}' 2>/dev/null || true

# Find the event file written (uses real /tmp)
event_file=$(ls /tmp/gsd-event-*.json 2>/dev/null | tail -1 || echo "")
assert_eq "event file created" "1" "$([ -n "$event_file" ] && [ -f "$event_file" ] && echo 1 || echo 0)"

if [ -f "${event_file:-/dev/null}" ]; then
  phase=$(jq -r .gsd_phase "$event_file" 2>/dev/null || echo "")
  mode=$(jq -r .observer_mode "$event_file" 2>/dev/null || echo "")
  assert_eq "phase is research" "research" "$phase"
  assert_eq "mode is audit" "audit" "$mode"

  event_id=$(jq -r .event_id "$event_file")

  # --- Test: notify-worker.sh reads worker_pane from event file ---
  echo "--- notify-worker reads worker_pane from event file ---"
  # Write a response file
  cat > "/tmp/gsd-response-${event_id}.json" <<RESP
{
  "event_id": "${event_id}",
  "decision": "proceed",
  "mode": "audit",
  "observations": ["Research looks good"],
  "message": "Proceed.",
  "timestamp": "2026-03-16T00:00:00Z"
}
RESP

  # notify-worker should fail gracefully (no real tmux session)
  result=$(~/.claude/gsd-observer/scripts/notify-worker.sh "$event_id" 2>&1 || true)
  # It will fail on tmux send-keys but should NOT fail on missing worker_pane
  assert_eq "worker_pane read from event file (not null error)" "0" \
    "$(echo "$result" | grep -c 'worker_pane not found' || true)"
fi

# --- Test: dedup prevents second event for same artifact ---
echo "--- deduplication prevents duplicate event ---"
initial_count=$(ls /tmp/gsd-event-*.json 2>/dev/null | wc -l | tr -d ' ')
GSD_OBSERVER_ENABLED=1 \
GSD_ARTIFACT_WINDOW_SECS=10 \
GSD_OBSERVER_SESSION=mock-observer \
GSD_OBSERVER_PANE=0.0 \
GSD_PROJECT_DIR="$TMPDIR_INT" \
GSD_DRY_RUN=1 \
GSD_SENTINEL_FILE="$TMPDIR_INT/sentinel" \
bash ~/.claude/gsd-observer/hooks/gsd-stop-hook.sh <<< '{}' 2>/dev/null || true
after_count=$(ls /tmp/gsd-event-*.json 2>/dev/null | wc -l | tr -d ' ')
assert_eq "no new event on dedup" "$initial_count" "$after_count"

echo ""
echo "Results: ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ]
```

- [ ] **Step 2: Run integration test**

```bash
bash ~/.claude/gsd-observer/tests/test-integration.sh
```

Expected:
```
=== test-integration.sh ===
--- hook creates event file for research phase ---
  PASS: event file created
  PASS: phase is research
  PASS: mode is audit
--- notify-worker reads worker_pane from event file ---
  PASS: worker_pane read from event file (not null error)
--- deduplication prevents duplicate event ---
  PASS: no new event on dedup

Results: 5 passed, 0 failed
```

- [ ] **Step 3: Commit**

```bash
git -C ~/.claude/gsd-observer add tests/test-integration.sh
git -C ~/.claude/gsd-observer commit -m "test: add integration smoke test for full event→response flow"
```

---

## Chunk 5: Installation & Verification

### Task 9: Install into Claude config and write teardown script

**Files:**
- Create: `~/.claude/gsd-observer/scripts/install.sh`
- Create: `~/.claude/gsd-observer/scripts/teardown.sh`
- Create: `~/.claude/gsd-observer/scripts/verify.sh`

- [ ] **Step 1: Write install.sh**

Create `~/.claude/gsd-observer/scripts/install.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "[gsd-observer] Installing GSD Observer..."

# 1. Verify jq is available (required by hook and signal scripts)
if ! command -v jq &>/dev/null; then
  echo "ERROR: jq is required. Install with: brew install jq" >&2
  exit 1
fi

# 2. Verify tmux is available
if ! command -v tmux &>/dev/null; then
  echo "ERROR: tmux is required. Install with: brew install tmux" >&2
  exit 1
fi

# 3. Verify claude CLI is available
if ! command -v claude &>/dev/null; then
  echo "ERROR: claude CLI is required. Install from: https://claude.ai/code" >&2
  exit 1
fi

# 4. Confirm all scripts are executable
for script in wake-observer notify-worker start-observer start-worker; do
  chmod +x "$HOME/.claude/gsd-observer/scripts/${script}.sh"
done
chmod +x "$HOME/.claude/gsd-observer/hooks/gsd-stop-hook.sh"

echo "[gsd-observer] All prerequisites met."
echo ""
echo "To enable for a project:"
echo "  cp ~/.claude/gsd-observer/templates/settings.json <project>/.claude/settings.json"
echo ""
echo "To start sessions:"
echo "  ~/.claude/gsd-observer/scripts/start-observer.sh"
echo "  ~/.claude/gsd-observer/scripts/start-worker.sh /path/to/project"
```

- [ ] **Step 2: Write teardown.sh**

Create `~/.claude/gsd-observer/scripts/teardown.sh`:

```bash
#!/usr/bin/env bash
WORKER_SESSION="${GSD_WORKER_SESSION:-gsd-worker}"
OBSERVER_SESSION="${GSD_OBSERVER_SESSION:-gsd-observer}"

echo "[gsd-observer] Tearing down sessions..."
tmux kill-session -t "$WORKER_SESSION" 2>/dev/null && echo "  Killed: $WORKER_SESSION" || echo "  Not running: $WORKER_SESSION"
tmux kill-session -t "$OBSERVER_SESSION" 2>/dev/null && echo "  Killed: $OBSERVER_SESSION" || echo "  Not running: $OBSERVER_SESSION"

echo "[gsd-observer] Cleaning up temp files..."
rm -f /tmp/gsd-event-*.json /tmp/gsd-response-*.json /tmp/gsd-last-event-phase
echo "  Done."
```

- [ ] **Step 3: Write verify.sh**

Create `~/.claude/gsd-observer/scripts/verify.sh`:

```bash
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

# Check Observer is at prompt (not crashed)
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
```

- [ ] **Step 4: Make all scripts executable**

```bash
chmod +x ~/.claude/gsd-observer/scripts/install.sh
chmod +x ~/.claude/gsd-observer/scripts/teardown.sh
chmod +x ~/.claude/gsd-observer/scripts/verify.sh
```

- [ ] **Step 5: Run install.sh to verify prerequisites**

```bash
~/.claude/gsd-observer/scripts/install.sh
```

Expected: confirms jq, tmux, claude are present and prints usage instructions.

- [ ] **Step 6: Run all test suites**

```bash
echo "=== Running all tests ===" && \
bash ~/.claude/gsd-observer/tests/test-hook.sh && \
bash ~/.claude/gsd-observer/tests/test-signals.sh && \
bash ~/.claude/gsd-observer/tests/test-integration.sh && \
echo "=== All tests passed ==="
```

- [ ] **Step 7: Commit**

```bash
git -C ~/.claude/gsd-observer add scripts/install.sh scripts/teardown.sh scripts/verify.sh
git -C ~/.claude/gsd-observer commit -m "feat: add install, teardown, and verify scripts"
```

---

### Task 10: Enable for a project and end-to-end verify

- [ ] **Step 1: Copy hook template to a test project**

```bash
mkdir -p /tmp/gsd-test-project/.claude
cp ~/.claude/gsd-observer/templates/settings.json /tmp/gsd-test-project/.claude/settings.json
```

- [ ] **Step 2: Confirm settings.json is valid JSON**

```bash
jq . /tmp/gsd-test-project/.claude/settings.json
```

- [ ] **Step 3: Start Observer session**

```bash
~/.claude/gsd-observer/scripts/start-observer.sh
```

Expected: prints `[gsd-observer] Observer ready in session: gsd-observer`

- [ ] **Step 4: Start Worker session pointing at test project**

```bash
~/.claude/gsd-observer/scripts/start-worker.sh /tmp/gsd-test-project
```

- [ ] **Step 5: Run verify.sh from test project directory**

```bash
cd /tmp/gsd-test-project && ~/.claude/gsd-observer/scripts/verify.sh
```

Expected: all checks pass (8 OK, 0 missing)

- [ ] **Step 6: Simulate a GSD phase event manually**

```bash
# Create a fake planning artifact in the test project
mkdir -p /tmp/gsd-test-project/.planning/phase-1
echo "# Research" > /tmp/gsd-test-project/.planning/phase-1/RESEARCH.md

# Run the hook manually in DRY_RUN mode to confirm detection
GSD_OBSERVER_ENABLED=1 \
GSD_ARTIFACT_WINDOW_SECS=30 \
GSD_PROJECT_DIR=/tmp/gsd-test-project \
GSD_DRY_RUN=1 \
bash ~/.claude/gsd-observer/hooks/gsd-stop-hook.sh <<< '{}' 2>&1
```

Expected stderr output:
```
[gsd-hook] phase=research artifact=/tmp/gsd-test-project/.planning/phase-1/RESEARCH.md
[gsd-hook] Event written: /tmp/gsd-event-<id>.json
[gsd-hook] DRY_RUN: would wake observer and poll for response
```

- [ ] **Step 7: Final commit and cleanup**

```bash
cd /tmp/gsd-test-project && rm -rf /tmp/gsd-test-project
git -C ~/.claude/gsd-observer add -A
git -C ~/.claude/gsd-observer commit -m "chore: installation complete and verified"
```

- [ ] **Step 8: Teardown test sessions**

```bash
~/.claude/gsd-observer/scripts/teardown.sh
```

---

## Usage After Installation

```bash
# Terminal 1: start Observer (do this first)
~/.claude/gsd-observer/scripts/start-observer.sh
tmux attach -t gsd-observer

# Terminal 2: start Worker for your project
~/.claude/gsd-observer/scripts/start-worker.sh ~/your-project
tmux attach -t gsd-worker

# In Worker session: run GSD as normal
# /gsd:plan-phase, /gsd:execute-phase, etc.
# After each phase, Observer automatically wakes and responds
```

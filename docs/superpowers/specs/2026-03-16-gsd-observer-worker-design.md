# GSD Observer-Worker tmux Architecture

**Date:** 2026-03-16
**Status:** Revised v3

---

## Overview

A two-Claude tmux system where a **Worker** Claude runs the GSD workflow and an **Observer** Claude acts as co-pilot. Worker uses a **Stop hook** that detects GSD phase completion by checking for recently-modified GSD artifact files, writes an event JSON, and blocks in a polling loop until Observer responds. Observer processes the event and injects its response back into the Worker pane via `tmux send-keys`. Communication payloads use atomic-write JSON temp files with correlation tokens.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│   tmux: gsd-worker                                              │
│                                                                 │
│  Claude (GSD workflow)                                          │
│    ↓ runs gsd:* skills                                          │
│    ↓ GSD writes artifact files (PLAN.md, RESEARCH.md, etc.)     │
│    ↓ Claude finishes response → Stop hook fires                 │
│    ↓ hook detects recently-modified GSD artifact → phase mapped │
│    ↓ hook writes /tmp/gsd-event-<id>.json (atomic)             │
│    ↓ hook calls wake-observer.sh                                │
│    ↓ hook blocks in polling loop (1s interval, 120s max)        │
│    ↓ [blocked — Claude is waiting for hook to exit]             │
└────────────────────────────────┬────────────────────────────────┘
                                 │ tmux send-keys (event path)
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│   tmux: gsd-observer                                            │
│                                                                 │
│  Claude (Observer agent, Bash tool enabled)                     │
│    ↓ receives event path in pane                                │
│    ↓ reads /tmp/gsd-event-<id>.json                             │
│    ↓ executes mode logic (audit / block / augment)              │
│    ↓ writes /tmp/gsd-response-<id>.json (atomic)               │
│    ↓ runs notify-worker.sh → tmux send-keys into Worker pane    │
└────────────────────────────────┬────────────────────────────────┘
                                 │ tmux send-keys (response injected into Worker pane)
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│   tmux: gsd-worker (resumed)                                    │
│                                                                 │
│    ↓ hook polling loop detects response file → exits            │
│    ↓ Claude resumes                                             │
│    ↓ Observer response appears in pane as next user message     │
│    ↓ Worker Claude reads decision and acts accordingly          │
└─────────────────────────────────────────────────────────────────┘
```

**Key mechanism — how Worker Claude receives the Observer response:**

The Stop hook blocks (polling loop). When Observer writes the response file, `notify-worker.sh` immediately sends the response content into the Worker pane via `tmux send-keys`. Since the Worker pane's Claude is blocked waiting for the Stop hook to exit, the tmux-injected text queues in the terminal buffer. When the hook exits, Claude resumes and the queued text appears as the next user message in the conversation. This is the reliable injection path — no dependency on hook stdout being surfaced.

---

## Components

```
~/.claude/gsd-observer/
├── agents/
│   └── gsd-observer.md          # Observer Claude agent system prompt
├── hooks/
│   └── gsd-stop-hook.sh         # Stop hook for Worker (detects phase, blocks on response)
├── scripts/
│   ├── start-worker.sh          # Launch Worker tmux session with hooks configured
│   ├── start-observer.sh        # Launch Observer tmux session (Bash tool enabled)
│   ├── wake-observer.sh         # Sends event path to Observer pane
│   └── notify-worker.sh         # Observer injects response into Worker pane
└── schema/
    ├── event.json               # Annotated event payload example
    └── response.json            # Annotated response payload example
```

---

## GSD Phase Detection via Artifact Files

The Stop hook fires after each Claude response. It detects GSD phase completion by checking for artifact files modified within the last 30 seconds (configurable via `GSD_ARTIFACT_WINDOW_SECS`).

**Artifact file → phase mapping:**

| Artifact glob | Phase | Observer mode |
|---|---|---|
| `.planning/*/RESEARCH.md` | `research` | `audit` |
| `.planning/*/PLAN.md` | `plan` | `block` |
| `.planning/*/VERIFICATION.md` | `verify` | `audit` |
| `.planning/*/PLAN.md` + any `src/**` modified | `execute` | `augment` |

**Execution phase detection:**
Execute is detected when PLAN.md exists AND at least one source file outside `.planning/` was modified in the window. This is the most reliable heuristic for "code was written."

**Deduplication:** A sentinel file `/tmp/gsd-last-event-phase` stores the last triggered phase + file mtime. If the same file with the same mtime triggers again, the hook skips. This prevents duplicate events on consecutive Stop hook firings.

---

## Event Schema (`/tmp/gsd-event-<event_id>.json`)

```json
{
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

**Per-mode artifact requirements:**

| Mode | Required | Optional |
|---|---|---|
| `audit` | `plan` | `research`, `changed_files` |
| `block` | `plan` | — |
| `augment` | `plan`, `changed_files` | `test_results` (omit if no tests run) |

If a required artifact path does not exist on disk, the hook writes `null` for that field and logs a warning. Observer handles `null` artifact fields by noting the absence in observations.

---

## Response Schema (`/tmp/gsd-response-<event_id>.json`)

```json
{
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

**Decision enum (exhaustive):**

| Value | Meaning | `revision_instructions` | Worker hook behavior |
|---|---|---|---|
| `proceed` | Work is good, continue GSD | Omit or null | Exit hook, Worker continues |
| `revise` | Issues found, fix before next phase | Required (non-empty string) | Exit hook, injected message instructs Worker to fix |
| `hold` | Observer needs one more cycle | Omit | Hook resets poll timer for another 120s, Observer will write a follow-up response with same event_id |

**`hold` lifecycle:** Observer writes `decision=hold` to the base response file `/tmp/gsd-response-<event_id>.json`, then continues working. Within 120s it overwrites with a follow-up response (same path, new decision). The hook detects `hold`, resets the poll timer for another 120s, and re-polls the same base path. Max 3 hold cycles (360s total); after the 3rd `hold` the hook exits with `decision=proceed`.

---

## Stop Hook (`gsd-stop-hook.sh`)

Registered as a Stop hook in Worker's `.claude/settings.json`. Receives conversation JSON on stdin.

```
Flow:
1. Check GSD_OBSERVER_ENABLED env var — if unset, exit 0 immediately
2. Find artifact files modified within GSD_ARTIFACT_WINDOW_SECS (default 30)
3. If none found → exit 0 (no GSD phase detected)
4. Check deduplication sentinel → if same file+mtime seen → exit 0
5. Determine phase + observer_mode from artifact pattern
6. Generate event_id (uuidgen)
7. Collect changed_files (git diff --name-only HEAD or find -newer)
8. Run test results if .planning/*/PLAN.md includes test step (optional)
9. Write /tmp/gsd-event-<event_id>.json atomically (write .tmp then mv)
10. Update deduplication sentinel
11. Call wake-observer.sh <event_id> <observer_session> <observer_pane>
12. Poll loop:
      hold_count=0
      elapsed=0
      response_file="/tmp/gsd-response-${event_id}.json"  # single path, Observer overwrites on hold
      while elapsed < 120:
        if response_file exists AND jq .event_id matches:
          decision=$(jq -r .decision response_file)
          if decision == "hold":
            hold_count=$((hold_count+1))
            if hold_count >= 3: break (exit with proceed)
            elapsed=0  # reset timer for next 120s window
            continue polling
          else:
            break  # proceed or revise — exit polling
        sleep 1; elapsed=$((elapsed+1))
13. If timed out: log warning
14. Exit 0 (hook always exits 0 — never blocks Worker permanently)
```

**Atomic write:**
```bash
echo "$json" > /tmp/gsd-event-${event_id}.tmp
mv /tmp/gsd-event-${event_id}.tmp /tmp/gsd-event-${event_id}.json
```

**event_id mismatch handling:** Hook skips (does not delete) mismatched files and continues polling. Only acts on files where `jq .event_id` matches the current event.

---

## Signal Scripts

### `wake-observer.sh <event_id> <observer_session> <observer_pane>`

Uses arguments (not hardcoded values). Checks pane readiness before injecting.

```bash
#!/usr/bin/env bash
event_id="$1"
observer_session="$2"
observer_pane="$3"
full_target="${observer_session}:${observer_pane}"

# Wait up to 15s for Observer to be at prompt
for i in $(seq 1 15); do
  pane_content=$(tmux capture-pane -pt "$full_target" -l 5 2>/dev/null)
  if echo "$pane_content" | grep -qE '❯|>|\$|✓'; then
    break
  fi
  sleep 1
done

event_path="/tmp/gsd-event-${event_id}.json"
tmux send-keys -t "$full_target" \
  "Read ${event_path} and respond as GSD Observer. Write response to /tmp/gsd-response-${event_id}.json then run ~/.claude/gsd-observer/scripts/notify-worker.sh ${event_id}" \
  Enter
```

### `notify-worker.sh <event_id>`

Called by Observer (via Bash tool) after writing the response file. Injects the Observer response message into the Worker pane while the Worker's hook is still polling.

```bash
#!/usr/bin/env bash
event_id="$1"
response_file="/tmp/gsd-response-${event_id}.json"

if [ ! -f "$response_file" ]; then
  echo "[gsd-observer] ERROR: response file missing for event ${event_id}" >&2
  exit 1
fi

# Read worker target from event file (worker_pane is in the event, not the response)
event_file="/tmp/gsd-event-${event_id}.json"
worker_pane=$(jq -r .worker_pane "$event_file" 2>/dev/null)
if [ -z "$worker_pane" ] || [ "$worker_pane" = "null" ]; then
  echo "[gsd-observer] ERROR: cannot read worker_pane from event" >&2
  exit 1
fi

decision=$(jq -r .decision "$response_file")
message=$(jq -r .message "$response_file")
revision=$(jq -r '.revision_instructions // ""' "$response_file")

# Build human-readable injection
injection="[GSD Observer] Decision: ${decision}. ${message}"
if [ -n "$revision" ] && [ "$revision" != "null" ]; then
  injection="${injection} Instructions: ${revision}"
fi

# Inject into Worker pane (Worker Claude is blocked by hook, text queues in terminal buffer)
tmux send-keys -t "$worker_pane" "$injection" Enter
```

---

## Observer Agent (`~/.claude/gsd-observer/agents/gsd-observer.md`)

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

6. Run: `~/.claude/gsd-observer/scripts/notify-worker.sh <event_id>`

Keep `revision_instructions` specific and actionable — Worker Claude must be able to act on them without asking for clarification. Be concise. Do not ask questions back to the user.
```

**Observer process lifecycle:**
- Long-running interactive `claude` process in `gsd-observer` tmux session
- Bash tool enabled (required for running `notify-worker.sh`)
- Sits at prompt between events — no state carried between events
- Each event is fully self-contained via the event file

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Hook detects no GSD artifacts | Exit 0, no event created |
| Same artifact triggers twice (dedup) | Exit 0, skip |
| Observer not at prompt after 15s | `wake-observer.sh` injects anyway, logs warning |
| Observer doesn't respond in 120s | Hook exits 0, Worker continues unblocked |
| Response event_id mismatch | Hook skips file, continues polling until timeout |
| `hold` for >3 cycles | Hook exits with proceed after 3rd cycle |
| `notify-worker.sh` missing response file | Logs error to stderr, exits 1 |
| `notify-worker.sh` bad worker_pane value | Logs error to stderr, exits 1 |
| Malformed response JSON | Hook treats as no-response, continues polling until timeout |
| Observer Bash tool disabled | notify-worker.sh never runs → hook polls to timeout → Worker unblocked |

**Cleanup on session start:** `start-worker.sh` deletes `/tmp/gsd-event-*.json`, `/tmp/gsd-response-*.json`, `/tmp/gsd-last-event-phase` before launching.

---

## Session Startup

### Order

Start Observer first. Observer must be at prompt before Worker begins GSD workflow. `wake-observer.sh` has its own readiness check but it is best-effort.

### `start-observer.sh`

```bash
#!/usr/bin/env bash
tmux new-session -d -s gsd-observer 2>/dev/null || tmux kill-session -t gsd-observer && tmux new-session -d -s gsd-observer
tmux send-keys -t gsd-observer:0.0 "claude --allowedTools 'Bash,Read,Write,Glob,Grep'" Enter

# Wait for Claude prompt using pattern detection (not fixed sleep)
for i in $(seq 1 30); do
  pane=$(tmux capture-pane -pt gsd-observer:0.0 -l 5 2>/dev/null)
  if echo "$pane" | grep -qE '❯|>|\$|✓'; then
    echo "[gsd-observer] Observer ready"
    exit 0
  fi
  sleep 1
done
echo "[gsd-observer] WARNING: Observer may not be ready (prompt not detected)"
```

### `start-worker.sh`

```bash
#!/usr/bin/env bash
PROJECT_DIR="${1:-$(pwd)}"

# Cleanup stale temp files
rm -f /tmp/gsd-event-*.json /tmp/gsd-response-*.json /tmp/gsd-last-event-phase

tmux new-session -d -s gsd-worker 2>/dev/null || tmux kill-session -t gsd-worker && tmux new-session -d -s gsd-worker
tmux send-keys -t gsd-worker:0.0 "cd \"$PROJECT_DIR\" && export GSD_OBSERVER_ENABLED=1 && claude" Enter
echo "[gsd-worker] Worker ready at $PROJECT_DIR"
```

### Hook Registration (`.claude/settings.json` in project dir)

```json
{
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

### Verification

```bash
# Both sessions running
tmux ls | grep -E "gsd-worker|gsd-observer"

# Hook registered
cat .claude/settings.json | python3 -c "
import sys, json
s = json.load(sys.stdin)
hooks = s.get('hooks', {}).get('Stop', [])
print('Stop hook registered:', bool(hooks))
"

# Observer at prompt
tmux capture-pane -pt gsd-observer:0.0 -l 3
```

### Teardown

```bash
tmux kill-session -t gsd-worker
tmux kill-session -t gsd-observer
rm -f /tmp/gsd-event-*.json /tmp/gsd-response-*.json /tmp/gsd-last-event-phase
```

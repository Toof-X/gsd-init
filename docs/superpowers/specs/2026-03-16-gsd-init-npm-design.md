# gsd-init npm Package Design

**Date:** 2026-03-16
**Status:** Revised v4

---

## Overview

`gsd-init` is a zero-dependency npm package that sets up the GSD observer/worker tmux system in the current project directory. Run once via `npx gsd-init`; it shows a dry-run of what will change, asks for confirmation (skipped with `--yes`/`-y`), then installs.

**Assumes:** GSD (superpowers plugin) is already installed globally in Claude Code.

---

## Package Structure

```
gsd-init/
├── bin/
│   └── gsd-init.js              # CLI entrypoint (#!/usr/bin/env node)
├── templates/
│   ├── agents/
│   │   └── gsd-observer.md      # Observer agent system prompt
│   ├── hooks/
│   │   └── gsd-stop-hook.sh     # Worker Stop hook
│   ├── scripts/
│   │   ├── start-observer.sh
│   │   ├── start-worker.sh
│   │   ├── wake-observer.sh
│   │   ├── notify-worker.sh
│   │   ├── teardown.sh
│   │   └── verify.sh
│   └── schema/
│       ├── event.json
│       └── response.json
├── package.json
└── README.md
```

**Note:** `install.sh` from the live system is excluded from templates — the npm package is the replacement for it.

---

## CLI Behavior

### Node version check

At the very top of `bin/gsd-init.js`, before any `require` or logic, check `process.version`. If Node < 16, print `"gsd-init requires Node.js >= 16 (found <version>)"` and `process.exit(1)`. Use only syntax valid in Node 14+ for this check.

### Invocation

```bash
npx gsd-init
```

With `--yes` / `-y`: the dry-run output is still printed, but the confirmation prompt is skipped and all operations proceed unconditionally (including overwrites). `[skip]` entries are still skipped even with `--yes`.

### Flow

**Step 1 — Dry-run output**

Print every file that will be written with its status annotation, then print the confirmation prompt:

```
gsd-init — GSD Observer/Worker setup

Files to install:
  [create]    ~/.claude/gsd-observer/agents/gsd-observer.md
  [create]    ~/.claude/gsd-observer/hooks/gsd-stop-hook.sh
  [create]    ~/.claude/gsd-observer/scripts/start-observer.sh
  [create]    ~/.claude/gsd-observer/scripts/start-worker.sh
  [create]    ~/.claude/gsd-observer/scripts/wake-observer.sh
  [create]    ~/.claude/gsd-observer/scripts/notify-worker.sh
  [create]    ~/.claude/gsd-observer/scripts/teardown.sh
  [create]    ~/.claude/gsd-observer/scripts/verify.sh
  [create]    ~/.claude/gsd-observer/schema/event.json
  [create]    ~/.claude/gsd-observer/schema/response.json
  [create]    .claude/settings.json  (will be created with Stop hook)

Proceed? [y/N]
```

**Status annotations for template files:**
- `[create]` — file does not exist at destination
- `[overwrite]` — file exists at destination, will be replaced

**Status annotations for `.claude/settings.json`:**
- `[create]` — settings.json does not exist, will be created with Stop hook
- `[merge]` — settings.json exists, Stop hook entry will be appended
- `[skip]` — settings.json exists and gsd-stop-hook.sh is already registered; file will not be modified

**Step 2 — Confirmation**

Prompt: `Proceed? [y/N]` (default No). With `--yes`/`-y`, skip this prompt.

If the user answers N or presses Enter without input: print `"Aborted."` and `exit(0)`.

**Step 3 — Install**

Execute in this exact order:

1. Create `~/.claude/gsd-observer/{agents,hooks,scripts,schema}` directories (recursive, no-op if they exist). On any failure, print the error with the path and `exit(1)`.
2. Create `.claude/` in the current working directory if it does not exist. This is the **sole responsible step** for creating the project's `.claude/` directory. On failure, print the error with the path and `exit(1)`.
3. Copy each template file verbatim to its destination under `~/.claude/gsd-observer/`, preserving subdirectory structure: `templates/agents/gsd-observer.md` → `~/.claude/gsd-observer/agents/gsd-observer.md`, `templates/hooks/gsd-stop-hook.sh` → `~/.claude/gsd-observer/hooks/gsd-stop-hook.sh`, and so on. Overwrite if the file already exists.
4. Apply `fs.chmodSync(dest, 0o755)` to all 7 copied `.sh` files: `hooks/gsd-stop-hook.sh` + all 6 scripts (`start-observer.sh`, `start-worker.sh`, `wake-observer.sh`, `notify-worker.sh`, `teardown.sh`, `verify.sh`). Do **not** shell out via `child_process`.
5. Merge Stop hook into `./.claude/settings.json` per the merge logic below. The `.claude/` directory is guaranteed to exist by step 2 above.

**Step 4 — Summary**

```
Done! Next steps:
  1. Start Observer first:  ~/.claude/gsd-observer/scripts/start-observer.sh
  2. Start Worker:          ~/.claude/gsd-observer/scripts/start-worker.sh <project-dir>
  3. Run GSD in the Worker tmux pane — Observer will co-pilot automatically.

  Observer agent prompt: ~/.claude/gsd-observer/agents/gsd-observer.md
  Verify setup:          ~/.claude/gsd-observer/scripts/verify.sh

Teardown:
  ~/.claude/gsd-observer/scripts/teardown.sh
  (or manually: tmux kill-session -t gsd-worker && tmux kill-session -t gsd-observer &&
   rm -f /tmp/gsd-event-*.json /tmp/gsd-response-*.json /tmp/gsd-last-event-phase)
```

---

## settings.json Merge Logic

Target: `.claude/settings.json` in the current working directory. `.claude/` directory existence is guaranteed by Step 3, install step 2, before the merge runs.

```
Case 1: File does not exist
  → Write new file: { "hooks": { "Stop": [<gsd-entry>] } }
  → Dry-run annotation: [create]

Case 2: File exists, no "hooks" key
  → Read JSON, add "hooks": { "Stop": [<gsd-entry>] }, write back
  → Dry-run annotation: [merge]

Case 3: File exists, "hooks" key exists, no "Stop" key
  → Read JSON, add "Stop": [<gsd-entry>] inside existing "hooks", write back
  → Dry-run annotation: [merge]

Case 4: File exists, "Stop" array exists, gsd-stop-hook.sh not present
  → Append <gsd-entry> to existing "Stop" array, write back
  → Dry-run annotation: [merge]

Case 5: File exists, gsd-stop-hook.sh already registered
  → No-op — do not modify the file
  → Dry-run annotation: [skip]
```

**Detection of "already registered":** Check if any hook command string anywhere in the `Stop` array contains the substring `gsd-stop-hook.sh`.

**`<gsd-entry>` — exact structure:**

```json
{
  "matcher": "",
  "hooks": [
    {
      "type": "command",
      "command": "~/.claude/gsd-observer/hooks/gsd-stop-hook.sh"
    }
  ]
}
```

The `command` value is the **literal string** `~/.claude/gsd-observer/hooks/gsd-stop-hook.sh` with the tilde verbatim — do not expand `~` to `process.env.HOME` or an absolute path. Claude Code handles tilde expansion.

---

## Template Files

Template files in `templates/` are the exact scripts from the live GSD observer/worker system. No transformation at install time — copied verbatim.

`gsd-observer.md` is the system prompt / agent instructions file used when launching the Observer Claude session (referenced by `start-observer.sh`).

`teardown.sh` and `verify.sh` are convenience scripts; `verify.sh` checks that both tmux sessions are running and the hook is registered, `teardown.sh` kills sessions and cleans up `/tmp` files.

All 7 `.sh` files require `fs.chmodSync(dest, 0o755)`:
- `hooks/gsd-stop-hook.sh`
- `scripts/start-observer.sh`
- `scripts/start-worker.sh`
- `scripts/wake-observer.sh`
- `scripts/notify-worker.sh`
- `scripts/teardown.sh`
- `scripts/verify.sh`

---

## package.json

```json
{
  "name": "gsd-init",
  "version": "1.0.0",
  "description": "Set up GSD observer/worker tmux system in a project",
  "bin": {
    "gsd-init": "bin/gsd-init.js"
  },
  "files": ["bin", "templates", "README.md"],
  "engines": { "node": ">=16" },
  "license": "MIT"
}
```

Zero runtime dependencies. Node built-ins only: `fs`, `path`, `readline`, `os`.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| `.claude/settings.json` is malformed JSON | Print error with file path, `exit(1)` — do not write anything |
| Any failure creating `~/.claude/gsd-observer/` subdirs (permissions, path conflict, etc.) | Print error with path, `exit(1)` |
| Any failure creating `.claude/` in project dir | Print error with path, `exit(1)` |
| Node < 16 | Print version requirement (checked before any logic), `exit(1)` |
| User answers N or empty at confirmation prompt | Print "Aborted.", `exit(0)` |

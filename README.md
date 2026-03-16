# gsd-init

Set up the GSD observer/worker tmux system in your project.

## Usage

```bash
npx gsd-init
```

With auto-confirm:
```bash
npx gsd-init --yes
```

## What it does

1. Installs observer scripts to `~/.claude/gsd-observer/`
2. Registers a Stop hook in `.claude/settings.json`
3. Prints next steps for starting the observer and worker sessions

## Requirements

- Node.js >= 16
- tmux
- jq
- Claude Code CLI (`claude`)
- GSD (superpowers plugin) installed in Claude Code

## After install

```bash
# Start Observer session first
~/.claude/gsd-observer/scripts/start-observer.sh

# Start Worker session in your project directory
~/.claude/gsd-observer/scripts/start-worker.sh /path/to/project

# Verify setup
~/.claude/gsd-observer/scripts/verify.sh
```

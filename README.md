# gsd-init

Set up the GSD observer/worker tmux system in your project.

## Install

```bash
npm install -g gsd-init
```

## Commands

### `gsd-init init <project-name>`

Creates a project folder and installs all GSD files inside it:

```bash
gsd-init init my-project
```

Installs into `my-project/.gsd/` and registers the stop hook in `my-project/.claude/settings.json`.

To run inside an existing project directory:

```bash
cd my-project
npx gsd-init
```

### `gsd-init start`

Starts the observer and worker tmux sessions for the current project. Run from inside the project directory:

```bash
cd my-project
gsd-init start
```

- Creates sessions named `gsd-observer-<project>` and `gsd-worker-<project>`
- Opens Terminal windows attached to each session
- Observer session includes a listener daemon that auto-responds to GSD phase events

### `gsd-init teardown`

Kills all GSD tmux sessions for the current project:

```bash
cd my-project
gsd-init teardown
```

## How it works

```
my-project/
├── .gsd/
│   ├── agents/gsd-observer.md       # Observer Claude agent prompt
│   ├── hooks/gsd-stop-hook.sh       # Fires after each Claude response in Worker
│   ├── scripts/
│   │   ├── start.sh                 # Start observer + worker (used by gsd-init start)
│   │   ├── start-observer.sh        # Start observer tmux session
│   │   ├── start-worker.sh          # Start worker tmux session
│   │   ├── listen.sh                # Daemon: watches for events, wakes Observer
│   │   ├── notify-worker.sh         # Injects Observer response into Worker pane
│   │   ├── wake-observer.sh         # Sends event task to Observer Claude
│   │   ├── teardown.sh              # Kill all sessions (used by gsd-init teardown)
│   │   └── verify.sh                # Verify setup is working
│   └── schema/
│       ├── event.json               # Event file schema
│       └── response.json            # Response file schema
└── .claude/
    └── settings.json                # Stop hook registered here
```

**Observer session** runs two panes:
- Pane 0: Observer Claude — reviews GSD phase outputs and responds
- Pane 1: Listener daemon — polls for new events and wakes Claude automatically

**Worker session** runs Claude with `GSD_OBSERVER_ENABLED=1`, which activates the stop hook after each response.

## Requirements

- Node.js >= 16
- tmux
- jq
- Claude Code CLI (`claude`)
- GSD (superpowers plugin) installed in Claude Code

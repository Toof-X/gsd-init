# gsd-init npm Package Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a zero-dependency npm package (`gsd-init`) that installs the GSD observer/worker tmux system into any project via `npx gsd-init`.

**Architecture:** Single CLI entry point (`bin/gsd-init.js`) with pure logic functions exported for testing. Templates are the live scripts copied verbatim from `~/.claude/gsd-observer/`. Tests use Node's built-in `assert` module (no test framework needed, zero deps, works in Node 16+).

**Tech Stack:** Node.js >= 16, built-ins only (`fs`, `path`, `os`, `readline`). No npm dependencies.

**Spec:** `docs/superpowers/specs/2026-03-16-gsd-init-npm-design.md`

**Live scripts source:** `~/.claude/gsd-observer/` (already implemented)

---

## File Structure

```
~/gsd-init/
├── bin/
│   └── gsd-init.js              # CLI entrypoint — all logic + module.exports for tests
├── templates/
│   ├── agents/
│   │   └── gsd-observer.md      # copied from ~/.claude/gsd-observer/agents/
│   ├── hooks/
│   │   └── gsd-stop-hook.sh     # copied from ~/.claude/gsd-observer/hooks/
│   ├── scripts/
│   │   ├── start-observer.sh    # copied from ~/.claude/gsd-observer/scripts/
│   │   ├── start-worker.sh
│   │   ├── wake-observer.sh
│   │   ├── notify-worker.sh
│   │   ├── teardown.sh
│   │   └── verify.sh
│   └── schema/
│       ├── event.json           # copied from ~/.claude/gsd-observer/schema/
│       └── response.json
├── tests/
│   ├── test-plan-install.js     # tests planInstall() and getSettingsLabel()
│   ├── test-merge-settings.js   # tests mergeSettings() — all 5 cases
│   └── test-integration.js      # end-to-end: full run() with --yes in temp dir
├── package.json
└── README.md
```

**Key design decision:** All logic lives in `bin/gsd-init.js` with `module.exports` at the bottom. Tests `require('../bin/gsd-init')` directly. The CLI runs only when `require.main === module`.

---

## Chunk 1: Package Scaffold + Template Files

### Task 1: Create directory structure and package.json

**Files:**
- Create: `~/gsd-init/bin/`
- Create: `~/gsd-init/templates/agents/`
- Create: `~/gsd-init/templates/hooks/`
- Create: `~/gsd-init/templates/scripts/`
- Create: `~/gsd-init/templates/schema/`
- Create: `~/gsd-init/tests/`
- Create: `~/gsd-init/package.json`

- [ ] **Step 1: Create directories**

```bash
mkdir -p ~/gsd-init/bin ~/gsd-init/templates/{agents,hooks,scripts,schema} ~/gsd-init/tests
```

- [ ] **Step 2: Verify structure**

```bash
ls ~/gsd-init/
```

Expected:
```
bin  templates  tests
```

- [ ] **Step 3: Write package.json**

Create `~/gsd-init/package.json`:

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
  "license": "MIT",
  "scripts": {
    "test": "node tests/test-plan-install.js && node tests/test-merge-settings.js && node tests/test-integration.js"
  }
}
```

- [ ] **Step 4: Verify package.json is valid JSON**

```bash
node -e "require('./package.json'); console.log('OK')" ~/gsd-init
```

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
cd ~/gsd-init && git init && git add package.json && git commit -m "chore: init gsd-init package scaffold"
```

---

### Task 2: Populate template files from live scripts

**Files:**
- Create: `~/gsd-init/templates/agents/gsd-observer.md`
- Create: `~/gsd-init/templates/hooks/gsd-stop-hook.sh`
- Create: `~/gsd-init/templates/scripts/start-observer.sh`
- Create: `~/gsd-init/templates/scripts/start-worker.sh`
- Create: `~/gsd-init/templates/scripts/wake-observer.sh`
- Create: `~/gsd-init/templates/scripts/notify-worker.sh`
- Create: `~/gsd-init/templates/scripts/teardown.sh`
- Create: `~/gsd-init/templates/scripts/verify.sh`
- Create: `~/gsd-init/templates/schema/event.json`
- Create: `~/gsd-init/templates/schema/response.json`

- [ ] **Step 1: Copy template files verbatim from live scripts**

```bash
cp ~/.claude/gsd-observer/agents/gsd-observer.md ~/gsd-init/templates/agents/
cp ~/.claude/gsd-observer/hooks/gsd-stop-hook.sh ~/gsd-init/templates/hooks/
cp ~/.claude/gsd-observer/scripts/start-observer.sh ~/gsd-init/templates/scripts/
cp ~/.claude/gsd-observer/scripts/start-worker.sh ~/gsd-init/templates/scripts/
cp ~/.claude/gsd-observer/scripts/wake-observer.sh ~/gsd-init/templates/scripts/
cp ~/.claude/gsd-observer/scripts/notify-worker.sh ~/gsd-init/templates/scripts/
cp ~/.claude/gsd-observer/scripts/teardown.sh ~/gsd-init/templates/scripts/
cp ~/.claude/gsd-observer/scripts/verify.sh ~/gsd-init/templates/scripts/
cp ~/.claude/gsd-observer/schema/event.json ~/gsd-init/templates/schema/
cp ~/.claude/gsd-observer/schema/response.json ~/gsd-init/templates/schema/
```

- [ ] **Step 2: Verify all 10 template files exist**

```bash
find ~/gsd-init/templates -type f | sort
```

Expected (10 files):
```
/Users/<user>/gsd-init/templates/agents/gsd-observer.md
/Users/<user>/gsd-init/templates/hooks/gsd-stop-hook.sh
/Users/<user>/gsd-init/templates/schema/event.json
/Users/<user>/gsd-init/templates/schema/response.json
/Users/<user>/gsd-init/templates/scripts/notify-worker.sh
/Users/<user>/gsd-init/templates/scripts/start-observer.sh
/Users/<user>/gsd-init/templates/scripts/start-worker.sh
/Users/<user>/gsd-init/templates/scripts/teardown.sh
/Users/<user>/gsd-init/templates/scripts/verify.sh
/Users/<user>/gsd-init/templates/scripts/wake-observer.sh
```

- [ ] **Step 3: Verify scripts are NOT already chmod'd in templates (npm sets perms on publish, not pre-publish)**

```bash
ls -la ~/gsd-init/templates/hooks/ ~/gsd-init/templates/scripts/
```

Note: actual chmod happens at install time via `fs.chmodSync`. Template files just need to exist with readable content.

- [ ] **Step 4: Commit templates**

```bash
cd ~/gsd-init && git add templates/ && git commit -m "feat: add template files from live gsd-observer scripts"
```

---

## Chunk 2: CLI Logic (TDD)

### Task 3: Write planInstall() and getSettingsLabel() with tests

**Files:**
- Create: `~/gsd-init/bin/gsd-init.js` (initial skeleton with planInstall)
- Create: `~/gsd-init/tests/test-plan-install.js`

- [ ] **Step 1: Write the failing test first**

Create `~/gsd-init/tests/test-plan-install.js`:

```js
'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { planInstall, getSettingsLabel, TEMPLATE_FILES } = require('../bin/gsd-init');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-test-'));
const fakeObsRoot = path.join(tmpDir, 'obs-root');
const fakeProjDir = path.join(tmpDir, 'project');
const fakeTemplatesDir = path.join(tmpDir, 'templates');
fs.mkdirSync(fakeProjDir, { recursive: true });
fs.mkdirSync(path.join(fakeProjDir, '.claude'), { recursive: true });

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓ ' + name); passed++; }
  catch (e) { console.log('  ✗ ' + name + ': ' + e.message); failed++; }
}

test('planInstall returns N+1 ops (N template files + settings)', () => {
  const ops = planInstall(fakeTemplatesDir, fakeObsRoot, fakeProjDir);
  assert.strictEqual(ops.length, TEMPLATE_FILES.length + 1);
});

test('all template ops are [create] when obs root is empty', () => {
  const ops = planInstall(fakeTemplatesDir, fakeObsRoot, fakeProjDir);
  const tmplOps = ops.slice(0, TEMPLATE_FILES.length);
  assert(tmplOps.every(op => op.label === '[create]'), 'expected all [create]');
});

test('settings.json op is [create] when file does not exist', () => {
  const ops = planInstall(fakeTemplatesDir, fakeObsRoot, fakeProjDir);
  const last = ops[ops.length - 1];
  assert.strictEqual(last.label, '[create]');
  assert.strictEqual(last.relative, '.claude/settings.json');
});

test('template op becomes [overwrite] when dest file exists', () => {
  fs.mkdirSync(path.join(fakeObsRoot, 'agents'), { recursive: true });
  fs.writeFileSync(path.join(fakeObsRoot, 'agents/gsd-observer.md'), 'old');
  const ops = planInstall(fakeTemplatesDir, fakeObsRoot, fakeProjDir);
  const agentOp = ops.find(op => op.relative.includes('gsd-observer.md'));
  assert.strictEqual(agentOp.label, '[overwrite]');
});

test('getSettingsLabel returns [skip] when hook already registered', () => {
  const settingsPath = path.join(fakeProjDir, '.claude', 'settings.json');
  const existing = { hooks: { Stop: [{ hooks: [{ type: 'command', command: '~/.claude/gsd-observer/hooks/gsd-stop-hook.sh' }] }] } };
  fs.writeFileSync(settingsPath, JSON.stringify(existing));
  const label = getSettingsLabel(settingsPath);
  assert.strictEqual(label, '[skip]');
  fs.unlinkSync(settingsPath);
});

test('getSettingsLabel returns [merge] when settings.json has no Stop hook', () => {
  const settingsPath = path.join(fakeProjDir, '.claude', 'settings.json');
  fs.writeFileSync(settingsPath, JSON.stringify({ hooks: {} }));
  const label = getSettingsLabel(settingsPath);
  assert.strictEqual(label, '[merge]');
  fs.unlinkSync(settingsPath);
});

test('getSettingsLabel returns [error] when settings.json is malformed JSON', () => {
  const settingsPath = path.join(fakeProjDir, '.claude', 'settings.json');
  fs.writeFileSync(settingsPath, 'not-json{{{');
  const label = getSettingsLabel(settingsPath);
  assert.strictEqual(label, '[error]');
  fs.unlinkSync(settingsPath);
});

test('each op has dest, label, and relative fields', () => {
  const ops = planInstall(fakeTemplatesDir, fakeObsRoot, fakeProjDir);
  for (const op of ops) {
    assert(op.dest, 'missing dest');
    assert(op.label, 'missing label');
    assert(op.relative, 'missing relative');
  }
});

fs.rmSync(tmpDir, { recursive: true, force: true });
console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run test to verify it fails (module not found)**

```bash
cd ~/gsd-init && node tests/test-plan-install.js
```

Expected: `Error: Cannot find module '../bin/gsd-init'`

- [ ] **Step 3: Write minimal gsd-init.js with planInstall, getSettingsLabel, TEMPLATE_FILES**

Create `~/gsd-init/bin/gsd-init.js`:

```js
#!/usr/bin/env node
// Node version check — syntax must be valid in Node 14+
var major = parseInt(process.version.slice(1).split('.')[0], 10);
if (major < 16) {
  process.stderr.write('gsd-init requires Node.js >= 16 (found ' + process.version + ')\n');
  process.exit(1);
}

'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');
const OBS_ROOT = path.join(os.homedir(), '.claude', 'gsd-observer');

const TEMPLATE_FILES = [
  { src: 'agents/gsd-observer.md',      dst: 'agents/gsd-observer.md' },
  { src: 'hooks/gsd-stop-hook.sh',      dst: 'hooks/gsd-stop-hook.sh' },
  { src: 'scripts/start-observer.sh',   dst: 'scripts/start-observer.sh' },
  { src: 'scripts/start-worker.sh',     dst: 'scripts/start-worker.sh' },
  { src: 'scripts/wake-observer.sh',    dst: 'scripts/wake-observer.sh' },
  { src: 'scripts/notify-worker.sh',    dst: 'scripts/notify-worker.sh' },
  { src: 'scripts/teardown.sh',         dst: 'scripts/teardown.sh' },
  { src: 'scripts/verify.sh',           dst: 'scripts/verify.sh' },
  { src: 'schema/event.json',           dst: 'schema/event.json' },
  { src: 'schema/response.json',        dst: 'schema/response.json' },
];

const SH_FILES = [
  'hooks/gsd-stop-hook.sh',
  'scripts/start-observer.sh',
  'scripts/start-worker.sh',
  'scripts/wake-observer.sh',
  'scripts/notify-worker.sh',
  'scripts/teardown.sh',
  'scripts/verify.sh',
];

const GSD_ENTRY = {
  matcher: '',
  hooks: [{ type: 'command', command: '~/.claude/gsd-observer/hooks/gsd-stop-hook.sh' }]
};

function getSettingsLabel(settingsPath) {
  if (!fs.existsSync(settingsPath)) return '[create]';
  let data;
  try { data = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); }
  catch (e) { return '[error]'; }
  const stopArr = ((data.hooks || {}).Stop) || [];
  const alreadyRegistered = stopArr.some(function(entry) {
    return JSON.stringify(entry).includes('gsd-stop-hook.sh');
  });
  return alreadyRegistered ? '[skip]' : '[merge]';
}

function planInstall(tmplDir, obsRoot, projDir) {
  var ops = [];
  for (var i = 0; i < TEMPLATE_FILES.length; i++) {
    var f = TEMPLATE_FILES[i];
    var dest = path.join(obsRoot, f.dst);
    var label = fs.existsSync(dest) ? '[overwrite]' : '[create]';
    ops.push({ dest: dest, label: label, relative: '~/.claude/gsd-observer/' + f.dst });
  }
  var settingsPath = path.join(projDir, '.claude', 'settings.json');
  ops.push({ dest: settingsPath, label: getSettingsLabel(settingsPath), relative: '.claude/settings.json' });
  return ops;
}

// Stub remaining functions — implemented in later tasks
function formatDryRun(ops) { return ''; }
function mkdirpSync(dir) { fs.mkdirSync(dir, { recursive: true }); }
function copyTemplates(tmplDir, obsRoot) {}
function chmodScripts(obsRoot) {}
function mergeSettings(projDir, entry) {}
function printSummary() {}
function prompt(question) { return Promise.resolve(false); }

async function run() {}

if (require.main === module) {
  run().catch(function(e) { console.error(e.message); process.exit(1); });
}

module.exports = {
  planInstall, getSettingsLabel, formatDryRun, mkdirpSync,
  copyTemplates, chmodScripts, mergeSettings, printSummary,
  TEMPLATE_FILES, SH_FILES, GSD_ENTRY
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd ~/gsd-init && node tests/test-plan-install.js
```

Expected:
```
  ✓ planInstall returns N+1 ops (N template files + settings)
  ✓ all template ops are [create] when obs root is empty
  ...
Results: 8 passed, 0 failed
```

- [ ] **Step 5: Commit**

```bash
cd ~/gsd-init && git add bin/gsd-init.js tests/test-plan-install.js && git commit -m "feat: add planInstall() and getSettingsLabel() with tests"
```

---

### Task 4: Implement mergeSettings() with tests for all 5 cases

**Files:**
- Modify: `~/gsd-init/bin/gsd-init.js` (implement mergeSettings)
- Create: `~/gsd-init/tests/test-merge-settings.js`

- [ ] **Step 1: Write the failing test**

Create `~/gsd-init/tests/test-merge-settings.js`:

```js
'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { mergeSettings, GSD_ENTRY } = require('../bin/gsd-init');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-merge-'));
const projDir = path.join(tmpDir, 'project');
const claudeDir = path.join(projDir, '.claude');
fs.mkdirSync(claudeDir, { recursive: true });
const settingsPath = path.join(claudeDir, 'settings.json');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓ ' + name); passed++; }
  catch (e) { console.log('  ✗ ' + name + ': ' + e.message); failed++; }
  // reset for next test
  try { fs.unlinkSync(settingsPath); } catch (e) {}
}

// Case 1: file does not exist → create with Stop hook
test('Case 1: creates settings.json when file does not exist', () => {
  mergeSettings(projDir, GSD_ENTRY);
  assert(fs.existsSync(settingsPath), 'settings.json should exist');
  const data = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  assert.deepStrictEqual(data.hooks.Stop, [GSD_ENTRY]);
});

// Case 2: file exists, no "hooks" key
test('Case 2: adds hooks.Stop when no hooks key exists', () => {
  fs.writeFileSync(settingsPath, JSON.stringify({ someOtherKey: true }));
  mergeSettings(projDir, GSD_ENTRY);
  const data = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  assert.deepStrictEqual(data.hooks.Stop, [GSD_ENTRY]);
  assert.strictEqual(data.someOtherKey, true, 'existing keys preserved');
});

// Case 3: file exists, "hooks" key exists, no "Stop" key
test('Case 3: adds Stop array when hooks exists but no Stop key', () => {
  fs.writeFileSync(settingsPath, JSON.stringify({ hooks: { PreToolUse: [] } }));
  mergeSettings(projDir, GSD_ENTRY);
  const data = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  assert.deepStrictEqual(data.hooks.Stop, [GSD_ENTRY]);
  assert.deepStrictEqual(data.hooks.PreToolUse, [], 'existing hooks preserved');
});

// Case 4: file exists, Stop array exists, hook not present → append
test('Case 4: appends gsd entry to existing Stop array', () => {
  const existing = { hooks: { Stop: [{ matcher: '', hooks: [{ type: 'command', command: 'other-hook.sh' }] }] } };
  fs.writeFileSync(settingsPath, JSON.stringify(existing));
  mergeSettings(projDir, GSD_ENTRY);
  const data = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  assert.strictEqual(data.hooks.Stop.length, 2);
  assert.deepStrictEqual(data.hooks.Stop[1], GSD_ENTRY);
});

// Case 5: gsd-stop-hook.sh already registered → no-op
test('Case 5: no-op when gsd-stop-hook.sh already registered', () => {
  const existing = { hooks: { Stop: [GSD_ENTRY] } };
  fs.writeFileSync(settingsPath, JSON.stringify(existing));
  const before = fs.readFileSync(settingsPath, 'utf8');
  mergeSettings(projDir, GSD_ENTRY);
  const after = fs.readFileSync(settingsPath, 'utf8');
  assert.strictEqual(before, after, 'file should not be modified');
});

// Case 6: gsd-stop-hook.sh registered in nested command string
test('Case 5b: no-op when hook is registered in nested structure', () => {
  const existing = { hooks: { Stop: [{ matcher: 'foo', hooks: [{ type: 'command', command: '~/.claude/gsd-observer/hooks/gsd-stop-hook.sh' }] }] } };
  fs.writeFileSync(settingsPath, JSON.stringify(existing));
  mergeSettings(projDir, GSD_ENTRY);
  const data = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  assert.strictEqual(data.hooks.Stop.length, 1, 'should not append duplicate');
});

// Malformed JSON → throw error
test('throws on malformed JSON', () => {
  fs.writeFileSync(settingsPath, '{ invalid json');
  assert.throws(() => mergeSettings(projDir, GSD_ENTRY), /Malformed JSON/);
});

// Output is valid JSON with 2-space indent
test('output is formatted JSON (2-space indent)', () => {
  mergeSettings(projDir, GSD_ENTRY);
  const raw = fs.readFileSync(settingsPath, 'utf8');
  assert(raw.includes('  "hooks"'), 'should be 2-space indented');
});

fs.rmSync(tmpDir, { recursive: true, force: true });
console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/gsd-init && node tests/test-merge-settings.js
```

Expected: Multiple `✗` failures since mergeSettings is a stub.

- [ ] **Step 3: Implement mergeSettings() in gsd-init.js**

Replace the stub in `~/gsd-init/bin/gsd-init.js`:

```js
function mergeSettings(projDir, entry) {
  var settingsPath = path.join(projDir, '.claude', 'settings.json');
  if (!fs.existsSync(settingsPath)) {
    var newData = { hooks: { Stop: [entry] } };
    fs.writeFileSync(settingsPath, JSON.stringify(newData, null, 2) + '\n');
    return;
  }
  var raw = fs.readFileSync(settingsPath, 'utf8');
  var data;
  try { data = JSON.parse(raw); }
  catch (e) { throw new Error('Malformed JSON in ' + settingsPath + ': ' + e.message); }

  var stopArr = (data.hooks && data.hooks.Stop) ? data.hooks.Stop : [];
  var alreadyRegistered = stopArr.some(function(e) {
    return JSON.stringify(e).includes('gsd-stop-hook.sh');
  });
  if (alreadyRegistered) return;

  if (!data.hooks) data.hooks = {};
  if (!data.hooks.Stop) data.hooks.Stop = [];
  data.hooks.Stop.push(entry);
  fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2) + '\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd ~/gsd-init && node tests/test-merge-settings.js
```

Expected:
```
  ✓ Case 1: creates settings.json when file does not exist
  ✓ Case 2: adds hooks.Stop when no hooks key exists
  ...
Results: 8 passed, 0 failed
```

- [ ] **Step 5: Commit**

```bash
cd ~/gsd-init && git add bin/gsd-init.js tests/test-merge-settings.js && git commit -m "feat: implement mergeSettings() with all 5 cases"
```

---

### Task 5: Implement copyTemplates(), chmodScripts(), formatDryRun()

**Files:**
- Modify: `~/gsd-init/bin/gsd-init.js` (implement copyTemplates, chmodScripts, formatDryRun)

These functions are testable via the integration test (Task 7). For now, implement them directly:

- [ ] **Step 1: Replace stubs in gsd-init.js**

Replace the stub implementations:

```js
function formatDryRun(ops) {
  var lines = ['gsd-init \u2014 GSD Observer/Worker setup', '', 'Files to install:'];
  for (var i = 0; i < ops.length; i++) {
    var op = ops[i];
    lines.push('  ' + op.label + Array(14 - op.label.length).join(' ') + op.relative);
  }
  return lines.join('\n');
}

function copyTemplates(tmplDir, obsRoot) {
  for (var i = 0; i < TEMPLATE_FILES.length; i++) {
    var f = TEMPLATE_FILES[i];
    var src = path.join(tmplDir, f.src);
    var dest = path.join(obsRoot, f.dst);
    mkdirpSync(path.dirname(dest));
    fs.copyFileSync(src, dest);
  }
}

function chmodScripts(obsRoot) {
  for (var i = 0; i < SH_FILES.length; i++) {
    fs.chmodSync(path.join(obsRoot, SH_FILES[i]), 0o755);
  }
}
```

- [ ] **Step 2: Verify formatDryRun output manually**

```bash
cd ~/gsd-init && node -e "
const { planInstall, formatDryRun, TEMPLATE_FILES } = require('./bin/gsd-init');
const os = require('os'), path = require('path');
const ops = planInstall('./templates', path.join(os.homedir(), '.claude', 'gsd-observer-test'), process.cwd());
console.log(formatDryRun(ops));
"
```

Expected output:
```
gsd-init — GSD Observer/Worker setup

Files to install:
  [create]      ~/.claude/gsd-observer/agents/gsd-observer.md
  [create]      ~/.claude/gsd-observer/hooks/gsd-stop-hook.sh
  ...
  [skip]        .claude/settings.json
```
(Labels vary based on existing state of `~/.claude/gsd-observer-test`)

- [ ] **Step 3: Commit**

```bash
cd ~/gsd-init && git add bin/gsd-init.js && git commit -m "feat: implement copyTemplates, chmodScripts, formatDryRun"
```

---

## Chunk 3: CLI Entrypoint + Integration Test

### Task 6: Implement confirmation prompt and printSummary()

**Files:**
- Modify: `~/gsd-init/bin/gsd-init.js` (implement prompt, printSummary, run)

- [ ] **Step 1: Replace prompt, printSummary, and run stubs**

```js
function prompt(question) {
  return new Promise(function(resolve) {
    var rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, function(answer) {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

function printSummary() {
  console.log([
    '',
    'Done! Next steps:',
    '  1. Start Observer first:  ~/.claude/gsd-observer/scripts/start-observer.sh',
    '  2. Start Worker:          ~/.claude/gsd-observer/scripts/start-worker.sh <project-dir>',
    '  3. Run GSD in the Worker tmux pane \u2014 Observer will co-pilot automatically.',
    '',
    '  Observer agent prompt: ~/.claude/gsd-observer/agents/gsd-observer.md',
    '  Verify setup:          ~/.claude/gsd-observer/scripts/verify.sh',
    '',
    'Teardown:',
    '  ~/.claude/gsd-observer/scripts/teardown.sh',
    '  (or manually: tmux kill-session -t gsd-worker && tmux kill-session -t gsd-observer &&',
    '   rm -f /tmp/gsd-event-*.json /tmp/gsd-response-*.json /tmp/gsd-last-event-phase)',
  ].join('\n'));
}

async function run() {
  var args = process.argv.slice(2);
  var skipPrompt = args.indexOf('--yes') !== -1 || args.indexOf('-y') !== -1;
  var projDir = process.cwd();

  var ops = planInstall(TEMPLATES_DIR, OBS_ROOT, projDir);

  // Abort on malformed settings.json early
  var errOp = null;
  for (var i = 0; i < ops.length; i++) {
    if (ops[i].label === '[error]') { errOp = ops[i]; break; }
  }
  if (errOp) {
    console.error('Error: Malformed JSON in ' + errOp.dest + ' — fix or remove it and retry.');
    process.exit(1);
  }

  console.log(formatDryRun(ops));
  console.log('');
  console.log('Proceed? [y/N]');

  if (!skipPrompt) {
    var proceed = await prompt('');
    if (!proceed) {
      console.log('Aborted.');
      process.exit(0);
    }
  }

  // Step 1: create ~/.claude/gsd-observer subdirs
  var subdirs = ['agents', 'hooks', 'scripts', 'schema'];
  for (var j = 0; j < subdirs.length; j++) {
    var subdir = path.join(OBS_ROOT, subdirs[j]);
    try { mkdirpSync(subdir); }
    catch (e) { console.error('Error creating ' + subdir + ': ' + e.message); process.exit(1); }
  }

  // Step 2: create project .claude/
  var dotClaudeDir = path.join(projDir, '.claude');
  try { mkdirpSync(dotClaudeDir); }
  catch (e) { console.error('Error creating ' + dotClaudeDir + ': ' + e.message); process.exit(1); }

  // Step 3: copy templates
  copyTemplates(TEMPLATES_DIR, OBS_ROOT);

  // Step 4: chmod .sh files
  chmodScripts(OBS_ROOT);

  // Step 5: merge settings.json
  try { mergeSettings(projDir, GSD_ENTRY); }
  catch (e) { console.error(e.message); process.exit(1); }

  printSummary();
}
```

- [ ] **Step 2: Verify the module still loads without errors**

```bash
cd ~/gsd-init && node -e "require('./bin/gsd-init'); console.log('module loads OK')"
```

Expected: `module loads OK`

- [ ] **Step 3: Commit**

```bash
cd ~/gsd-init && git add bin/gsd-init.js && git commit -m "feat: implement run(), prompt(), printSummary()"
```

---

### Task 7: Write end-to-end integration test

**Files:**
- Create: `~/gsd-init/tests/test-integration.js`

- [ ] **Step 1: Write the integration test**

Create `~/gsd-init/tests/test-integration.js`:

```js
'use strict';
// Integration test: runs the full install flow in a temp dir using --yes flag.
// Does NOT modify ~/.claude/gsd-observer or any real system directories.

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');

const GSD_INIT = path.join(__dirname, '..', 'bin', 'gsd-init.js');
const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓ ' + name); passed++; }
  catch (e) { console.log('  ✗ ' + name + ': ' + e.message); failed++; }
}

// Helper: run gsd-init.js with overridden env vars pointing to temp dirs
function runGsdInit(projDir, obsRoot, extraArgs) {
  var args = [GSD_INIT].concat(extraArgs || []);
  var env = Object.assign({}, process.env, {
    // Override internal paths via env — we patch the module for testing
    GSD_INIT_OBS_ROOT: obsRoot,
    GSD_INIT_PROJ_DIR: projDir,
  });
  return execFileSync(process.execPath, args, {
    env: env,
    cwd: projDir,
    encoding: 'utf8',
    timeout: 10000,
  });
}

// Note: To allow test path injection, the run() function must respect
// GSD_INIT_OBS_ROOT and GSD_INIT_PROJ_DIR env vars. See implementation note.

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-integ-'));
const obsRoot = path.join(tmpDir, 'gsd-observer');
const projDir = path.join(tmpDir, 'project');
fs.mkdirSync(projDir, { recursive: true });

test('full install with --yes creates all template files', () => {
  const output = runGsdInit(projDir, obsRoot, ['--yes']);

  // All 10 template files should exist
  const expectedFiles = [
    'agents/gsd-observer.md',
    'hooks/gsd-stop-hook.sh',
    'scripts/start-observer.sh',
    'scripts/start-worker.sh',
    'scripts/wake-observer.sh',
    'scripts/notify-worker.sh',
    'scripts/teardown.sh',
    'scripts/verify.sh',
    'schema/event.json',
    'schema/response.json',
  ];
  for (const f of expectedFiles) {
    const dest = path.join(obsRoot, f);
    assert(fs.existsSync(dest), 'missing: ' + dest);
  }
});

test('all 7 .sh files are chmod 755 after install', () => {
  const shFiles = [
    'hooks/gsd-stop-hook.sh',
    'scripts/start-observer.sh',
    'scripts/start-worker.sh',
    'scripts/wake-observer.sh',
    'scripts/notify-worker.sh',
    'scripts/teardown.sh',
    'scripts/verify.sh',
  ];
  for (const f of shFiles) {
    const dest = path.join(obsRoot, f);
    const mode = fs.statSync(dest).mode;
    const perms = mode & 0o777;
    assert.strictEqual(perms, 0o755, f + ' should be 0755, got ' + perms.toString(8));
  }
});

test('settings.json is created with Stop hook', () => {
  const settingsPath = path.join(projDir, '.claude', 'settings.json');
  assert(fs.existsSync(settingsPath), 'settings.json should exist');
  const data = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const stopArr = data.hooks && data.hooks.Stop;
  assert(Array.isArray(stopArr) && stopArr.length > 0, 'Stop hooks array should be non-empty');
  const hasHook = JSON.stringify(stopArr).includes('gsd-stop-hook.sh');
  assert(hasHook, 'Stop hook should reference gsd-stop-hook.sh');
});

test('hook command uses literal tilde (not expanded path)', () => {
  const settingsPath = path.join(projDir, '.claude', 'settings.json');
  const raw = fs.readFileSync(settingsPath, 'utf8');
  assert(raw.includes('~/.claude/gsd-observer/hooks/gsd-stop-hook.sh'),
    'hook command should use literal tilde');
  assert(!raw.includes('/Users/'), 'hook command should not expand ~ to absolute path');
  assert(!raw.includes('/home/'), 'hook command should not expand ~ to absolute path');
});

test('output includes "Done! Next steps:" summary', () => {
  // Re-run to get fresh output (obsRoot already exists, will be [overwrite])
  const output = runGsdInit(projDir, obsRoot, ['--yes']);
  assert(output.includes('Done! Next steps:'), 'output should contain summary');
  assert(output.includes('start-observer.sh'), 'summary should mention start-observer');
});

test('second run with --yes shows [overwrite] for existing files', () => {
  const output = runGsdInit(projDir, obsRoot, ['--yes']);
  assert(output.includes('[overwrite]'), 'second run should show [overwrite]');
  assert(!output.includes('[create]'), 'second run should not show [create] for templates');
});

test('second run with --yes shows [skip] for settings.json', () => {
  const output = runGsdInit(projDir, obsRoot, ['--yes']);
  assert(output.includes('[skip]'), 'second run should show [skip] for settings.json');
});

test('-y flag works same as --yes', () => {
  const output = runGsdInit(projDir, obsRoot, ['-y']);
  assert(output.includes('Done! Next steps:'), '-y flag should work');
});

fs.rmSync(tmpDir, { recursive: true, force: true });
console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
```

> **Implementation note for integration test path injection:** The `run()` function must check env vars `GSD_INIT_OBS_ROOT` and `GSD_INIT_PROJ_DIR` to allow test path injection. See Task 8 below.

- [ ] **Step 2: Run test to verify it fails (expected — env var injection not yet implemented)**

```bash
cd ~/gsd-init && node tests/test-integration.js
```

Expected: failures about files not in expected locations (real `~/.claude/gsd-observer` used instead of temp)

- [ ] **Step 3: Commit test file**

```bash
cd ~/gsd-init && git add tests/test-integration.js && git commit -m "test: add end-to-end integration test"
```

---

### Task 8: Add env-var path injection to run() for testability

**Files:**
- Modify: `~/gsd-init/bin/gsd-init.js` (make OBS_ROOT and projDir injectable via env)

- [ ] **Step 1: Update the constants and run() to respect env overrides**

In `~/gsd-init/bin/gsd-init.js`, replace the `OBS_ROOT` constant and `run()` projection so tests can inject:

Replace:
```js
const OBS_ROOT = path.join(os.homedir(), '.claude', 'gsd-observer');
```

With:
```js
const OBS_ROOT = process.env.GSD_INIT_OBS_ROOT || path.join(os.homedir(), '.claude', 'gsd-observer');
```

In `run()`, replace:
```js
var projDir = process.cwd();
```

With:
```js
var projDir = process.env.GSD_INIT_PROJ_DIR || process.cwd();
```

Also update the install step 1 to use the (possibly overridden) `OBS_ROOT`:
The `run()` function already uses `OBS_ROOT` (module-level constant) — since we changed it to read from env at module load time, it will pick up the override correctly.

- [ ] **Step 2: Run integration test to verify it passes**

```bash
cd ~/gsd-init && node tests/test-integration.js
```

Expected:
```
  ✓ full install with --yes creates all template files
  ✓ all 7 .sh files are chmod 755 after install
  ✓ settings.json is created with Stop hook
  ✓ hook command uses literal tilde (not expanded path)
  ✓ output includes "Done! Next steps:" summary
  ✓ second run with --yes shows [overwrite] for existing files
  ✓ second run with --yes shows [skip] for settings.json
  ✓ -y flag works same as --yes

Results: 8 passed, 0 failed
```

- [ ] **Step 3: Run full test suite**

```bash
cd ~/gsd-init && npm test
```

Expected: all tests pass across all 3 test files.

- [ ] **Step 4: Commit**

```bash
cd ~/gsd-init && git add bin/gsd-init.js && git commit -m "feat: support GSD_INIT_OBS_ROOT and GSD_INIT_PROJ_DIR env overrides for testing"
```

---

### Task 9: Manual smoke test + npm publish prep

**Files:**
- Create: `~/gsd-init/README.md`

- [ ] **Step 1: Write README.md**

Create `~/gsd-init/README.md`:

````markdown
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
````

- [ ] **Step 2: Verify npm pack dry run (lists files that would be published)**

```bash
cd ~/gsd-init && npm pack --dry-run
```

Expected: lists `bin/gsd-init.js`, `templates/**`, `README.md`. Does NOT include `tests/`.

- [ ] **Step 3: Smoke test — run CLI manually against a temp project directory**

```bash
SMOKE_DIR=$(mktemp -d)
cd ~/gsd-init && GSD_INIT_OBS_ROOT="$SMOKE_DIR/obs" GSD_INIT_PROJ_DIR="$SMOKE_DIR/proj" \
  node bin/gsd-init.js --yes
```

Expected: prints dry-run table, installs files, prints "Done! Next steps:".

- [ ] **Step 4: Verify smoke test output structure**

```bash
find "$SMOKE_DIR" -type f | sort
```

Expected: 10 template files under `$SMOKE_DIR/obs/`, `.claude/settings.json` under `$SMOKE_DIR/proj/`.

- [ ] **Step 5: Final commit**

```bash
cd ~/gsd-init && git add README.md && git commit -m "docs: add README with usage and install instructions"
```

- [ ] **Step 6: Run final full test suite**

```bash
cd ~/gsd-init && npm test
```

Expected: all tests pass.

---

## Summary

| Chunk | Tasks | Key deliverables |
|-------|-------|-----------------|
| 1 | 1-2 | Package structure + 10 template files |
| 2 | 3-5 | `planInstall`, `mergeSettings`, `copyTemplates`, `chmodScripts` with unit tests |
| 3 | 6-9 | `run()` entrypoint, integration test, smoke test, README |

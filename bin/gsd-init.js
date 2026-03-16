#!/usr/bin/env node
'use strict';
// Node version check — must use syntax valid in Node 14+ for compatibility
var major = parseInt(process.version.slice(1).split('.')[0], 10);
if (major < 16) {
  process.stderr.write('gsd-init requires Node.js >= 16 (found ' + process.version + ')\n');
  process.exit(1);
}
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');
const OBS_ROOT = process.env.GSD_INIT_OBS_ROOT || path.join(os.homedir(), '.claude', 'gsd-observer');

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
  var data;
  try { data = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); }
  catch (e) { return '[error]'; }
  var stopArr = (data.hooks && data.hooks.Stop) ? data.hooks.Stop : [];
  var alreadyRegistered = stopArr.some(function(entry) {
    return JSON.stringify(entry).includes('gsd-stop-hook.sh');
  });
  return alreadyRegistered ? '[skip]' : '[merge]';
}

function planInstall(tmplDir, obsRoot, projDir) {
  var homeDir = os.homedir();
  var ops = [];
  for (var i = 0; i < TEMPLATE_FILES.length; i++) {
    var f = TEMPLATE_FILES[i];
    var dest = path.join(obsRoot, f.dst);
    var label = fs.existsSync(dest) ? '[overwrite]' : '[create]';
    var relDisplay = dest.startsWith(homeDir)
      ? '~' + dest.slice(homeDir.length)
      : dest;
    ops.push({ dest: dest, label: label, relative: relDisplay });
  }
  var settingsPath = path.join(projDir, '.claude', 'settings.json');
  ops.push({ dest: settingsPath, label: getSettingsLabel(settingsPath), relative: '.claude/settings.json' });
  return ops;
}

// Stubs — implemented in later tasks
function formatDryRun(ops) {
  var lines = ['gsd-init — GSD Observer/Worker setup', '', 'Files to install:'];
  for (var i = 0; i < ops.length; i++) {
    var op = ops[i];
    // Pad label to 14 chars for alignment: '[create]' is 8, '[overwrite]' is 11, '[merge]' is 7, '[skip]' is 6
    var padded = op.label + ' '.repeat(Math.max(1, 14 - op.label.length));
    lines.push('  ' + padded + op.relative);
  }
  return lines.join('\n');
}
function mkdirpSync(dir) { fs.mkdirSync(dir, { recursive: true }); }
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
    '  3. Run GSD in the Worker tmux pane — Observer will co-pilot automatically.',
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
  var projDir = process.env.GSD_INIT_PROJ_DIR || process.cwd();

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
  try { copyTemplates(TEMPLATES_DIR, OBS_ROOT); }
  catch (e) { console.error('Error copying templates to ' + OBS_ROOT + ': ' + e.message); process.exit(1); }

  // Step 4: chmod .sh files
  try { chmodScripts(OBS_ROOT); }
  catch (e) { console.error('Error setting permissions in ' + OBS_ROOT + ': ' + e.message); process.exit(1); }

  // Step 5: merge settings.json
  try { mergeSettings(projDir, GSD_ENTRY); }
  catch (e) { console.error(e.message); process.exit(1); }

  printSummary();
}

if (require.main === module) {
  run().catch(function(e) { console.error(e.message); process.exit(1); });
}

module.exports = {
  planInstall, getSettingsLabel, formatDryRun, mkdirpSync,
  copyTemplates, chmodScripts, mergeSettings, printSummary,
  TEMPLATE_FILES, SH_FILES, GSD_ENTRY
};

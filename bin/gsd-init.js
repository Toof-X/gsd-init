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
const readline = require('readline');

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');

const TEMPLATE_FILES = [
  { src: 'agents/gsd-observer.md',              dst: 'agents/gsd-observer.md' },
  { src: 'hooks/gsd-stop-hook.sh',              dst: 'hooks/gsd-stop-hook.sh' },
  { src: 'hooks/gsd-session-end-hook.sh',       dst: 'hooks/gsd-session-end-hook.sh' },
  { src: 'scripts/start-observer.sh',           dst: 'scripts/start-observer.sh' },
  { src: 'scripts/start-worker.sh',             dst: 'scripts/start-worker.sh' },
  { src: 'scripts/wake-observer.sh',            dst: 'scripts/wake-observer.sh' },
  { src: 'scripts/notify-worker.sh',            dst: 'scripts/notify-worker.sh' },
  { src: 'scripts/teardown.sh',                 dst: 'scripts/teardown.sh' },
  { src: 'scripts/listen.sh',                   dst: 'scripts/listen.sh' },
  { src: 'scripts/start.sh',                    dst: 'scripts/start.sh' },
  { src: 'scripts/verify.sh',                   dst: 'scripts/verify.sh' },
  { src: 'schema/event.json',                   dst: 'schema/event.json' },
  { src: 'schema/response.json',                dst: 'schema/response.json' },
];

const SH_FILES = [
  'hooks/gsd-stop-hook.sh',
  'hooks/gsd-session-end-hook.sh',
  'scripts/start-observer.sh',
  'scripts/start-worker.sh',
  'scripts/wake-observer.sh',
  'scripts/notify-worker.sh',
  'scripts/teardown.sh',
  'scripts/listen.sh',
  'scripts/start.sh',
  'scripts/verify.sh',
];

function gsdRoot(projDir) {
  return process.env.GSD_INIT_OBS_ROOT || path.join(projDir, '.gsd');
}

function makeGsdStopEntry(projDir) {
  return {
    matcher: '',
    hooks: [{ type: 'command', command: path.join(gsdRoot(projDir), 'hooks', 'gsd-stop-hook.sh') }]
  };
}

function makeGsdSessionEndEntry(projDir) {
  return {
    matcher: '',
    hooks: [{ type: 'command', command: path.join(gsdRoot(projDir), 'hooks', 'gsd-session-end-hook.sh') }]
  };
}

// Keep old name as alias for backwards compat
function makeGsdEntry(projDir) { return makeGsdStopEntry(projDir); }

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
  var ops = [];
  for (var i = 0; i < TEMPLATE_FILES.length; i++) {
    var f = TEMPLATE_FILES[i];
    var dest = path.join(obsRoot, f.dst);
    var label = fs.existsSync(dest) ? '[overwrite]' : '[create]';
    // Display relative to projDir
    var rel = path.relative(projDir, dest);
    ops.push({ dest: dest, label: label, relative: rel });
  }
  var settingsPath = path.join(projDir, '.claude', 'settings.json');
  ops.push({ dest: settingsPath, label: getSettingsLabel(settingsPath), relative: '.claude/settings.json' });
  return ops;
}

function formatDryRun(ops) {
  var lines = ['gsd-init — GSD Observer/Worker setup', '', 'Files to install:'];
  for (var i = 0; i < ops.length; i++) {
    var op = ops[i];
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
    try { fs.chmodSync(path.join(obsRoot, SH_FILES[i]), 0o755); }
    catch (e) { /* ignore */ }
  }
}
function mergeSettings(projDir, stopEntry, sessionEndEntry) {
  var settingsPath = path.join(projDir, '.claude', 'settings.json');
  if (!fs.existsSync(settingsPath)) {
    var newData = { hooks: { Stop: [stopEntry], SessionEnd: [sessionEndEntry] } };
    fs.writeFileSync(settingsPath, JSON.stringify(newData, null, 2) + '\n');
    return;
  }
  var raw = fs.readFileSync(settingsPath, 'utf8');
  var data;
  try { data = JSON.parse(raw); }
  catch (e) { throw new Error('Malformed JSON in ' + settingsPath + ': ' + e.message); }

  if (!data.hooks) data.hooks = {};

  var stopArr = (data.hooks && data.hooks.Stop) ? data.hooks.Stop : [];
  var stopRegistered = stopArr.some(function(e) {
    return JSON.stringify(e).includes('gsd-stop-hook.sh');
  });
  if (!stopRegistered) {
    if (!data.hooks.Stop) data.hooks.Stop = [];
    data.hooks.Stop.push(stopEntry);
  }

  var endArr = (data.hooks && data.hooks.SessionEnd) ? data.hooks.SessionEnd : [];
  var endRegistered = endArr.some(function(e) {
    return JSON.stringify(e).includes('gsd-session-end-hook.sh');
  });
  if (!endRegistered) {
    if (!data.hooks.SessionEnd) data.hooks.SessionEnd = [];
    data.hooks.SessionEnd.push(sessionEndEntry);
  }

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

function printSummary(projDir, projectName) {
  var gsdScripts = path.join(gsdRoot(projDir), 'scripts');
  var name = projectName || path.basename(projDir);
  console.log([
    '',
    'Done! Next steps:',
    '  ' + path.join(gsdScripts, 'start.sh'),
    '',
    '  Creates tmux sessions gsd-observer-' + name + ' and gsd-worker-' + name + '.',
    '  Opens Terminal windows attached to each session.',
    '',
    '  Observer agent: ' + path.join(gsdRoot(projDir), 'agents', 'gsd-observer.md'),
    '  Verify setup:   ' + path.join(gsdScripts, 'verify.sh'),
  ].join('\n'));
}

async function run() {
  var args = process.argv.slice(2);
  var skipPrompt = args.indexOf('--yes') !== -1 || args.indexOf('-y') !== -1;
  var positional = args.filter(function(a) { return !a.startsWith('-'); });
  var projectName = positional[0] || null;

  var projDir;
  if (process.env.GSD_INIT_PROJ_DIR) {
    projDir = process.env.GSD_INIT_PROJ_DIR;
  } else if (projectName) {
    projDir = path.join(process.cwd(), projectName);
  } else {
    projDir = process.cwd();
  }
  var obsRoot = gsdRoot(projDir);
  var gsdStopEntry = makeGsdStopEntry(projDir);
  var gsdSessionEndEntry = makeGsdSessionEndEntry(projDir);

  var ops = planInstall(TEMPLATES_DIR, obsRoot, projDir);

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

  // Step 0: create project folder if a name was given
  if (projectName) {
    try { mkdirpSync(projDir); }
    catch (e) { console.error('Error creating project folder ' + projDir + ': ' + e.message); process.exit(1); }
  }

  // Step 1: create .gsd/ subdirs
  var subdirs = ['agents', 'hooks', 'scripts', 'schema'];
  for (var j = 0; j < subdirs.length; j++) {
    var subdir = path.join(obsRoot, subdirs[j]);
    try { mkdirpSync(subdir); }
    catch (e) { console.error('Error creating ' + subdir + ': ' + e.message); process.exit(1); }
  }

  // Step 2: create project .claude/
  var dotClaudeDir = path.join(projDir, '.claude');
  try { mkdirpSync(dotClaudeDir); }
  catch (e) { console.error('Error creating ' + dotClaudeDir + ': ' + e.message); process.exit(1); }

  // Step 3: copy templates
  try { copyTemplates(TEMPLATES_DIR, obsRoot); }
  catch (e) { console.error('Error copying templates to ' + obsRoot + ': ' + e.message); process.exit(1); }

  // Step 4: chmod .sh files
  try { chmodScripts(obsRoot); }
  catch (e) { console.error('Error setting permissions in ' + obsRoot + ': ' + e.message); process.exit(1); }

  // Step 5: merge settings.json
  try { mergeSettings(projDir, gsdStopEntry, gsdSessionEndEntry); }
  catch (e) { console.error(e.message); process.exit(1); }

  printSummary(projDir, projectName);
}

if (require.main === module) {
  run().catch(function(e) { console.error(e.message); process.exit(1); });
}

module.exports = {
  planInstall, getSettingsLabel, formatDryRun, mkdirpSync,
  copyTemplates, chmodScripts, mergeSettings, printSummary,
  TEMPLATE_FILES, SH_FILES, makeGsdEntry, makeGsdStopEntry, makeGsdSessionEndEntry, gsdRoot, run
};

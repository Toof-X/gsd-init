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

// Stubs — implemented in later tasks
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

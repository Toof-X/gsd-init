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

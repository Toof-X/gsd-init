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

// Case 5b: hook registered with different matcher but same command
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

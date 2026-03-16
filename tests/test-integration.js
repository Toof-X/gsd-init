'use strict';
// Integration test: runs the full install flow in a temp dir using --yes flag.
// Does NOT modify ~/.claude/gsd-observer or any real system directories.

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');

const GSD_INIT = path.join(__dirname, '..', 'bin', 'gsd-init.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓ ' + name); passed++; }
  catch (e) { console.log('  ✗ ' + name + ': ' + e.message); failed++; }
}

// Helper: run gsd-init.js with env var injection into temp dirs
function runGsdInit(projDir, obsRoot, extraArgs) {
  var args = [GSD_INIT].concat(extraArgs || []);
  var env = Object.assign({}, process.env, {
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

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-integ-'));
const obsRoot = path.join(tmpDir, 'gsd-observer');
const projDir = path.join(tmpDir, 'project');
fs.mkdirSync(projDir, { recursive: true });

test('full install with --yes creates all template files', () => {
  runGsdInit(projDir, obsRoot, ['--yes']);

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
    assert.strictEqual(perms, 0o755, f + ' should be 0755, got 0' + perms.toString(8));
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

#!/usr/bin/env node
'use strict';
var major = parseInt(process.version.slice(1).split('.')[0], 10);
if (major < 16) {
  process.stderr.write('gsd requires Node.js >= 16 (found ' + process.version + ')\n');
  process.exit(1);
}
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const cmd = args[0];

function findScript(name) {
  var p = path.join(process.cwd(), '.gsd', 'scripts', name);
  if (!fs.existsSync(p)) {
    console.error('Error: ' + p + ' not found. Run "gsd-init init <project-name>" first.');
    process.exit(1);
  }
  return p;
}

function runScript(name) {
  var script = findScript(name);
  execFileSync(script, { stdio: 'inherit' });
}

switch (cmd) {
  case 'init': {
    var projectName = args[1];
    if (!projectName) {
      console.error('Usage: gsd init <project-name>');
      process.exit(1);
    }
    // Pass --yes: providing the project name is already explicit confirmation
    process.argv = [process.argv[0], process.argv[1], projectName, '--yes'];
    require('./gsd-init.js').run().catch(function(e) {
      console.error(e.message);
      process.exit(1);
    });
    break;
  }
  case 'start':
    runScript('start.sh');
    break;
  case 'teardown':
    runScript('teardown.sh');
    break;
  default:
    console.log([
      'Usage:',
      '  gsd-init init <project-name>   Create project folder and install GSD',
      '  gsd-init start                 Start observer + worker tmux sessions',
      '  gsd-init teardown              Kill all GSD tmux sessions',
    ].join('\n'));
    process.exit(cmd ? 1 : 0);
}

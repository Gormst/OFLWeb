const { spawn } = require('child_process');

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function runScript(scriptName) {
  if (process.platform === 'win32') {
    return spawn('cmd.exe', ['/d', '/s', '/c', `npm run ${scriptName}`], { stdio: 'inherit' });
  }
  return spawn(npmCmd, ['run', scriptName], { stdio: 'inherit' });
}

const processes = [runScript('dev:api'), runScript('dev:web')];

let shuttingDown = false;

function stopAll(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of processes) {
    if (!child.killed) child.kill();
  }
  process.exit(code);
}

for (const child of processes) {
  child.on('exit', code => {
    if (!shuttingDown) stopAll(code || 0);
  });
}

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));

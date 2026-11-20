import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import qrcode from 'qrcode-terminal';
import { KIMO_VERSION } from './version';
import {
  isProcessAlive,
  logPath,
  readState,
  removeState,
  stateDir,
  statePath
} from './state';

const LIB_DIR = process.env.KIMO_LIB_DIR || __dirname;
const SERVER_ENTRY = process.env.KIMO_SERVER_ENTRY || path.join(LIB_DIR, 'kimo-server.cjs');
const PORT = parseInt(process.env.PORT || '4242', 10);

interface RemoteStatus {
  server?: string;
  serverName?: string;
  version?: string;
  backend?: string;
  pairedDevices?: number;
  usb?: { available: boolean; path: string; devices: Array<{ serial: string; state: string }> };
}

function color(code: string, text: string): string {
  return process.stdout.isTTY ? `\x1b[${code}m${text}\x1b[0m` : text;
}

function ok(text: string): string {
  return color('32', `✔ ${text}`);
}

function warn(text: string): string {
  return color('33', `⚠ ${text}`);
}

function fail(text: string): string {
  return color('31', `✘ ${text}`);
}

function rotateLog(): void {
  try {
    const file = logPath();
    if (!fs.existsSync(file)) return;
    const stat = fs.statSync(file);
    if (stat.size > 5 * 1024 * 1024) {
      fs.renameSync(file, `${file}.1`);
    }
  } catch {}
}

function ensureDir(): void {
  fs.mkdirSync(stateDir(), { recursive: true, mode: 0o700 });
}

function probeStatus(host = '127.0.0.1', port = PORT, timeoutMs = 1200): Promise<RemoteStatus | null> {
  return new Promise((resolve) => {
    const req = http.get({ host, port, path: '/status', timeout: timeoutMs }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve(parsed && parsed.server === 'PocketInput' ? parsed : null);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.on('error', () => resolve(null));
  });
}

function looksLikeKimo(pid: number): boolean {
  try {
    const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ');
    return /kimo-server|kimo-cli|pocketinput/i.test(cmdline);
  } catch {
    return true;
  }
}

function findAdb(): string | null {
  const envPath = process.env.ADB_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, 'adb');
    if (fs.existsSync(candidate)) return candidate;
  }
  const candidates = [
    path.join(os.homedir(), 'Android', 'Sdk', 'platform-tools', 'adb'),
    '/usr/lib/android-sdk/platform-tools/adb',
    '/opt/android-sdk/platform-tools/adb',
    '/usr/local/bin/adb'
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function waitForState(expectedPid: number, timeoutMs = 6000): boolean {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = readState();
    if (state && state.pid === expectedPid && isProcessAlive(state.pid)) return true;
    if (state && state.pid !== expectedPid && isProcessAlive(state.pid)) return true;
    sleep(100);
  }
  return false;
}

function sleep(ms: number): void {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.max(1, end - Date.now()));
    } catch {
      break;
    }
  }
}

async function startServer(quiet = false): Promise<number> {
  const existing = readState();
  if (existing && isProcessAlive(existing.pid)) {
    console.log(warn(`kiMo is already running (pid ${existing.pid}).`));
    return 0;
  }
  if (existing) removeState();

  if (!fs.existsSync(SERVER_ENTRY)) {
    console.error(fail(`Server bundle not found: ${SERVER_ENTRY}`));
    console.error('Reinstall the package or set KIMO_SERVER_ENTRY.');
    return 1;
  }

  ensureDir();
  rotateLog();
  const fd = fs.openSync(logPath(), 'a');
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    detached: true,
    stdio: ['ignore', fd, fd],
    env: { ...process.env, KIMO_QUIET: '1' }
  });
  child.unref();
  fs.closeSync(fd);

  if (!waitForState(child.pid || 0)) {
    console.error(fail('The kiMo server did not start in time.'));
    console.error(`Check the log: ${logPath()}`);
    return 1;
  }

  if (!quiet) {
    await printStatus();
  }
  return 0;
}

function stopServer(force = false): number {
  const state = readState();
  if (!state || !isProcessAlive(state.pid)) {
    removeState();
    console.log(warn('kiMo is not running.'));
    return 0;
  }
  if (!looksLikeKimo(state.pid)) {
    console.error(fail(`Refusing to stop pid ${state.pid}: it does not look like a kiMo process.`));
    return 1;
  }

  try {
    process.kill(state.pid, 'SIGTERM');
  } catch (err: any) {
    console.error(fail(`Could not stop pid ${state.pid}: ${err?.message || err}`));
    return 1;
  }

  for (let i = 0; i < 30; i++) {
    if (!isProcessAlive(state.pid)) {
      removeState();
      console.log(ok('kiMo stopped.'));
      return 0;
    }
    sleep(100);
  }

  if (force) {
    try {
      process.kill(state.pid, 'SIGKILL');
      removeState();
      console.log(ok('kiMo stopped (forced).'));
      return 0;
    } catch {}
  }

  console.error(warn(`kiMo (pid ${state.pid}) is still shutting down.`));
  return 1;
}

function printQr(url: string): void {
  qrcode.generate(url, { small: true });
}

async function printStatus(asJson = false): Promise<number> {
  const state = readState();
  if (!state || !isProcessAlive(state.pid)) {
    removeState();
    if (asJson) console.log(JSON.stringify({ running: false }));
    else console.log(warn('kiMo is not running. Start it with: kimo start'));
    return 1;
  }

  const remote = await probeStatus('127.0.0.1', state.port);
  const url = `http://${state.primaryIp}:${state.port}/`;
  const adb = remote?.usb;

  if (asJson) {
    console.log(JSON.stringify({ running: true, state, remote, url }, null, 2));
    return 0;
  }

  console.log(`\n${color('1', 'kiMo Companion')} v${state.version} (pid ${state.pid})`);
  console.log(`Status: ${remote ? ok('running') : warn('process alive, HTTP not responding')}`);
  console.log(`Network: ${state.primaryIp}:${state.port}`);
  if (state.endpoints.length > 1) {
    for (const ep of state.endpoints.slice(1)) {
      console.log(`         ${ep.address} (${ep.label})`);
    }
  }
  console.log(`Web: ${url}`);
  console.log(`\n${color('1', 'Pairing PIN:')} ${color('1;32', state.pin)}`);
  console.log('The PIN rotates after each successful pairing.\n');

  if (adb) {
    if (!adb.available) {
      console.log(warn('USB/ADB: adb not found on this PC. Install platform-tools for USB mode.'));
    } else if (adb.devices.length === 0) {
      console.log(warn('USB/ADB: no device connected (USB mode unavailable until the phone is plugged in).'));
    } else {
      for (const device of adb.devices) {
        const label = device.state === 'device' ? ok(device.state) : warn(device.state);
        console.log(`USB/ADB: ${device.serial} (${label})`);
      }
    }
  }

  printQr(url);
  return 0;
}

function doctor(): number {
  const checks: Array<{ name: string; state: 'ok' | 'warn' | 'fail'; detail: string }> = [];
  const add = (name: string, state: 'ok' | 'warn' | 'fail', detail: string) => checks.push({ name, state, detail });

  add('Platform', os.platform() === 'linux' ? 'ok' : 'fail', `${os.platform()} ${os.arch()}`);
  add('Runtime', fs.existsSync(process.execPath) ? 'ok' : 'fail', process.execPath);
  add('Server bundle', fs.existsSync(SERVER_ENTRY) ? 'ok' : 'fail', SERVER_ENTRY);
  add('State directory', fs.existsSync(stateDir()) ? 'ok' : 'warn', stateDir());

  const py = spawnSync('python3', ['--version'], { encoding: 'utf8' });
  add('Python 3', py.status === 0 ? 'ok' : 'fail', (py.stdout || py.stderr || 'not found').trim());

  const pythonHelper = path.join(LIB_DIR, 'uinput_daemon.py');
  add('Input helper', fs.existsSync(pythonHelper) ? 'ok' : 'fail', pythonHelper);

  let uinput = false;
  try {
    fs.accessSync('/dev/uinput', fs.constants.W_OK);
    uinput = true;
    add('/dev/uinput', 'ok', 'writable');
  } catch (err: any) {
    add('/dev/uinput', 'warn', `${err?.code || 'inaccessible'}; install the udev rule and log out/in`);
  }

  const ydotool = spawnSync('ydotool', ['--help'], { encoding: 'utf8' });
  const hasYdotool = ydotool.status === 0 || /Usage/i.test(`${ydotool.stdout}${ydotool.stderr}`);
  add('ydotool fallback', hasYdotool ? 'ok' : 'warn', hasYdotool ? 'available' : 'not installed');
  add('Input path', uinput || hasYdotool ? 'ok' : 'fail', uinput ? '/dev/uinput' : hasYdotool ? 'ydotool' : 'no working input method');

  const adbPath = findAdb();
  const adb = adbPath ? spawnSync(adbPath, ['version'], { encoding: 'utf8' }) : { status: 1, stdout: '', stderr: '' };
  add('adb (USB mode)', adb.status === 0 ? 'ok' : 'warn', adb.status === 0 ? adbPath! : 'not installed (sudo apt install adb)');

  const session = process.env.XDG_SESSION_TYPE || 'unknown';
  add('Display session', session === 'wayland' || session === 'x11' ? 'ok' : 'warn', session);

  const state = readState();
  const running = Boolean(state && isProcessAlive(state.pid));
  add('Companion process', running ? 'ok' : 'warn', running ? `pid ${state?.pid}` : 'not running');

  console.log(`\n${color('1', 'kiMo doctor')}\n`);
  for (const check of checks) {
    const mark = check.state === 'ok' ? ok(check.name) : check.state === 'warn' ? warn(check.name) : fail(check.name);
    console.log(`${mark}: ${check.detail}`);
  }

  const failures = checks.filter((c) => c.state === 'fail').length;
  const warnings = checks.filter((c) => c.state === 'warn').length;
  console.log(`\n${failures === 0 ? ok('No blocking problems found') : fail(`${failures} blocking problem(s)`)}${warnings ? `, ${warnings} warning(s)` : ''}.`);
  return failures === 0 ? 0 : 1;
}

function installService(): number {
  const unitDir = path.join(os.homedir(), '.config', 'systemd', 'user');
  const unitPath = path.join(unitDir, 'kimo.service');
  fs.mkdirSync(unitDir, { recursive: true });
  fs.writeFileSync(unitPath, `[Unit]
Description=kiMo PC Companion
After=graphical-session.target
PartOf=graphical-session.target

[Service]
Type=simple
ExecStart=/usr/bin/kimo server
Restart=on-failure
RestartSec=3
Environment=KIMO_QUIET=1

[Install]
WantedBy=default.target
`, { encoding: 'utf8', mode: 0o644 });
  const reload = spawnSync('systemctl', ['--user', 'daemon-reload'], { encoding: 'utf8' });
  const enable = spawnSync('systemctl', ['--user', 'enable', '--now', 'kimo.service'], { encoding: 'utf8' });
  if (reload.status !== 0 || enable.status !== 0) {
    console.error(fail('Could not enable the systemd user service.'));
    console.error((reload.stderr || enable.stderr || '').trim());
    return 1;
  }
  console.log(ok('systemd user service installed and started.'));
  return 0;
}

function uninstallService(): number {
  spawnSync('systemctl', ['--user', 'disable', '--now', 'kimo.service'], { encoding: 'utf8' });
  try {
    fs.unlinkSync(path.join(os.homedir(), '.config', 'systemd', 'user', 'kimo.service'));
  } catch {}
  spawnSync('systemctl', ['--user', 'daemon-reload'], { encoding: 'utf8' });
  console.log(ok('systemd user service removed.'));
  return 0;
}

function notify(): void {
  const state = readState();
  if (!state) return;
  spawnSync('notify-send', ['kiMo', `Companion running on ${state.primaryIp}:${state.port}. Open the kiMo app on your phone.`], {
    encoding: 'utf8'
  });
}

function autostart(): number {
  const state = readState();
  if (state && isProcessAlive(state.pid)) return 0;
  const code = spawnSync(process.execPath, [__filename, 'start', '--quiet'], {
    encoding: 'utf8',
    env: { ...process.env, KIMO_QUIET: '1' }
  }).status;
  if (code === 0) notify();
  return code || 0;
}

function printHelp(): void {
  console.log(`kiMo companion v${KIMO_VERSION}

Usage: kimo <command>

Commands:
  start              Start the companion in the background
  stop [--force]     Stop the companion
  status [--json]    Show network, PIN, USB/ADB state, and QR code
  pin                Print the current pairing PIN
  qr                 Print the web-controller URL as a QR code
  doctor             Diagnose USB input, adb, and runtime problems
  autostart          Start quietly if not already running (used at login)
  server             Run in the foreground (used by systemd)
  service install    Install and start a systemd user service
  service uninstall  Remove the systemd user service
  uninstall          Stop and remove per-user service/state
  version            Print the version
`);
}

async function main(): Promise<number> {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case 'start':
      return startServer(args.includes('--quiet'));
    case 'stop':
      return stopServer(args.includes('--force'));
    case 'status':
      return printStatus(args.includes('--json'));
    case 'pin': {
      const state = readState();
      if (!state || !isProcessAlive(state.pid)) {
        console.error(warn('kiMo is not running.'));
        return 1;
      }
      console.log(state.pin);
      return 0;
    }
    case 'qr': {
      const state = readState();
      if (!state) {
        console.error(warn('kiMo has not written its state yet. Start it first.'));
        return 1;
      }
      printQr(`http://${state.primaryIp}:${state.port}/`);
      return 0;
    }
    case 'doctor':
      return doctor();
    case 'autostart':
      return autostart();
    case 'service':
      if (args[0] === 'install') return installService();
      if (args[0] === 'uninstall') return uninstallService();
      console.error('Usage: kimo service <install|uninstall>');
      return 1;
    case 'uninstall':
      stopServer(false);
      uninstallService();
      removeState();
      console.log('Per-user kiMo files removed. To remove the application: sudo apt remove kimo');
      return 0;
    case 'server': {
      const child = spawn(process.execPath, [SERVER_ENTRY], { stdio: 'inherit', env: process.env });
      const forward = (signal: NodeJS.Signals) => {
        try {
          child.kill(signal);
        } catch {}
      };
      process.on('SIGINT', () => forward('SIGINT'));
      process.on('SIGTERM', () => forward('SIGTERM'));
      return await new Promise<number>((resolve) => {
        child.on('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
        child.on('error', (err) => {
          console.error(fail(`Could not start the server: ${err.message}`));
          resolve(1);
        });
      });
    }
    case 'version':
      console.log(KIMO_VERSION);
      return 0;
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      printHelp();
      return 0;
    default:
      console.error(fail(`Unknown command: ${command}`));
      printHelp();
      return 1;
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error(fail(err?.message || String(err)));
    process.exitCode = 1;
  });

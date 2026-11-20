import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFile, ChildProcess } from 'node:child_process';

interface DeviceEntry {
  serial: string;
  state: string;
}

interface AdbResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

export interface AdbManagerStatus {
  available: boolean;
  path: string;
  devices: Array<{ serial: string; state: string }>;
}

function isExecutable(file: string): boolean {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveAdbPath(): string {
  const envPath = process.env.ADB_PATH;
  if (envPath && isExecutable(envPath)) return envPath;

  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, 'adb');
    if (isExecutable(candidate)) return candidate;
  }

  const candidates = [
    path.join(os.homedir(), 'Android', 'Sdk', 'platform-tools', 'adb'),
    '/usr/lib/android-sdk/platform-tools/adb',
    '/opt/android-sdk/platform-tools/adb',
    '/usr/local/bin/adb'
  ];
  for (const candidate of candidates) {
    if (isExecutable(candidate)) return candidate;
  }
  return 'adb';
}

const TRACKER_RESTART_BASE_MS = 1000;
const TRACKER_RESTART_MAX_MS = 30000;
const SAFETY_POLL_MS = 15000;
const ADB_TIMEOUT_MS = 8000;
const MAX_FRAME_BYTES = 1024 * 1024;

function parseTrackerPayload(payload: string): DeviceEntry[] {
  const entries: DeviceEntry[] = [];
  for (const raw of payload.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim()) continue;
    const sep = line.indexOf('\t');
    if (sep <= 0) continue;
    entries.push({ serial: line.slice(0, sep), state: line.slice(sep + 1).trim() });
  }
  return entries;
}

function parseDevicesOutput(output: string): DeviceEntry[] {
  const entries: DeviceEntry[] = [];
  for (const raw of output.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('List of devices') || line.startsWith('*')) continue;
    const match = line.match(/^(\S+)\s+(.+)$/);
    if (!match) continue;
    const rest = match[2];
    const state = rest.startsWith('no permissions') ? 'no permissions' : rest.split(/\s+/)[0];
    entries.push({ serial: match[1], state });
  }
  return entries;
}

/**
 * Keeps the ADB reverse port-forwarding tunnel (tcp:PORT -> tcp:PORT) in sync with
 * attached USB devices by watching `adb track-devices`.
 *
 * This replaces the old one-shot `adb reverse` at server startup, which silently
 * failed whenever the phone was plugged in after server start or swapped later.
 */
export class AdbManager {
  private readonly adbPath: string;
  private tracker: ChildProcess | null = null;
  private trackerBuffer: Buffer = Buffer.alloc(0);
  private trackerBackoff = TRACKER_RESTART_BASE_MS;
  private restartTimer: NodeJS.Timeout | null = null;
  private safetyPollTimer: NodeJS.Timeout | null = null;
  private fallbackRefreshTimer: NodeJS.Timeout | null = null;
  private stopped = false;
  private started = false;
  private activeSerials = new Set<string>();
  private pendingEnsures = new Set<string>();
  private lastStates = new Map<string, string>();
  private lastEntries: DeviceEntry[] = [];
  private available = false;
  private missingAdbLogged = false;
  private announcedEmptyState = false;

  constructor(private readonly serverPort: number) {
    this.adbPath = resolveAdbPath();
    this.available = this.adbPath !== 'adb' && fs.existsSync(this.adbPath);
  }

  getStatus(): AdbManagerStatus {
    return {
      available: this.available,
      path: this.adbPath,
      devices: this.lastEntries.map((entry) => ({ serial: entry.serial, state: entry.state }))
    };
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.stopped = false;

    console.log(
      `🔎 Watching USB devices via adb (${this.adbPath}) — reverse tcp:${this.serverPort} will auto-apply on plug/swap`
    );
    if (!this.available) {
      console.warn(`⚠️ adb not found at "${this.adbPath}" — USB mode will stay unavailable until it is installed.`);
    }

    this.spawnTracker();
    // Safety net: keeps working even if the tracker dies, and reconciles any drift
    this.safetyPollTimer = setInterval(() => this.queryDevices(), SAFETY_POLL_MS);
    this.queryDevices();
  }

  stop(): void {
    this.stopped = true;
    this.started = false;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.safetyPollTimer) {
      clearInterval(this.safetyPollTimer);
      this.safetyPollTimer = null;
    }
    if (this.fallbackRefreshTimer) {
      clearTimeout(this.fallbackRefreshTimer);
      this.fallbackRefreshTimer = null;
    }
    if (this.tracker) {
      this.tracker.kill();
      this.tracker = null;
    }
  }

  private spawnTracker(): void {
    if (this.stopped) return;

    let child: ChildProcess;
    try {
      child = spawn(this.adbPath, ['track-devices'], { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err: any) {
      this.scheduleTrackerRestart();
      return;
    }

    this.tracker = child;
    this.trackerBackoff = TRACKER_RESTART_BASE_MS;
    this.trackerBuffer = Buffer.alloc(0);

    child.stdout?.on('data', (chunk: Buffer) => this.onTrackerData(chunk));
    child.stderr?.on('data', () => {
      // adb daemon startup noise; intentionally quiet
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
      if (this.tracker === child) this.tracker = null;
      if (err.code === 'ENOENT') this.logAdbMissing();
      if (!this.stopped) this.scheduleTrackerRestart(true);
    });

    child.on('exit', (code, signal) => {
      if (this.tracker === child) this.tracker = null;
      if (!this.stopped) {
        console.warn(
          `⚠️ adb device tracker exited (code=${code ?? signal}) — restarting in ${this.trackerBackoff}ms`
        );
        this.scheduleTrackerRestart();
      }
    });
  }

  private scheduleTrackerRestart(slow = false): void {
    if (this.stopped || this.restartTimer) return;
    const delay = slow ? TRACKER_RESTART_MAX_MS : this.trackerBackoff;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.spawnTracker();
    }, delay);
    this.trackerBackoff = Math.min(this.trackerBackoff * 2, TRACKER_RESTART_MAX_MS);
  }

  /**
   * `adb track-devices` streams 4-hex-digit length-prefixed snapshots of the
   * current device list. Use them as the primary change signal; if the framing
   * is ever unrecognized, fall back to an `adb devices` snapshot.
   */
  private onTrackerData(chunk: Buffer): void {
    this.trackerBuffer = Buffer.concat([this.trackerBuffer, chunk]);

    while (this.trackerBuffer.length >= 4) {
      const lenHex = this.trackerBuffer.subarray(0, 4).toString('ascii');
      if (!/^[0-9a-fA-F]{4}$/.test(lenHex)) {
        this.trackerBuffer = Buffer.alloc(0);
        this.scheduleFallbackRefresh();
        return;
      }
      const frameLen = parseInt(lenHex, 16);
      if (!Number.isFinite(frameLen) || frameLen > MAX_FRAME_BYTES) {
        this.trackerBuffer = Buffer.alloc(0);
        this.scheduleFallbackRefresh();
        return;
      }
      if (this.trackerBuffer.length < 4 + frameLen) return; // wait for the rest

      const payload = this.trackerBuffer.subarray(4, 4 + frameLen).toString('utf8');
      this.trackerBuffer = this.trackerBuffer.subarray(4 + frameLen);
      this.handleSnapshot(parseTrackerPayload(payload));
    }
  }

  private scheduleFallbackRefresh(): void {
    if (this.fallbackRefreshTimer || this.stopped) return;
    this.fallbackRefreshTimer = setTimeout(() => {
      this.fallbackRefreshTimer = null;
      this.queryDevices();
    }, 300);
  }

  private queryDevices(): void {
    this.runAdb(['devices']).then((res) => {
      if (!res.ok) return;
      this.available = true;
      this.handleSnapshot(parseDevicesOutput(res.stdout));
    });
  }

  private handleSnapshot(entries: DeviceEntry[]): void {
    this.lastEntries = entries;
    if (!this.announcedEmptyState) {
      this.announcedEmptyState = true;
      if (!entries.some((e) => e.state === 'device')) {
        console.log(
          '📱 No USB device detected yet — plug in your phone (USB debugging ON); the tunnel will be set up automatically.'
        );
      }
    }

    // Warn (once per transition) about devices that cannot carry the tunnel
    for (const entry of entries) {
      const prev = this.lastStates.get(entry.serial);
      if (prev !== entry.state) {
        this.lastStates.set(entry.serial, entry.state);
        if (entry.state !== 'device') this.warnState(entry);
      }
    }
    for (const serial of [...this.lastStates.keys()]) {
      if (!entries.some((e) => e.serial === serial)) this.lastStates.delete(serial);
    }

    const online = new Set(entries.filter((e) => e.state === 'device').map((e) => e.serial));

    for (const serial of [...this.activeSerials]) {
      if (!online.has(serial)) {
        this.activeSerials.delete(serial);
        this.runAdb(['-s', serial, 'reverse', '--remove', `tcp:${this.serverPort}`]).then(() => {
          console.log(`🔌 USB device ${serial} disconnected — reverse tunnel removed`);
        });
      }
    }

    // Stateless reconciliation: verify the rule actually exists for every online
    // device. Rules can vanish without any device event (e.g. `adb kill-server`,
    // adb daemon crash), which a pure add/remove diff would never notice.
    for (const serial of online) {
      this.ensureReverse(serial);
    }
  }

  private ensureReverse(serial: string): void {
    if (this.pendingEnsures.has(serial)) return;
    this.pendingEnsures.add(serial);

    const spec = `tcp:${this.serverPort} tcp:${this.serverPort}`;
    this.runAdb(['-s', serial, 'reverse', '--list'])
      .then((res) => {
        if (this.stopped) return;
        if (res.ok && res.stdout.includes(spec)) {
          this.activeSerials.add(serial); // already in place — nothing to do
          return;
        }
        this.activeSerials.add(serial);
        return this.applyReverse(serial);
      })
      .finally(() => {
        this.pendingEnsures.delete(serial);
      });
  }

  private applyReverse(serial: string): void {
    // Drop any stale rule for this device first, then establish a fresh tunnel
    this.runAdb(['-s', serial, 'reverse', '--remove', `tcp:${this.serverPort}`])
      .then(() =>
        this.runAdb(['-s', serial, 'reverse', `tcp:${this.serverPort}`, `tcp:${this.serverPort}`])
      )
      .then((res) => {
        if (res.ok) {
          console.log(
            `🔌 ADB reverse active for ${serial}: tcp:${this.serverPort} -> tcp:${this.serverPort} (USB mode ready)`
          );
        } else {
          this.activeSerials.delete(serial);
          console.error(
            `❌ adb reverse failed for ${serial}: ${(res.stderr || 'unknown error').trim()}`
          );
        }
      });
  }

  private warnState(entry: DeviceEntry): void {
    if (entry.state === 'unauthorized') {
      console.warn(
        `⚠️ USB device ${entry.serial} unauthorized — unlock the phone and tap "Allow" on the USB debugging prompt.`
      );
    } else if (entry.state === 'offline') {
      console.warn(`⚠️ USB device ${entry.serial} is offline — unplug and replug the USB cable.`);
    } else if (entry.state === 'no permissions') {
      console.warn(
        `⚠️ adb has no permissions for ${entry.serial} — check udev rules / replug the cable.`
      );
    } else {
      console.warn(
        `⚠️ USB device ${entry.serial} in state "${entry.state}" — USB mode unavailable until it is ready.`
      );
    }
  }

  private logAdbMissing(): void {
    this.available = false;
    if (this.missingAdbLogged) return;
    this.missingAdbLogged = true;
    console.error(
      `❌ adb not found (tried "${this.adbPath}") — USB mode unavailable. Install platform-tools or set ADB_PATH.`
    );
  }

  private runAdb(args: string[]): Promise<AdbResult> {
    return new Promise((resolve) => {
      execFile(this.adbPath, args, { timeout: ADB_TIMEOUT_MS }, (err, stdout, stderr) => {
        if (err && (err as NodeJS.ErrnoException).code === 'ENOENT') this.logAdbMissing();
        else if (!err) this.available = true;
        const out = String(stdout ?? '');
        const errOut = String(stderr ?? '');
        resolve({
          ok: !err,
          stdout: out,
          stderr: err ? errOut || err.message : errOut
        });
      });
    });
  }
}

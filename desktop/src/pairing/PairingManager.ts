import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface PairedDevice {
  token: string;
  name: string;
  platform: string;
  pairedAt: number;
}

export interface AuthResult {
  success: boolean;
  token?: string;
  error?: string;
  retryAfterMs?: number;
}

const MAX_FAILURES = 5;
const LOCKOUT_MS = 60_000;
const MAX_PAIRED_DEVICES = 50;

function resolveStateDir(): string {
  if (process.env.KIMO_STATE_DIR) return process.env.KIMO_STATE_DIR;
  const base = process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state');
  return path.join(base, 'kimo');
}

function legacyStoragePath(): string {
  return path.join(os.homedir(), '.pocketinput_devices.json');
}

export class PairingManager {
  private currentPin: string;
  private pinIssuedAt: number;
  private authorizedTokens = new Map<string, PairedDevice>();
  private failures = new Map<string, { count: number; lockedUntil: number }>();
  private readonly stateDir: string;
  private readonly storagePath: string;

  constructor() {
    this.stateDir = resolveStateDir();
    this.storagePath = path.join(this.stateDir, 'devices.json');
    this.currentPin = this.generatePin();
    this.pinIssuedAt = Date.now();
    this.loadPersistedTokens();
  }

  private ensureStateDir(): void {
    fs.mkdirSync(this.stateDir, { recursive: true, mode: 0o700 });
    try {
      fs.chmodSync(this.stateDir, 0o700);
    } catch {}
  }

  private loadPersistedTokens(): void {
    const read = (file: string): PairedDevice[] => {
      try {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    };

    let list = read(this.storagePath);
    if (list.length === 0) {
      const legacy = read(legacyStoragePath());
      if (legacy.length > 0) {
        list = legacy;
        for (const item of list) {
          if (item && item.token) this.authorizedTokens.set(item.token, item);
        }
        this.savePersistedTokens();
        try {
          fs.unlinkSync(legacyStoragePath());
        } catch {}
        return;
      }
    }

    for (const item of list) {
      if (item && typeof item.token === 'string' && item.token.length > 0) {
        this.authorizedTokens.set(item.token, item);
      }
    }
  }

  private savePersistedTokens(): void {
    try {
      this.ensureStateDir();
      const list = Array.from(this.authorizedTokens.values()).slice(-MAX_PAIRED_DEVICES);
      const tmp = `${this.storagePath}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(list, null, 2), { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(tmp, this.storagePath);
      try {
        fs.chmodSync(this.storagePath, 0o600);
      } catch {}
    } catch {
      // Best effort: pairing still works for this session.
    }
  }

  generatePin(): string {
    return crypto.randomInt(100000, 1000000).toString();
  }

  rotatePin(): void {
    this.currentPin = this.generatePin();
    this.pinIssuedAt = Date.now();
  }

  getPin(): string {
    return this.currentPin;
  }

  getPinIssuedAt(): number {
    return this.pinIssuedAt;
  }

  private isLocked(clientIp: string): { locked: boolean; retryAfterMs: number } {
    const entry = this.failures.get(clientIp);
    if (!entry) return { locked: false, retryAfterMs: 0 };
    const now = Date.now();
    if (entry.lockedUntil > now) {
      return { locked: true, retryAfterMs: entry.lockedUntil - now };
    }
    if (entry.lockedUntil > 0 && entry.lockedUntil <= now) {
      this.failures.delete(clientIp);
    }
    return { locked: false, retryAfterMs: 0 };
  }

  private recordFailure(clientIp: string): { locked: boolean; retryAfterMs: number } {
    const now = Date.now();
    const entry = this.failures.get(clientIp) || { count: 0, lockedUntil: 0 };
    entry.count += 1;
    if (entry.count >= MAX_FAILURES) {
      entry.count = 0;
      entry.lockedUntil = now + LOCKOUT_MS;
      this.failures.set(clientIp, entry);
      return { locked: true, retryAfterMs: LOCKOUT_MS };
    }
    this.failures.set(clientIp, entry);
    return { locked: false, retryAfterMs: 0 };
  }

  authenticate(
    pin?: string,
    token?: string,
    deviceName = 'Unknown',
    platform = 'Unknown',
    clientIp = 'unknown'
  ): AuthResult {
    if (token && this.authorizedTokens.has(token)) {
      return { success: true, token };
    }

    const lock = this.isLocked(clientIp);
    if (lock.locked) {
      return {
        success: false,
        error: 'Too many pairing attempts. Try again shortly.',
        retryAfterMs: lock.retryAfterMs
      };
    }

    if (pin && this.matchesPin(pin)) {
      this.failures.delete(clientIp);
      const newToken = crypto.randomBytes(24).toString('hex');
      this.authorizedTokens.set(newToken, {
        token: newToken,
        name: deviceName.slice(0, 80),
        platform: platform.slice(0, 40),
        pairedAt: Date.now()
      });
      this.trimPairedDevices();
      this.savePersistedTokens();
      this.rotatePin();
      return { success: true, token: newToken };
    }

    const failure = this.recordFailure(clientIp);
    return {
      success: false,
      error: failure.locked
        ? 'Too many pairing attempts. Try again shortly.'
        : 'Invalid pairing PIN or token',
      retryAfterMs: failure.retryAfterMs || undefined
    };
  }

  private matchesPin(pin: string): boolean {
    const provided = Buffer.from(pin.trim(), 'utf8');
    const expected = Buffer.from(this.currentPin, 'utf8');
    if (provided.length !== expected.length) return false;
    return crypto.timingSafeEqual(provided, expected);
  }

  private trimPairedDevices(): void {
    while (this.authorizedTokens.size > MAX_PAIRED_DEVICES) {
      const oldest = this.authorizedTokens.keys().next().value as string | undefined;
      if (!oldest) break;
      this.authorizedTokens.delete(oldest);
    }
  }

  revokeDevice(token: string): boolean {
    const deleted = this.authorizedTokens.delete(token);
    if (deleted) this.savePersistedTokens();
    return deleted;
  }

  revokeAllDevices(): void {
    this.authorizedTokens.clear();
    this.savePersistedTokens();
  }

  getPairedDevices(): PairedDevice[] {
    return Array.from(this.authorizedTokens.values());
  }
}

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface KimoEndpoint {
  name: string;
  address: string;
  type: string;
  label: string;
}

export interface KimoState {
  version: string;
  pid: number;
  port: number;
  discoveryPort: number;
  pin: string;
  pinIssuedAt: number;
  startedAt: number;
  primaryIp: string;
  endpoints: KimoEndpoint[];
}

export function stateDir(): string {
  if (process.env.KIMO_STATE_DIR) return process.env.KIMO_STATE_DIR;
  const base = process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state');
  return path.join(base, 'kimo');
}

export function statePath(): string {
  return path.join(stateDir(), 'state.json');
}

export function logPath(): string {
  return path.join(stateDir(), 'kimo.log');
}

export function ensureStateDir(): void {
  fs.mkdirSync(stateDir(), { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(stateDir(), 0o700);
  } catch {}
}

export function writeState(state: KimoState): void {
  ensureStateDir();
  const target = statePath();
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, target);
  try {
    fs.chmodSync(target, 0o600);
  } catch {}
}

export function readState(): KimoState | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath(), 'utf8'));
    if (!parsed || typeof parsed.pid !== 'number') return null;
    return parsed as KimoState;
  } catch {
    return null;
  }
}

export function removeState(): void {
  try {
    fs.unlinkSync(statePath());
  } catch {}
}

export function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    return err?.code === 'EPERM';
  }
}

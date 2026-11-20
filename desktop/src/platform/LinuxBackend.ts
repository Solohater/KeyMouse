import { spawn, ChildProcess, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { InputBackend } from './InputBackend';
import { LINUX_EVDEV_KEYS, MouseButton, KeyModifier, ShortcutType } from '@pocketinput/shared';

const execFileAsync = promisify(execFile);

function resolveDaemonScript(): string {
  const candidates = [
    process.env.KIMO_UINPUT_DAEMON,
    '/usr/lib/kimo/uinput_daemon.py',
    path.resolve(__dirname, 'uinput_daemon.py'),
    path.resolve(process.cwd(), 'desktop/src/platform/uinput_daemon.py')
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {}
  }
  return candidates[candidates.length - 1];
}

export class LinuxBackend implements InputBackend {
  readonly platformName = 'Linux (Direct /dev/uinput + ydotool fallback)';
  private heldKeys = new Set<number>();
  private heldButtons = new Set<MouseButton>();
  private uinputProcess: ChildProcess | null = null;
  private isUinputReady = false;

  async init(): Promise<void> {
    const daemonScript = resolveDaemonScript();
    try {
      this.uinputProcess = spawn('python3', ['-u', daemonScript], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.uinputProcess.stderr?.on('data', (data) => {
        console.warn('[uinput_daemon stderr]:', data.toString().trim());
      });

      this.uinputProcess.on('exit', (code) => {
        console.log(`[uinput_daemon] exited with code ${code}`);
        this.isUinputReady = false;
        this.uinputProcess = null;
      });

      // Wait for READY signal
      const ready = await new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => resolve(false), 2000);
        this.uinputProcess?.stdout?.once('data', (data) => {
          clearTimeout(timeout);
          if (data.toString().includes('READY')) {
            resolve(true);
          } else {
            resolve(false);
          }
        });
      });

      if (ready) {
        this.isUinputReady = true;
        console.log('✔ Direct Linux /dev/uinput kernel driver active (ultra-low latency, zero sudo)');
        return;
      }
    } catch (e: any) {
      console.warn('Direct uinput init failed, falling back to ydotool:', e.message);
    }

    // Fallback: ydotool
    try {
      await execFileAsync('ydotool', ['debug']);
      console.log('✔ Linux input backend initialized via ydotool fallback');
    } catch {
      console.warn('⚠️ Warning: neither direct /dev/uinput nor ydotoold could be verified.');
    }
  }

  private sendUinput(command: string): boolean {
    if (this.isUinputReady && this.uinputProcess && this.uinputProcess.stdin && !this.uinputProcess.stdin.destroyed) {
      this.uinputProcess.stdin.write(command + '\n');
      return true;
    }
    return false;
  }

  private async runYdotool(args: string[]): Promise<void> {
    try {
      await execFileAsync('ydotool', args);
    } catch (err: any) {
      console.error(`ydotool ${args.join(' ')} failed:`, err.message);
    }
  }

  async moveMouse(dx: number, dy: number): Promise<void> {
    const rx = Math.round(dx);
    const ry = Math.round(dy);
    if (rx === 0 && ry === 0) return;

    if (this.sendUinput(`m ${rx} ${ry}`)) {
      return;
    }
    await this.runYdotool(['mousemove', '--', rx.toString(), ry.toString()]);
  }

  async mouseClick(button: MouseButton, double?: boolean): Promise<void> {
    const btnChar = button === 'right' ? 'r' : button === 'middle' ? 'm' : 'l';
    if (this.sendUinput(`c ${btnChar} ${double ? '1' : '0'}`)) {
      return;
    }

    let hex = '0xC0';
    if (button === 'right') hex = '0xC1';
    if (button === 'middle') hex = '0xC2';

    if (double) {
      await this.runYdotool(['click', '-r', '2', '-D', '50', hex]);
    } else {
      await this.runYdotool(['click', hex]);
    }
  }

  async mouseButton(button: MouseButton, action: 'down' | 'up'): Promise<void> {
    const btnChar = button === 'right' ? 'r' : button === 'middle' ? 'm' : 'l';
    if (action === 'down') {
      this.heldButtons.add(button);
    } else {
      this.heldButtons.delete(button);
    }

    if (this.sendUinput(`b ${btnChar} ${action}`)) {
      return;
    }

    if (action === 'down') {
      let hex = '0x40';
      if (button === 'right') hex = '0x41';
      if (button === 'middle') hex = '0x42';
      await this.runYdotool(['click', hex]);
    } else {
      let hex = '0x80';
      if (button === 'right') hex = '0x81';
      if (button === 'middle') hex = '0x82';
      await this.runYdotool(['click', hex]);
    }
  }

  async scroll(dx: number, dy: number): Promise<void> {
    const rx = Math.round(dx);
    const ry = Math.round(dy);
    if (rx === 0 && ry === 0) return;

    if (this.sendUinput(`w ${rx} ${ry}`)) {
      return;
    }
    await this.runYdotool(['mousemove', '-w', '--', rx.toString(), ry.toString()]);
  }

  private resolveKeyCode(key: string, code?: number): number | null {
    if (code && code > 0) return code;
    if (LINUX_EVDEV_KEYS[key] !== undefined) {
      return LINUX_EVDEV_KEYS[key];
    }
    if (LINUX_EVDEV_KEYS[key.toLowerCase()] !== undefined) {
      return LINUX_EVDEV_KEYS[key.toLowerCase()];
    }
    return null;
  }

  async keyDown(key: string, code?: number, modifiers?: KeyModifier[]): Promise<void> {
    const keyCode = this.resolveKeyCode(key, code);
    if (keyCode === null) {
      console.warn(`Unknown key for keyDown: ${key}`);
      return;
    }

    if (modifiers) {
      for (const mod of modifiers) {
        const modCode = LINUX_EVDEV_KEYS[mod];
        if (modCode && !this.heldKeys.has(modCode)) {
          this.heldKeys.add(modCode);
          this.sendUinput(`k ${modCode} 1`);
        }
      }
    }

    this.heldKeys.add(keyCode);
    if (this.sendUinput(`k ${keyCode} 1`)) {
      return;
    }

    const keyArgs: string[] = [];
    if (modifiers) {
      for (const mod of modifiers) {
        const modCode = LINUX_EVDEV_KEYS[mod];
        if (modCode) keyArgs.push(`${modCode}:1`);
      }
    }
    keyArgs.push(`${keyCode}:1`);
    await this.runYdotool(['key', ...keyArgs]);
  }

  async keyUp(key: string, code?: number): Promise<void> {
    const keyCode = this.resolveKeyCode(key, code);
    if (keyCode === null) {
      console.warn(`Unknown key for keyUp: ${key}`);
      return;
    }

    this.heldKeys.delete(keyCode);
    if (this.sendUinput(`k ${keyCode} 0`)) {
      return;
    }
    await this.runYdotool(['key', `${keyCode}:0`]);
  }

  async keyPress(key: string, code?: number, modifiers?: KeyModifier[]): Promise<void> {
    const keyCode = this.resolveKeyCode(key, code);
    if (keyCode === null) {
      await this.typeText(key);
      return;
    }

    if (this.isUinputReady) {
      const modCodes: number[] = [];
      if (modifiers) {
        for (const mod of modifiers) {
          const modCode = LINUX_EVDEV_KEYS[mod];
          if (modCode) {
            modCodes.push(modCode);
            this.sendUinput(`k ${modCode} 1`);
          }
        }
      }
      this.sendUinput(`k ${keyCode} 1`);
      this.sendUinput(`k ${keyCode} 0`);
      for (let i = modCodes.length - 1; i >= 0; i--) {
        this.sendUinput(`k ${modCodes[i]} 0`);
      }
      return;
    }

    // Fallback: ydotool
    const keySequence: string[] = [];
    const modCodes: number[] = [];
    if (modifiers) {
      for (const mod of modifiers) {
        const modCode = LINUX_EVDEV_KEYS[mod];
        if (modCode) {
          modCodes.push(modCode);
          keySequence.push(`${modCode}:1`);
        }
      }
    }
    keySequence.push(`${keyCode}:1`);
    keySequence.push(`${keyCode}:0`);
    for (let i = modCodes.length - 1; i >= 0; i--) {
      keySequence.push(`${modCodes[i]}:0`);
    }
    await this.runYdotool(['key', ...keySequence]);
  }

  private mapCharToEvdev(ch: string): { code: number; shift: boolean } | null {
    if (ch >= 'a' && ch <= 'z') {
      const code = LINUX_EVDEV_KEYS[ch];
      return code ? { code, shift: false } : null;
    }
    if (ch >= 'A' && ch <= 'Z') {
      const code = LINUX_EVDEV_KEYS[ch.toLowerCase()];
      return code ? { code, shift: true } : null;
    }
    if (ch >= '0' && ch <= '9') {
      const code = LINUX_EVDEV_KEYS[ch];
      return code ? { code, shift: false } : null;
    }
    const shiftedPunctuation: Record<string, string> = {
      '!': '1', '@': '2', '#': '3', '$': '4', '%': '5',
      '^': '6', '&': '7', '*': '8', '(': '9', ')': '0',
      '_': '-', '+': '=', '{': '[', '}': ']', '|': '\\',
      ':': ';', '"': "'", '<': ',', '>': '.', '?': '~'
    };
    if (shiftedPunctuation[ch]) {
      const baseKey = shiftedPunctuation[ch];
      const code = LINUX_EVDEV_KEYS[baseKey];
      if (code) return { code, shift: true };
    }
    const directCode = LINUX_EVDEV_KEYS[ch];
    if (directCode) return { code: directCode, shift: false };
    if (ch === ' ') return { code: 57, shift: false };
    if (ch === '\n') return { code: 28, shift: false };
    if (ch === '\t') return { code: 15, shift: false };
    return null;
  }

  async typeText(text: string): Promise<void> {
    if (!text) return;

    if (this.isUinputReady) {
      let allMapped = true;
      for (const ch of text) {
        if (!this.mapCharToEvdev(ch)) {
          allMapped = false;
          break;
        }
      }
      if (allMapped) {
        for (const ch of text) {
          const mapping = this.mapCharToEvdev(ch)!;
          this.sendUinput(`t ${mapping.code} ${mapping.shift ? '1' : '0'}`);
        }
        return;
      }
    }

    await this.runYdotool(['type', '--', text]);
  }

  async shortcut(type: ShortcutType): Promise<void> {
    const CTRL = LINUX_EVDEV_KEYS['Ctrl'] || 29;
    const ALT = LINUX_EVDEV_KEYS['Alt'] || 56;
    const SHIFT = LINUX_EVDEV_KEYS['Shift'] || 42;
    const SUPER = LINUX_EVDEV_KEYS['Super'] || 125;

    const runCombo = async (mods: number[], key: number) => {
      if (this.isUinputReady) {
        for (const m of mods) this.sendUinput(`k ${m} 1`);
        this.sendUinput(`k ${key} 1`);
        this.sendUinput(`k ${key} 0`);
        for (let i = mods.length - 1; i >= 0; i--) this.sendUinput(`k ${mods[i]} 0`);
      } else {
        const seq = [...mods.map(m => `${m}:1`), `${key}:1`, `${key}:0`, ...mods.reverse().map(m => `${m}:0`)];
        await this.runYdotool(['key', ...seq]);
      }
    };

    switch (type) {
      case 'copy':
        await runCombo([CTRL], 46); // Ctrl+C
        break;
      case 'paste':
        await runCombo([CTRL], 47); // Ctrl+V
        break;
      case 'undo':
        await runCombo([CTRL], 44); // Ctrl+Z
        break;
      case 'redo':
        await runCombo([CTRL, SHIFT], 44); // Ctrl+Shift+Z
        break;
      case 'select_all':
        await runCombo([CTRL], 30); // Ctrl+A
        break;
      case 'cut':
        await runCombo([CTRL], 45); // Ctrl+X
        break;
      case 'save':
        await runCombo([CTRL], 31); // Ctrl+S
        break;
      case 'alt_tab':
        await runCombo([ALT], 15); // Alt+Tab
        break;
      case 'find':
        await runCombo([CTRL], 33); // Ctrl+F
        break;
    }
  }

  async releaseAll(): Promise<void> {
    this.heldKeys.clear();
    this.heldButtons.clear();

    if (this.sendUinput('r')) {
      console.log('✔ Direct /dev/uinput released all held keys & buttons on disconnect');
      return;
    }

    try {
      await this.runYdotool(['key', '29:0', '42:0', '56:0', '125:0']);
      await this.runYdotool(['click', '0x80', '0x81', '0x82']);
    } catch {}
  }
}

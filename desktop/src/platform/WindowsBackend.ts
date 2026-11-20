import { InputBackend } from './InputBackend';
import { MouseButton, KeyModifier, ShortcutType } from '@pocketinput/shared';

export class WindowsBackend implements InputBackend {
  readonly platformName = 'Windows (SendInput)';

  async init(): Promise<void> {
    console.log('Windows input backend initialized');
  }

  async moveMouse(dx: number, dy: number): Promise<void> {
    // Windows SendInput implementation
  }

  async mouseClick(button: MouseButton, double?: boolean): Promise<void> {
    // Windows mouse click
  }

  async mouseButton(button: MouseButton, action: 'down' | 'up'): Promise<void> {
    // Windows mouse button down/up
  }

  async scroll(dx: number, dy: number): Promise<void> {
    // Windows scroll
  }

  async keyDown(key: string, code?: number, modifiers?: KeyModifier[]): Promise<void> {
    // Windows key down
  }

  async keyUp(key: string, code?: number): Promise<void> {
    // Windows key up
  }

  async keyPress(key: string, code?: number, modifiers?: KeyModifier[]): Promise<void> {
    // Windows key press
  }

  async typeText(text: string): Promise<void> {
    // Windows type text
  }

  async shortcut(type: ShortcutType): Promise<void> {
    // Windows shortcut
  }

  async releaseAll(): Promise<void> {
    // Windows release keys
  }
}

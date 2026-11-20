import { MouseButton, KeyModifier, ShortcutType } from '@pocketinput/shared';

export interface InputBackend {
  readonly platformName: string;
  init(): Promise<void>;
  moveMouse(dx: number, dy: number): Promise<void>;
  mouseClick(button: MouseButton, double?: boolean): Promise<void>;
  mouseButton(button: MouseButton, action: 'down' | 'up'): Promise<void>;
  scroll(dx: number, dy: number): Promise<void>;
  keyDown(key: string, code?: number, modifiers?: KeyModifier[]): Promise<void>;
  keyUp(key: string, code?: number): Promise<void>;
  keyPress(key: string, code?: number, modifiers?: KeyModifier[]): Promise<void>;
  typeText(text: string): Promise<void>;
  shortcut(type: ShortcutType): Promise<void>;
  releaseAll(): Promise<void>;
}

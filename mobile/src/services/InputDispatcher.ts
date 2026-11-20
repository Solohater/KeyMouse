import { socketService } from './PocketSocket';
import { bluetoothHidService } from './BluetoothHidService';
import { ShortcutType, MouseButton } from '../../../shared/src/protocol';

export type InputMode = 'socket' | 'bluetooth_hid';

class InputDispatcherClass {
  private mode: InputMode = 'socket';

  setMode(mode: InputMode) {
    this.mode = mode;
  }

  getMode(): InputMode {
    return this.mode;
  }

  isBluetoothMode(): boolean {
    if (this.mode === 'bluetooth_hid') return true;
    if (socketService.getState() === 'connected') return false;
    return bluetoothHidService.getIsConnected();
  }

  sendMouseMove(dx: number, dy: number) {
    if (this.isBluetoothMode()) {
      bluetoothHidService.sendMouseMove(dx, dy);
    } else {
      socketService.send({
        type: 'mouse_move',
        payload: { dx, dy }
      });
    }
  }

  sendMouseClick(button: MouseButton, double = false) {
    if (this.isBluetoothMode()) {
      bluetoothHidService.sendMouseClick(button);
      if (double) {
        setTimeout(() => bluetoothHidService.sendMouseClick(button), 60);
      }
    } else {
      socketService.send({
        type: 'mouse_click',
        payload: { button, double }
      });
    }
  }

  sendMouseButton(button: MouseButton, isDown: boolean) {
    if (this.isBluetoothMode()) {
      bluetoothHidService.sendMouseButton(button, isDown);
    } else {
      socketService.send({
        type: 'mouse_button',
        payload: { button, action: isDown ? 'down' : 'up' }
      });
    }
  }

  sendMouseScroll(dy: number) {
    if (this.isBluetoothMode()) {
      bluetoothHidService.sendMouseScroll(dy);
    } else {
      socketService.send({
        type: 'mouse_scroll',
        payload: { dy }
      });
    }
  }

  sendKeyPress(key: string) {
    if (this.isBluetoothMode()) {
      bluetoothHidService.sendKeyPress(key);
    } else {
      socketService.send({
        type: 'key_press',
        payload: { key }
      });
    }
  }

  sendKeyDown(key: string) {
    if (this.isBluetoothMode()) {
      bluetoothHidService.sendKeyboardKey(key, true);
    } else {
      socketService.send({
        type: 'key_down',
        payload: { key }
      });
    }
  }

  sendKeyUp(key: string) {
    if (this.isBluetoothMode()) {
      bluetoothHidService.sendKeyboardKey(key, false);
    } else {
      socketService.send({
        type: 'key_up',
        payload: { key }
      });
    }
  }

  sendShortcut(keys: string[], serverShortcut?: ShortcutType) {
    if (this.isBluetoothMode()) {
      for (const k of keys) {
        if (['Control', 'Ctrl'].includes(k)) bluetoothHidService.setModifier('ctrl', true);
        else if (['Shift'].includes(k)) bluetoothHidService.setModifier('shift', true);
        else if (['Alt'].includes(k)) bluetoothHidService.setModifier('alt', true);
        else if (['Super', 'Meta', 'Win'].includes(k)) bluetoothHidService.setModifier('super', true);
        else bluetoothHidService.sendKeyPress(k);
      }
      setTimeout(() => bluetoothHidService.releaseAll(), 50);
    } else if (serverShortcut) {
      socketService.send({
        type: 'shortcut',
        payload: { shortcut: serverShortcut }
      });
    }
  }

  setModifier(mod: 'ctrl' | 'alt' | 'shift' | 'super', isPressed: boolean) {
    if (this.isBluetoothMode()) {
      bluetoothHidService.setModifier(mod, isPressed);
    }
  }

  releaseAll() {
    if (this.isBluetoothMode()) {
      bluetoothHidService.releaseAll();
    }
  }
}

export const inputDispatcher = new InputDispatcherClass();

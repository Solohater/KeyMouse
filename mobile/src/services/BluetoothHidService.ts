import { NativeModules, NativeEventEmitter, Platform, PermissionsAndroid } from 'react-native';
import { USB_HID_KEYS, USB_HID_MODIFIERS } from '../../../shared/src/keys';

const { BluetoothHidModule } = NativeModules;

export interface BondedBluetoothDevice {
  name: string;
  address: string;
  isConnected: boolean;
}

export type BluetoothHidState = 'disconnected' | 'connecting' | 'connected' | 'disconnecting' | 'unregistered' | 'registered';

export interface BluetoothHidEvent {
  event: string;
  state?: BluetoothHidState;
  deviceName?: string;
  deviceAddress?: string;
  registered?: boolean;
  message?: string;
}

class BluetoothHidServiceClass {
  private eventEmitter: NativeEventEmitter | null = null;
  private listeners: Set<(event: BluetoothHidEvent) => void> = new Set();
  private isConnected = false;
  private connectedDeviceName = '';
  private activeModifiers = 0;

  constructor() {
    if (Platform.OS === 'android' && BluetoothHidModule) {
      this.eventEmitter = new NativeEventEmitter(BluetoothHidModule);
      this.eventEmitter.addListener('onBluetoothHidStateChange', (event: BluetoothHidEvent) => {
        if (event.state === 'connected') {
          this.isConnected = true;
          this.connectedDeviceName = event.deviceName || 'PC';
        } else if (event.state === 'disconnected') {
          this.isConnected = false;
          this.connectedDeviceName = '';
        }
        for (const listener of this.listeners) {
          listener(event);
        }
      });
    }
  }

  async isSupported(): Promise<boolean> {
    if (Platform.OS !== 'android' || !BluetoothHidModule) return false;
    try {
      return await BluetoothHidModule.isSupported();
    } catch {
      return false;
    }
  }

  /**
   * Android 12+ requires runtime Bluetooth permissions. Older releases grant
   * the legacy BLUETOOTH permissions at install time.
   */
  async requestPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android' || !BluetoothHidModule) return false;
    if (typeof Platform.Version === 'number' && Platform.Version < 31) return true;
    try {
      const permissions = [
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE
      ];
      const result = await PermissionsAndroid.requestMultiple(permissions);
      return permissions.every((permission) => result[permission] === PermissionsAndroid.RESULTS.GRANTED);
    } catch (e) {
      console.warn('Failed to request Bluetooth permissions:', e);
      return false;
    }
  }

  async startHidService(): Promise<boolean> {
    if (!BluetoothHidModule) return false;
    if (!(await this.requestPermissions())) return false;
    try {
      return await BluetoothHidModule.startHidService();
    } catch (e) {
      console.warn('Failed to start HID service:', e);
      return false;
    }
  }

  async stopHidService(): Promise<boolean> {
    if (!BluetoothHidModule) return false;
    try {
      return await BluetoothHidModule.stopHidService();
    } catch {
      return false;
    }
  }

  async getBondedDevices(): Promise<BondedBluetoothDevice[]> {
    if (!BluetoothHidModule) return [];
    if (!(await this.requestPermissions())) return [];
    try {
      return await BluetoothHidModule.getBondedDevices();
    } catch {
      return [];
    }
  }

  async connectToDevice(address: string): Promise<boolean> {
    if (!BluetoothHidModule) return false;
    if (!(await this.requestPermissions())) return false;
    try {
      return await BluetoothHidModule.connectToDevice(address);
    } catch (e) {
      console.warn('Failed to connect to BT device:', e);
      return false;
    }
  }

  async disconnectDevice(): Promise<boolean> {
    if (!BluetoothHidModule) return false;
    try {
      this.isConnected = false;
      return await BluetoothHidModule.disconnectDevice();
    } catch {
      return false;
    }
  }

  async makeDiscoverable(durationSeconds = 120): Promise<boolean> {
    if (!BluetoothHidModule) return false;
    if (!(await this.requestPermissions())) return false;
    try {
      return await BluetoothHidModule.makeDiscoverable(durationSeconds);
    } catch (e) {
      console.warn('Failed to make discoverable:', e);
      return false;
    }
  }

  async enableBluetooth(): Promise<boolean> {
    if (!BluetoothHidModule) return false;
    try {
      return await BluetoothHidModule.enableBluetooth();
    } catch (e) {
      console.warn('Failed to enable Bluetooth:', e);
      return false;
    }
  }

  onStateChange(listener: (event: BluetoothHidEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getIsConnected(): boolean {
    return this.isConnected;
  }

  getConnectedDeviceName(): string {
    return this.connectedDeviceName;
  }

  // Input Dispatching
  sendMouseMove(dx: number, dy: number): void {
    if (!BluetoothHidModule) return;
    BluetoothHidModule.sendMouseMove(dx, dy);
  }

  sendMouseButton(button: 'left' | 'right' | 'middle', isDown: boolean): void {
    if (!BluetoothHidModule) return;
    BluetoothHidModule.sendMouseButton(button, isDown);
  }

  sendMouseClick(button: 'left' | 'right' | 'middle'): void {
    if (!BluetoothHidModule) return;
    BluetoothHidModule.sendMouseClick(button);
  }

  sendMouseScroll(dy: number): void {
    if (!BluetoothHidModule) return;
    BluetoothHidModule.sendMouseScroll(dy);
  }

  setModifier(mod: 'ctrl' | 'alt' | 'shift' | 'super', isPressed: boolean): void {
    const bit = mod === 'ctrl' ? 0x01 : mod === 'shift' ? 0x02 : mod === 'alt' ? 0x04 : 0x08;
    if (isPressed) {
      this.activeModifiers |= bit;
    } else {
      this.activeModifiers &= ~bit;
    }
    if (BluetoothHidModule) {
      BluetoothHidModule.sendKeyboardKey(0, this.activeModifiers, false);
    }
  }

  getActiveModifiers(): number {
    return this.activeModifiers;
  }

  sendKeyboardKey(key: string, isDown: boolean, modifiersMask?: number): void {
    if (!BluetoothHidModule) return;
    const hidCode = USB_HID_KEYS[key] || 0;
    const mask = modifiersMask !== undefined ? modifiersMask : this.activeModifiers;
    BluetoothHidModule.sendKeyboardKey(hidCode, mask, isDown);
  }

  sendKeyPress(key: string, modifiersMask?: number): void {
    if (!BluetoothHidModule) return;
    const hidCode = USB_HID_KEYS[key] || 0;
    const mask = modifiersMask !== undefined ? modifiersMask : this.activeModifiers;
    BluetoothHidModule.sendKeyPress(hidCode, mask);
  }

  releaseAll(): void {
    this.activeModifiers = 0;
    if (!BluetoothHidModule) return;
    BluetoothHidModule.releaseAll();
  }
}

export const bluetoothHidService = new BluetoothHidServiceClass();

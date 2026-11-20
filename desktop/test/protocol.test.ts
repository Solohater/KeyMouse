import { isValidClientMessage, LINUX_EVDEV_KEYS } from '@pocketinput/shared';
import { PairingManager } from '../src/pairing/PairingManager';
import { LinuxBackend } from '../src/platform/LinuxBackend';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function testProtocol() {
  console.log('🧪 Testing Protocol Validation & Key Mappings...');

  // 1. Valid messages
  assert(isValidClientMessage({ type: 'auth', payload: { deviceName: 'Phone', platform: 'Android' } }), 'Valid auth message');
  assert(isValidClientMessage({ type: 'mouse_move', payload: { dx: 10, dy: -5 } }), 'Valid mouse_move message');
  assert(isValidClientMessage({ type: 'mouse_click', payload: { button: 'left' } }), 'Valid mouse_click message');
  assert(isValidClientMessage({ type: 'key_press', payload: { key: 'Enter' } }), 'Valid key_press message');
  assert(isValidClientMessage({ type: 'shortcut', payload: { shortcut: 'copy' } }), 'Valid shortcut message');

  // 2. Invalid messages
  assert(!isValidClientMessage(null), 'Null is invalid');
  assert(!isValidClientMessage({}), 'Empty object is invalid');
  assert(!isValidClientMessage({ type: 'malicious_eval' }), 'Unknown message type is invalid');

  // 3. Key mappings
  assert(LINUX_EVDEV_KEYS['Escape'] === 1, 'Escape is 1');
  assert(LINUX_EVDEV_KEYS['Enter'] === 28, 'Enter is 28');
  assert(LINUX_EVDEV_KEYS['Ctrl'] === 29, 'Ctrl is 29');
  assert(LINUX_EVDEV_KEYS['Alt'] === 56, 'Alt is 56');
  assert(LINUX_EVDEV_KEYS['Shift'] === 42, 'Shift is 42');
  assert(LINUX_EVDEV_KEYS['Super'] === 125, 'Super is 125');
  assert(LINUX_EVDEV_KEYS['F1'] === 59, 'F1 is 59');
  assert(LINUX_EVDEV_KEYS['ArrowUp'] === 103, 'ArrowUp is 103');

  // 4. Pairing Manager
  const pm = new PairingManager();
  const pin = pm.getPin();
  assert(pin.length === 6, 'PIN is 6 digits');

  // Bad pin fails
  const badAuth = pm.authenticate('000000', undefined, 'Hacker', 'Linux');
  assert(!badAuth.success, 'Bad PIN rejected');

  // Good pin succeeds and returns token
  const goodAuth = pm.authenticate(pin, undefined, 'My Android Phone', 'Android');
  assert(goodAuth.success && !!goodAuth.token, 'Good PIN authenticated');

  // Subsequent auth with token succeeds
  const tokenAuth = pm.authenticate(undefined, goodAuth.token, 'My Android Phone', 'Android');
  assert(tokenAuth.success, 'Token authentication succeeded');

  console.log('🎉 Protocol & Pairing Tests Passed!');
}

testProtocol().catch(e => {
  console.error('❌ Test failed:', e);
  process.exit(1);
});

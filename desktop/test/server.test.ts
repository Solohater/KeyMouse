import { WebSocket } from 'ws';
import { createInputBackend } from '../src/platform';
import { PairingManager } from '../src/pairing/PairingManager';
import { PocketServer } from '../src/server/PocketServer';

async function runTest() {
  console.log('🧪 Starting Phase 1 Integration Test...');

  const backend = createInputBackend();
  const pairingManager = new PairingManager();
  const testPort = 4243;
  const server = new PocketServer(backend, pairingManager, { port: testPort, hostIp: '127.0.0.1' });

  await server.start(testPort);
  console.log('✔ Test server started on port', testPort);

  const pin = pairingManager.getPin();
  const ws = new WebSocket(`ws://127.0.0.1:${testPort}`);

  await new Promise<void>((resolve, reject) => {
    ws.on('open', () => {
      console.log('✔ WebSocket client connected');
      resolve();
    });
    ws.on('error', reject);
  });

  // Step 1: Send Auth with PIN
  const authPromise = new Promise<string>((resolve, reject) => {
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'auth_response') {
        if (msg.payload.success) {
          resolve(msg.payload.token);
        } else {
          reject(new Error(msg.payload.error));
        }
      }
    });
  });

  ws.send(JSON.stringify({
    type: 'auth',
    payload: {
      pin,
      deviceName: 'TestRunner Phone',
      platform: 'Android'
    }
  }));

  const authToken = await authPromise;
  console.log('✔ Auth succeeded with token:', authToken);

  // Step 2: Send Mouse Move
  ws.send(JSON.stringify({
    type: 'mouse_move',
    payload: { dx: 15, dy: 15 }
  }));
  console.log('✔ Sent mouse_move event');

  // Step 3: Send Mouse Click
  ws.send(JSON.stringify({
    type: 'mouse_click',
    payload: { button: 'left' }
  }));
  console.log('✔ Sent mouse_click event');

  // Step 4: Send Key Press
  ws.send(JSON.stringify({
    type: 'key_press',
    payload: { key: 'a' }
  }));
  console.log('✔ Sent key_press event');

  // Step 5: Send Shortcut (Ctrl+C)
  ws.send(JSON.stringify({
    type: 'shortcut',
    payload: { shortcut: 'copy' }
  }));
  console.log('✔ Sent shortcut event (Ctrl+C)');

  // Step 6: Ping / Pong check
  const pingPromise = new Promise<void>((resolve) => {
    const handler = (data: any) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'pong') {
        ws.off('message', handler);
        resolve();
      }
    };
    ws.on('message', handler);
  });

  const now = Date.now();
  ws.send(JSON.stringify({
    type: 'ping',
    payload: { timestamp: now }
  }));
  await pingPromise;
  console.log(`✔ Ping-Pong latency: ${Date.now() - now}ms`);

  // Close client and server
  ws.close();
  await new Promise(r => setTimeout(r, 200));
  await server.stop();
  console.log('✔ Test server stopped and keys released successfully');
  console.log('\n🎉 ALL PHASE 1 INTEGRATION TESTS PASSED!');
}

runTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
